import { describe, expect, it } from "vitest";
import { importer } from "ipfs-unixfs-importer";
import * as dagCbor from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { base36 } from "multiformats/bases/base36";
import {
  ContentBundleError,
  encodeSchema,
  openBundle,
  parseBundleManifest,
  parseContentRef,
} from "../src/index.js";
import type { BundleLimits, JsonSchema } from "../src/index.js";

const text = (value: string) => new TextEncoder().encode(value);
const refSchema = { type: "string", "x-content-ref": true };
const manifest = (cid: CID, path = "data.json", type = "application/json") =>
  text(
    `entry:\n  path: ${path}\n  schemaCid: ${cid.toString()}\n  contentType: ${type}\n`,
  );

async function fixture(
  schema: JsonSchema,
  value: unknown,
  files: Record<string, Uint8Array> = {},
  type = "application/json",
) {
  const blocks = new Map<string, Uint8Array>();
  const putSchema = async (definition: JsonSchema) => {
    const block = await encodeSchema(definition);
    blocks.set(block.cid.toString(), block.bytes);
    return block.cid;
  };
  const schemaCid = await putSchema(schema);
  let root: CID | undefined;
  const source = {
    ".bundle.yaml": manifest(schemaCid, "data.json", type),
    "data.json":
      type === "application/json"
        ? text(JSON.stringify(value))
        : text(String(value)),
    ...files,
  };
  for await (const entry of importer(
    Object.entries(source).map(([path, content]) => ({ path, content })),
    {
      put(cid: CID, bytes: Uint8Array) {
        blocks.set(cid.toString(), bytes);
        return cid;
      },
    },
    { cidVersion: 1, rawLeaves: true, wrapWithDirectory: true },
  ))
    root = entry.cid;
  if (!root) throw new Error("No fixture root.");
  const calls: string[] = [];
  const resolveCid = (
    cid: CID,
    options: { signal?: AbortSignal },
  ): Promise<Uint8Array> => {
    options.signal?.throwIfAborted();
    calls.push(cid.toString());
    const bytes = blocks.get(cid.toString());
    if (!bytes) throw new Error(`Missing ${cid.toString()}`);
    return Promise.resolve(bytes);
  };
  return { root, schemaCid, blocks, putSchema, calls, resolveCid };
}

async function read(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      parts.push(next.value);
      length += next.value.length;
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

describe("immutable content bundles", () => {
  it("opens a validated CID snapshot and streams raw data and large attachments", async () => {
    const attachment = new Uint8Array(700_000).fill(17);
    const f = await fixture(
      {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
      { name: "example" },
      { "assets/photo.bin": attachment },
    );
    const bundle = await openBundle(f.root, f);
    expect(bundle.cid.equals(f.root)).toBe(true);
    expect(bundle.manifest.entry.schemaCid.equals(f.schemaCid)).toBe(true);
    expect(
      JSON.parse(
        new TextDecoder().decode(
          await read(await bundle.readFile("data.json")),
        ),
      ),
    ).toEqual({ name: "example" });
    const stream = await bundle.readFile("assets/photo.bin");
    const before = f.calls.length;
    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(first.value?.byteLength).toBeLessThanOrEqual(262_144);
    expect(f.calls.length).toBeGreaterThan(before);
    await reader.cancel();
    expect(await read(await bundle.readFile("assets/photo.bin"))).toEqual(
      attachment,
    );
    await expect(bundle.readFile("../data.json")).rejects.toMatchObject({
      code: "PATH_INVALID",
    });
    await expect(bundle.readFile("assets")).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
    });
    await expect(bundle.readFile("missing")).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
    });
    const copy = bundle.cid;
    copy.bytes.fill(0);
    const descriptor = bundle.manifest;
    descriptor.entry.schemaCid.bytes.fill(0);
    expect(bundle.cid.equals(f.root)).toBe(true);
    expect(bundle.manifest.entry.schemaCid.equals(f.schemaCid)).toBe(true);
  });

  it.each([
    [true, null],
    [{ type: "array", items: { type: "integer" } }, [1, 2]],
    [{ type: "number" }, 1.25],
    [{ type: "boolean" }, true],
  ] satisfies [JsonSchema, unknown][])(
    "accepts JSON-compatible root values",
    async (schema, value) => {
      const f = await fixture(schema, value);
      await expect(openBundle(f.root, f)).resolves.toHaveProperty("readFile");
    },
  );

  it("validates YAML and JSONL without modifying raw bytes", async () => {
    const yaml = await fixture(
      { type: "object", properties: { n: { type: "integer" } } },
      "n: 2",
      {},
      "application/yaml",
    );
    await expect(openBundle(yaml.root, yaml)).resolves.toHaveProperty(
      "manifest",
    );
    const jsonl = await fixture(
      { type: "array", items: { type: "integer" }, minItems: 2 },
      "1\r\n2\r\n",
      {},
      "application/jsonl",
    );
    const bundle = await openBundle(jsonl.root, jsonl);
    expect(
      new TextDecoder().decode(await read(await bundle.readFile("data.json"))),
    ).toBe("1\r\n2\r\n");
    const empty = await fixture({ type: "array" }, "", {}, "application/jsonl");
    await expect(openBundle(empty.root, empty)).resolves.toHaveProperty(
      "manifest",
    );
    const wrong = await fixture(true, "1\n", {}, "application/jsonl");
    await expect(openBundle(wrong.root, wrong)).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
  });

  it("follows content refs from applicable Schema branches and supports cycles", async () => {
    const target = await encodeSchema({
      type: "object",
      properties: { back: refSchema },
    });
    const f = await fixture(
      {
        type: "object",
        properties: {
          literal: { type: "string" },
          a: { $ref: "#/$defs/link" },
          b: { anyOf: [{ type: "integer" }, refSchema] },
          c: { oneOf: [{ type: "null" }, refSchema] },
        },
        $defs: { link: refSchema },
      },
      {
        literal: "json:invalid:missing.json",
        a: `json:${target.cid.toString()}:next.json`,
        b: `yaml:${target.cid.toString()}:next.yaml`,
        c: `jsonl:${(await encodeSchema({ type: "array", items: { type: "integer" } })).cid.toString()}:next.jsonl`,
      },
      {
        "next.json": text("{}"),
        "next.yaml": text("{}"),
        "next.jsonl": text("1\n2"),
      },
    );
    f.blocks.set(target.cid.toString(), target.bytes);
    await f.putSchema({ type: "array", items: { type: "integer" } });
    await expect(openBundle(f.root, f)).resolves.toHaveProperty("manifest");

    const cyclic = await encodeSchema(refSchema);
    const cycle = await fixture(
      refSchema,
      `json:${cyclic.cid.toString()}:data.json`,
    );
    await expect(openBundle(cycle.root, cycle)).resolves.toHaveProperty(
      "manifest",
    );
  });

  it("validates external CID schemas, fragments, anchors and recursive local refs", async () => {
    const external = await encodeSchema({
      $defs: { integer: { type: "integer", $anchor: "number" } },
    });
    const f = await fixture(
      {
        type: "object",
        properties: {
          a: { $ref: `ipfs://${external.cid.toString()}#/$defs/integer` },
          b: { $ref: `ipfs://${external.cid.toString()}#number` },
          nested: { $ref: "#/$defs/tree" },
        },
        $defs: {
          tree: {
            type: "object",
            properties: { child: { $ref: "#/$defs/tree" } },
          },
        },
      },
      { a: 1, b: 2, nested: { child: {} } },
    );
    f.blocks.set(external.cid.toString(), external.bytes);
    await expect(openBundle(f.root, f)).resolves.toHaveProperty("manifest");
    expect(
      f.calls.filter((value) => value === external.cid.toString()),
    ).toHaveLength(1);

    const alternate = await fixture(
      { $ref: `ipfs://${external.cid.toString(base36)}#number` },
      1,
    );
    alternate.blocks.set(external.cid.toString(), external.bytes);
    await expect(openBundle(alternate.root, alternate)).resolves.toHaveProperty(
      "manifest",
    );
  });

  it("validates sub-bundle entry and scopes its refs to the child root", async () => {
    const target = await encodeSchema({ type: "integer" });
    const childSchema = await encodeSchema(refSchema);
    const f = await fixture(refSchema, "bundle:child", {
      "child/.bundle.yaml": manifest(childSchema.cid),
      "child/data.json": text(
        JSON.stringify(`json:${target.cid.toString()}:target.json`),
      ),
      "child/target.json": text("3"),
      "target.json": text('"wrong parent"'),
    });
    f.blocks.set(target.cid.toString(), target.bytes);
    f.blocks.set(childSchema.cid.toString(), childSchema.bytes);
    await expect(openBundle(f.root, f)).resolves.toHaveProperty("manifest");
  });

  it("follows refs through arrays, conditional branches and property applicators", async () => {
    const target = await encodeSchema({ type: "integer" });
    const link = `json:${target.cid.toString()}:target.json`;
    const f = await fixture(
      {
        type: "object",
        allOf: [
          {
            properties: {
              enabled: { type: "boolean" },
              list: {
                type: "array",
                prefixItems: [refSchema],
                items: refSchema,
                contains: refSchema,
              },
              conditional: {
                if: { type: "string" },
                then: refSchema,
                else: { type: "integer" },
              },
            },
            patternProperties: { "^link": refSchema },
            additionalProperties: refSchema,
            dependentSchemas: { enabled: { properties: { extra: refSchema } } },
          },
        ],
        propertyNames: { type: "string" },
      },
      {
        enabled: true,
        list: [link, link],
        conditional: link,
        linkOne: link,
        extra: link,
      },
      { "target.json": text("1") },
    );
    f.blocks.set(target.cid.toString(), target.bytes);
    await expect(openBundle(f.root, f)).resolves.toHaveProperty("manifest");
    const other = await fixture(
      { if: { type: "string" }, then: refSchema, else: { type: "integer" } },
      1,
    );
    await expect(openBundle(other.root, other)).resolves.toHaveProperty(
      "manifest",
    );
    const invalid = await fixture(
      {
        type: "object",
        properties: { list: { type: "array", items: refSchema } },
      },
      { list: [`json:${target.cid.toString()}:missing`] },
    );
    invalid.blocks.set(target.cid.toString(), target.bytes);
    await expect(openBundle(invalid.root, invalid)).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
      pointer: "/list/0",
    });
  });

  it("does not interpret $ref within constant data or refs from nonmatching branches", async () => {
    const value = { $ref: "https://not-a-schema.invalid" };
    const f = await fixture({ const: value }, value);
    await expect(openBundle(f.root, f)).resolves.toHaveProperty("manifest");
    const branches = await fixture(
      {
        anyOf: [
          {
            type: "object",
            properties: { link: refSchema },
            required: ["enabled"],
          },
          { type: "object", properties: { link: { type: "string" } } },
        ],
      },
      { link: "ordinary string" },
    );
    await expect(openBundle(branches.root, branches)).resolves.toHaveProperty(
      "manifest",
    );
  });

  it("checks references in contentSchema metadata and supports definition pointers", async () => {
    await expect(
      encodeSchema({
        type: "string",
        contentSchema: { $ref: "https://unapproved.invalid/schema" },
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    const external = await encodeSchema({ type: "integer" });
    const metadata = await fixture(
      {
        type: "string",
        contentSchema: { $ref: `ipfs://${external.cid.toString()}` },
      },
      "opaque content",
    );
    await expect(openBundle(metadata.root, metadata)).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
    });
    metadata.blocks.set(external.cid.toString(), external.bytes);
    await expect(openBundle(metadata.root, metadata)).resolves.toHaveProperty(
      "manifest",
    );
    const legacy = await fixture(
      {
        $ref: "#/definitions/value",
        definitions: { value: { type: "integer" } },
      },
      1,
    );
    await expect(openBundle(legacy.root, legacy)).resolves.toHaveProperty(
      "manifest",
    );
  });

  it("handles escaped JSON Pointer names without treating them as URI syntax", async () => {
    const target = await encodeSchema({ type: "integer" });
    const link = `json:${target.cid.toString()}:target.json`;
    const f = await fixture(
      {
        type: "object",
        properties: {
          "percent%#": refSchema,
          "slash/~": { $ref: "#/$defs/a%25%23~1~0" },
        },
        $defs: { "a%#/~": refSchema },
      },
      { "percent%#": link, "slash/~": link },
      { "target.json": text("1") },
    );
    f.blocks.set(target.cid.toString(), target.bytes);
    await expect(openBundle(f.root, f)).resolves.toHaveProperty("manifest");
  });

  it("checks unused Schema dependencies and rejects broken fragments and malformed Schema blocks", async () => {
    const external = await encodeSchema({
      $defs: { valid: { type: "integer" } },
    });
    const missing = await fixture(
      { $defs: { unused: { $ref: `ipfs://${external.cid.toString()}` } } },
      {},
    );
    await expect(openBundle(missing.root, missing)).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
    });
    for (const fragment of ["#/$defs/absent", "#absent", "#%ZZ"]) {
      const broken = await fixture(
        { $ref: `ipfs://${external.cid.toString()}${fragment}` },
        {},
      );
      broken.blocks.set(external.cid.toString(), external.bytes);
      await expect(openBundle(broken.root, broken)).rejects.toMatchObject({
        code: "SCHEMA_INVALID",
      });
    }
    const local = await fixture({ $ref: "#/missing" }, {});
    await expect(openBundle(local.root, local)).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
    const malformed = await fixture({ type: "object" }, {});
    for (const bytes of [
      text("not cbor"),
      dagCbor.encode(7),
      new Uint8Array([0xb8, 0x00]),
    ]) {
      const cid = CID.createV1(0x71, await sha256.digest(bytes));
      const f = await fixture(true, {}, { ".bundle.yaml": manifest(cid) });
      f.blocks.set(cid.toString(), bytes);
      await expect(openBundle(f.root, f)).rejects.toMatchObject({
        code: "SCHEMA_INVALID",
      });
    }
    malformed.blocks.set(
      malformed.schemaCid.toString(),
      dagCbor.encode({ type: "array" }),
    );
    await expect(openBundle(malformed.root, malformed)).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
    });
  });

  it("enforces Schema and content-reference budgets", async () => {
    const target = await encodeSchema({ type: "integer" });
    const f = await fixture({ $ref: `ipfs://${target.cid.toString()}` }, 1);
    f.blocks.set(target.cid.toString(), target.bytes);
    await expect(
      openBundle(f.root, { ...f, limits: { schemas: 1 } }),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    const links = await fixture(
      { type: "array", items: refSchema },
      [
        `json:${target.cid.toString()}:target.json`,
        `json:${target.cid.toString()}:target.json`,
      ],
      { "target.json": text("1") },
    );
    links.blocks.set(target.cid.toString(), target.bytes);
    await expect(
      openBundle(links.root, { ...links, limits: { references: 1 } }),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    const shallow = await fixture(true, {}, { "one/two/file": text("x") });
    await expect(
      openBundle(shallow.root, { ...shallow, limits: { depth: 1 } }),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(
      openBundle(f.root, { ...f, limits: { files: 0 } }),
    ).rejects.toMatchObject({ code: "OPTIONS_INVALID" });
    await expect(
      openBundle(f.root, {
        // @ts-expect-error Exercise the runtime guard for untyped consumers.
        resolveCid: null,
      }),
    ).rejects.toMatchObject({ code: "OPTIONS_INVALID" });
  });

  it.each([
    [{ type: "integer" }, "bad", {}, "application/json", "CONTENT_INVALID"],
    [{ type: "array" }, "1\n\n2", {}, "application/jsonl", "CONTENT_INVALID"],
    [true, "---\na: 1\n---\nb: 2", {}, "application/yaml", "CONTENT_INVALID"],
    [true, "a: 1\na: 2", {}, "application/yaml", "CONTENT_INVALID"],
    [true, "a: !unknown value", {}, "application/yaml", "CONTENT_INVALID"],
    [true, "a: .inf", {}, "application/yaml", "CONTENT_INVALID"],
    [refSchema, "bundle:absent", {}, "application/json", "CONTENT_INVALID"],
    [
      refSchema,
      "bundle:child",
      { "child/value": text("x") },
      "application/json",
      "CONTENT_UNAVAILABLE",
    ],
    [refSchema, "not a ref", {}, "application/json", "REFERENCE_INVALID"],
  ] satisfies [
    JsonSchema,
    unknown,
    Record<string, Uint8Array>,
    string,
    string,
  ][])(
    "rejects invalid content before returning a bundle",
    async (schema, value, files, type, code) => {
      const f = await fixture(schema, value, files, type);
      await expect(openBundle(f.root, f)).rejects.toMatchObject({ code });
    },
  );

  it("reports missing or invalid referenced content with source location and reference chain", async () => {
    const target = await encodeSchema({ type: "integer" });
    const f = await fixture(
      { type: "object", properties: { details: refSchema } },
      { details: `json:${target.cid.toString()}:missing.json` },
    );
    f.blocks.set(target.cid.toString(), target.bytes);
    await expect(openBundle(f.root, f)).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
      path: "missing.json",
      pointer: "/details",
    });
    await expect(openBundle(f.root, f)).rejects.toHaveProperty(
      "referenceChain",
      expect.arrayContaining([expect.stringContaining("data.json#/details")]),
    );
    const invalid = await fixture(
      refSchema,
      `json:${target.cid.toString()}:target.json`,
      { "target.json": text('"invalid"') },
    );
    invalid.blocks.set(target.cid.toString(), target.bytes);
    await expect(openBundle(invalid.root, invalid)).rejects.toMatchObject({
      code: "CONTENT_INVALID",
      path: "target.json",
    });
  });

  it("rejects unavailable and corrupted blocks during opening and later reads", async () => {
    const f = await fixture(true, {});
    const original = f.blocks.get(f.schemaCid.toString())!;
    f.blocks.delete(f.schemaCid.toString());
    await expect(openBundle(f.root, f)).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
    });
    f.blocks.set(f.schemaCid.toString(), text("corrupted"));
    await expect(openBundle(f.root, f)).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
    });
    f.blocks.set(f.schemaCid.toString(), original);
    const bundle = await openBundle(f.root, f);
    f.blocks.delete(f.root.toString());
    await expect(bundle.readFile("data.json")).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
    });
  });

  it("requires a directory root and a .bundle.yaml manifest", async () => {
    const f = await fixture(true, {});
    await expect(openBundle(f.schemaCid, f)).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
    const raw = CID.createV1(0x55, await sha256.digest(text("file")));
    f.blocks.set(raw.toString(), text("file"));
    await expect(openBundle(raw, f)).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
    const noManifest = await fixture(
      true,
      {},
      { ".bundle.yaml": text("entry: {}") },
    );
    await expect(openBundle(noManifest.root, noManifest)).rejects.toMatchObject(
      { code: "MANIFEST_INVALID" },
    );
  });

  it("supports cancellation during open and streaming", async () => {
    const f = await fixture(true, {});
    const controller = new AbortController();
    controller.abort();
    await expect(
      openBundle(f.root, { ...f, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    const bundle = await openBundle(f.root, f);
    await expect(
      bundle.readFile("data.json", { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    const next = new AbortController();
    const stream = await bundle.readFile("data.json", { signal: next.signal });
    next.abort();
    await expect(stream.getReader().read()).rejects.toMatchObject({
      code: "ABORTED",
    });
  });

  it("surfaces failures after streaming starts instead of returning substituted bytes", async () => {
    const attachment = new Uint8Array(700_000).fill(33);
    const f = await fixture(true, {}, { "large.bin": attachment });
    const bundle = await openBundle(f.root, f);
    const stream = await bundle.readFile("large.bin");
    for (const [cid, bytes] of f.blocks)
      if (bytes.length > 100_000) f.blocks.delete(cid);
    await expect(stream.getReader().read()).rejects.toMatchObject({
      code: "CONTENT_UNAVAILABLE",
      path: "large.bin",
    });
  });

  it.each([
    ["bytes", 1],
    ["blocks", 1],
    ["blockBytes", 1],
    ["files", 1],
    ["manifestBytes", 1],
    ["schemaBytes", 1],
    ["documentBytes", 1],
    ["nodes", 1],
  ] satisfies [keyof BundleLimits, number][])(
    "enforces %s limits",
    async (key, value) => {
      const f = await fixture(
        { type: "object", properties: { n: { type: "integer" } } },
        { n: 1 },
        { "extra.bin": text("attachment") },
      );
      await expect(
        openBundle(f.root, { ...f, limits: { [key]: value } }),
      ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    },
  );
});

describe("protocol helpers", () => {
  it("encodes deterministic DAG-CBOR schemas without storing or mutating them", async () => {
    const a = await encodeSchema({
      type: "object",
      properties: { z: { type: "string" }, a: { type: "integer" } },
    });
    const b = await encodeSchema({
      properties: { a: { type: "integer" }, z: { type: "string" } },
      type: "object",
    });
    expect(a.cid.equals(b.cid)).toBe(true);
    expect(a.cid.code).toBe(0x71);
    expect(dagCbor.decode(a.bytes)).toEqual({
      type: "object",
      properties: { z: { type: "string" }, a: { type: "integer" } },
    });
    expect((await encodeSchema(false)).bytes).toEqual(dagCbor.encode(false));
  });

  it.each([
    { $ref: "https://example.com/schema" },
    { $ref: "schema.json" },
    { $ref: 1 },
    { $id: "https://example.com" },
    { $async: true },
    { $dynamicRef: "#x" },
    { $schema: "https://json-schema.org/draft-07/schema" },
    { type: "integer", "x-content-ref": true },
    { type: "string", "x-content-ref": "yes" },
    { properties: { a: 4 } },
    { type: "invalid" },
    { unevaluatedProperties: refSchema },
    { $defs: { a: { $anchor: "duplicate" }, b: { $anchor: "duplicate" } } },
  ])("rejects unsupported or malformed schemas", async (schema) => {
    await expect(encodeSchema(schema)).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
  });

  it("bounds Schema encoding and rejects non-JSON data and invalid source syntax", async () => {
    await expect(
      encodeSchema({ description: "x".repeat(1024 * 1024) }),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(
      encodeSchema({ const: Number.MAX_SAFE_INTEGER + 1 }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID" });
    const circular: Record<string, unknown> = {};
    circular.const = circular;
    await expect(encodeSchema(circular)).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
    const invalid = await fixture(
      true,
      {},
      { "data.json": new Uint8Array([0xff]) },
    );
    await expect(openBundle(invalid.root, invalid)).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
    const empty = await fixture(true, "", {}, "application/yaml");
    await expect(openBundle(empty.root, empty)).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
    const alias = await fixture(
      true,
      "a: &a\n  child: *a",
      {},
      "application/yaml",
    );
    await expect(openBundle(alias.root, alias)).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
  });

  it("parses manifest and refs with strict format and paths", async () => {
    const cid = (await encodeSchema(true)).cid;
    expect(parseBundleManifest(manifest(cid)).entry.schemaCid.equals(cid)).toBe(
      true,
    );
    expect(parseContentRef(`yaml:${cid.toString()}:data/a.yaml`)).toMatchObject(
      { kind: "yaml", path: "data/a.yaml" },
    );
    expect(parseContentRef("bundle:child")).toEqual({
      kind: "bundle",
      path: "child",
    });
    for (const path of [
      "",
      "/a",
      "../a",
      "a/../b",
      "./a",
      "a\\b",
      "a//b",
      "a?b",
      "a#b",
      "a%b",
      "a:b",
      "a\u0000",
    ])
      expect(() => parseContentRef(`bundle:${path}`)).toThrow(
        ContentBundleError,
      );
    for (const value of ["http:x", "JSON:bad:a", "json:bad:a"])
      expect(() => parseContentRef(value)).toThrow(ContentBundleError);
    const raw = CID.createV1(0x55, await sha256.digest(text("raw")));
    expect(() => parseContentRef(`json:${raw.toString()}:file`)).toThrow(
      ContentBundleError,
    );
    for (const value of [
      "entry: []",
      "entry: {}",
      "entry: {path: 1}",
      "extra: true",
      `entry: {path: a, schemaCid: ${cid.toString()}, contentType: text/plain}`,
      `entry: {path: a, schemaCid: ${cid.toString()}, contentType: application/json, extra: 1}`,
    ])
      expect(() => parseBundleManifest(text(value))).toThrow(
        ContentBundleError,
      );
    expect(() => parseBundleManifest(new Uint8Array(65_537))).toThrow(
      ContentBundleError,
    );
  });
});
