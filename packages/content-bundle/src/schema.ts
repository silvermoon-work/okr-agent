import * as dagCbor from "@ipld/dag-cbor";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { ContentBundleError } from "./errors.js";
import { assertJson, record, schemaCid } from "./parsing.js";
import type { BundleLimits, JsonSchema, SchemaBlock } from "./types.js";

const dialect = "https://json-schema.org/draft/2020-12/schema";
const maps = [
  "$defs",
  "definitions",
  "properties",
  "patternProperties",
  "dependentSchemas",
];
const lists = ["allOf", "anyOf", "oneOf", "prefixItems"];
const singles = [
  "items",
  "contains",
  "additionalProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "propertyNames",
  "contentSchema",
  "not",
  "if",
  "then",
  "else",
];

export function pointerPart(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function fragment(pointer: string): string {
  return pointer.split("/").map(encodeURIComponent).join("/");
}

export function externalRef(value: string): {
  cid: CID;
  uri: string;
  fragment: string;
} {
  const match = /^ipfs:\/\/([^/#?]+)(#.*)?$/u.exec(value);
  if (!match)
    throw new ContentBundleError(
      "SCHEMA_INVALID",
      "External $ref must use ipfs://<CID> with an optional fragment.",
    );
  const cid = schemaCid(match[1]!);
  const fragment = match[2] ?? "";
  return { cid, uri: `ipfs://${cid.toString()}`, fragment };
}

function validator(): Ajv2020 {
  return new Ajv2020({
    strict: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    validateFormats: false,
    allErrors: true,
    inlineRefs: false,
  })
    .addKeyword({ keyword: "$anchor", schemaType: "string", valid: true })
    .addKeyword({
      keyword: "x-content-ref",
      schemaType: "boolean",
      type: "string",
      valid: true,
    });
}

interface SchemaNode {
  schema: JsonSchema;
  uri: string;
}

function inspect(
  schema: JsonSchema,
  limits: Pick<BundleLimits, "nodes" | "depth">,
  normalizeRefs = false,
) {
  assertJson(schema, limits.nodes, limits.depth);
  const nodes = new Map<string, JsonSchema>();
  const anchors = new Map<string, string>();
  const refs = new Set<string>();
  const visit = (value: unknown, pointer: string): void => {
    if (typeof value !== "boolean" && !record(value))
      throw new ContentBundleError(
        "SCHEMA_INVALID",
        "Expected an object or boolean Schema.",
        "",
        pointer,
      );
    nodes.set(pointer, value);
    if (typeof value === "boolean") return;
    for (const key of [
      "$id",
      "$async",
      "$dynamicRef",
      "$dynamicAnchor",
      "$recursiveRef",
    ])
      if (Object.hasOwn(value, key))
        throw new ContentBundleError(
          "SCHEMA_INVALID",
          `${key} is not supported by the CID Schema profile.`,
          "",
          pointer,
        );
    if (value.$schema !== undefined && value.$schema !== dialect)
      throw new ContentBundleError(
        "SCHEMA_INVALID",
        "Only JSON Schema 2020-12 is supported.",
        "",
        pointer,
      );
    if (
      Object.hasOwn(value, "x-content-ref") &&
      (typeof value["x-content-ref"] !== "boolean" || value.type !== "string")
    )
      throw new ContentBundleError(
        "SCHEMA_INVALID",
        "x-content-ref requires type: string and a boolean annotation.",
        "",
        pointer,
      );
    for (const key of ["unevaluatedProperties", "unevaluatedItems"])
      if (value[key] !== undefined && typeof value[key] !== "boolean")
        throw new ContentBundleError(
          "SCHEMA_INVALID",
          `${key} currently supports only boolean Schemas.`,
          "",
          pointer,
        );
    if (value.$anchor !== undefined) {
      if (typeof value.$anchor !== "string" || anchors.has(value.$anchor))
        throw new ContentBundleError(
          "SCHEMA_INVALID",
          "Invalid or duplicate Schema anchor.",
          "",
          pointer,
        );
      anchors.set(value.$anchor, pointer);
    }
    if (value.$ref !== undefined) {
      if (typeof value.$ref !== "string")
        throw new ContentBundleError(
          "SCHEMA_INVALID",
          "$ref must be a URI-reference.",
          "",
          pointer,
        );
      let reference = value.$ref;
      if (!reference.startsWith("#")) {
        const ref = externalRef(reference);
        if (normalizeRefs) value.$ref = reference = ref.uri + ref.fragment;
      }
      refs.add(reference);
    }
    for (const key of maps)
      if (record(value[key]))
        for (const [name, child] of Object.entries(value[key]))
          visit(child, `${pointer}/${key}/${pointerPart(name)}`);
    for (const key of lists)
      if (Array.isArray(value[key]))
        for (const [index, child] of value[key].entries())
          visit(child, `${pointer}/${key}/${String(index)}`);
    for (const key of singles)
      if (value[key] !== undefined) visit(value[key], `${pointer}/${key}`);
  };
  visit(schema, "");
  const ajv = validator();
  if (!ajv.validateSchema(schema))
    throw new ContentBundleError("SCHEMA_INVALID", ajv.errorsText(ajv.errors));
  return { nodes, anchors, refs };
}

export async function encodeSchema(schema: JsonSchema): Promise<SchemaBlock> {
  inspect(schema, { nodes: 100_000, depth: 64 });
  const bytes = dagCbor.encode(schema);
  if (bytes.byteLength > 1024 * 1024)
    throw new ContentBundleError("LIMIT_EXCEEDED", "Schema exceeds 1 MiB.");
  return { cid: CID.createV1(dagCbor.code, await sha256.digest(bytes)), bytes };
}

export class Schemas {
  private readonly ajv = validator();
  private readonly documents = new Map<string, ReturnType<typeof inspect>>();
  private compiled = false;

  constructor(
    private readonly read: (cid: CID) => Promise<Uint8Array>,
    private readonly limits: BundleLimits,
  ) {}

  async load(cid: CID, depth = 0): Promise<string> {
    const uri = `ipfs://${schemaCid(cid.toString()).toString()}`;
    if (this.documents.has(uri)) return uri;
    if (depth > this.limits.depth || this.documents.size >= this.limits.schemas)
      throw new ContentBundleError(
        "LIMIT_EXCEEDED",
        "Schema dependency limits exceeded.",
      );
    const bytes = await this.read(cid);
    if (bytes.byteLength > this.limits.schemaBytes)
      throw new ContentBundleError(
        "LIMIT_EXCEEDED",
        "Schema block exceeds its byte limit.",
      );
    try {
      const value: unknown = dagCbor.decode(bytes);
      if (typeof value !== "boolean" && !record(value))
        throw new Error("Schema must be an object or boolean.");
      const canonical = dagCbor.encode(value);
      if (
        bytes.length !== canonical.length ||
        !bytes.every((byte, index) => byte === canonical[index])
      )
        throw new Error(
          "Schema block must use deterministic DAG-CBOR encoding.",
        );
      const compiledSchema = structuredClone(value);
      const document = inspect(compiledSchema, this.limits, true);
      this.documents.set(uri, document);
      this.ajv.addSchema(compiledSchema, uri);
      this.compiled = false;
    } catch (cause) {
      if (cause instanceof ContentBundleError) throw cause;
      throw new ContentBundleError(
        "SCHEMA_INVALID",
        "Invalid DAG-CBOR Schema.",
        "",
        "",
        [uri],
        { cause },
      );
    }
    for (const ref of this.documents.get(uri)!.refs)
      if (!ref.startsWith("#"))
        await this.load(externalRef(ref).cid, depth + 1);
    return uri;
  }

  node(uri: string): SchemaNode {
    const hash = uri.indexOf("#");
    const base = hash < 0 ? uri : uri.slice(0, hash);
    let pointer: string;
    try {
      pointer = hash < 0 ? "" : decodeURIComponent(uri.slice(hash + 1));
    } catch (cause) {
      throw new ContentBundleError(
        "SCHEMA_INVALID",
        "Invalid Schema fragment.",
        "",
        "",
        [uri],
        { cause },
      );
    }
    const document = this.documents.get(base);
    if (pointer && !pointer.startsWith("/"))
      pointer = document?.anchors.get(pointer) ?? pointer;
    const schema = document?.nodes.get(pointer);
    if (schema === undefined)
      throw new ContentBundleError(
        "SCHEMA_INVALID",
        "Schema reference does not identify a Schema.",
        "",
        "",
        [uri],
      );
    return { schema, uri: `${base}#${fragment(pointer)}` };
  }

  private validation(uri: string): ValidateFunction {
    try {
      const validate = this.ajv.getSchema(uri);
      if (!validate) throw new Error("Missing Schema.");
      return validate;
    } catch (cause) {
      throw new ContentBundleError(
        "SCHEMA_INVALID",
        "Cannot compile Schema.",
        "",
        "",
        [uri],
        { cause },
      );
    }
  }

  private compileAll(): void {
    if (this.compiled) return;
    for (const [base, document] of this.documents) {
      this.validation(base);
      for (const ref of document.refs) {
        const target = ref.startsWith("#")
          ? base + ref
          : externalRef(ref).uri + externalRef(ref).fragment;
        this.node(target);
        this.validation(target);
      }
    }
    this.compiled = true;
  }

  validate(uri: string, value: unknown): void {
    this.compileAll();
    const validate = this.validation(uri);
    if (!validate(value))
      throw new ContentBundleError(
        "CONTENT_INVALID",
        this.ajv.errorsText(validate.errors),
        "",
        validate.errors?.[0]?.instancePath ?? "",
      );
  }

  async references(
    uri: string,
    value: unknown,
    follow: (value: string, pointer: string) => Promise<void>,
  ): Promise<void> {
    let visits = 0;
    const active = new Set<string>();
    const walk = async (
      node: SchemaNode,
      data: unknown,
      pointer: string,
      depth: number,
    ): Promise<void> => {
      if (++visits > this.limits.nodes || depth > this.limits.depth)
        throw new ContentBundleError(
          "LIMIT_EXCEEDED",
          "Schema evaluation traversal limit exceeded.",
        );
      const key = `${node.uri}\n${pointer}`;
      if (active.has(key) || typeof node.schema === "boolean") return;
      active.add(key);
      try {
        const schema = node.schema;
        if (schema["x-content-ref"] === true && typeof data === "string")
          await follow(data, pointer);
        const base = node.uri.split("#")[0]!;
        if (typeof schema.$ref === "string") {
          const target = schema.$ref.startsWith("#")
            ? base + schema.$ref
            : externalRef(schema.$ref).uri + externalRef(schema.$ref).fragment;
          await walk(this.node(target), data, pointer, depth + 1);
        }
        const child = (suffix: string, item = data, location = pointer) =>
          walk(
            this.node(`${node.uri}${fragment(suffix)}`),
            item,
            location,
            depth + 1,
          );
        const matches = (suffix: string, item = data) =>
          this.validation(`${node.uri}${fragment(suffix)}`)(item);
        for (const key of ["allOf", "anyOf", "oneOf"])
          if (Array.isArray(schema[key]))
            for (const index of schema[key].keys()) {
              const suffix = `/${key}/${String(index)}`;
              if (key === "allOf" || matches(suffix)) await child(suffix);
            }
        if (schema.if !== undefined) {
          const branch = matches("/if") ? "then" : "else";
          if (schema[branch] !== undefined) await child(`/${branch}`);
        }
        if (record(data)) {
          const properties = record(schema.properties) ? schema.properties : {};
          const patterns = record(schema.patternProperties)
            ? schema.patternProperties
            : {};
          for (const [name, item] of Object.entries(data)) {
            const location = `${pointer}/${pointerPart(name)}`;
            let covered = Object.hasOwn(properties, name);
            if (covered)
              await child(`/properties/${pointerPart(name)}`, item, location);
            for (const pattern of Object.keys(patterns))
              if (new RegExp(pattern, "u").test(name)) {
                covered = true;
                await child(
                  `/patternProperties/${pointerPart(pattern)}`,
                  item,
                  location,
                );
              }
            if (!covered && schema.additionalProperties !== undefined)
              await child("/additionalProperties", item, location);
            if (schema.propertyNames !== undefined)
              await child("/propertyNames", name, location);
          }
          if (record(schema.dependentSchemas))
            for (const name of Object.keys(schema.dependentSchemas))
              if (Object.hasOwn(data, name))
                await child(`/dependentSchemas/${pointerPart(name)}`);
        }
        if (Array.isArray(data)) {
          const prefix = Array.isArray(schema.prefixItems)
            ? schema.prefixItems
            : [];
          for (const [index, item] of data.entries()) {
            const location = `${pointer}/${String(index)}`;
            if (index < prefix.length)
              await child(`/prefixItems/${String(index)}`, item, location);
            else if (schema.items !== undefined)
              await child("/items", item, location);
            if (schema.contains !== undefined && matches("/contains", item))
              await child("/contains", item, location);
          }
        }
      } finally {
        active.delete(key);
      }
    };
    await walk(this.node(uri), value, "", 0);
  }
}
