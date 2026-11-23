import { CID } from "multiformats/cid";
import { parseAllDocuments } from "yaml";
import { ContentBundleError } from "./errors.js";
import type { BundleManifest, ContentRef, ContentType } from "./types.js";

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function safePath(path: string): string {
  if (
    !path ||
    path.length > 1024 ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\:%?#]/u.test(path) ||
    [...path].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new ContentBundleError(
      "PATH_INVALID",
      "Unsafe bundle-relative path.",
      path,
    );
  return path;
}

export function schemaCid(value: string): CID {
  let cid: CID;
  try {
    cid = CID.parse(value);
  } catch (cause) {
    throw new ContentBundleError(
      "SCHEMA_INVALID",
      "Invalid Schema CID.",
      "",
      "",
      [],
      { cause },
    );
  }
  if (cid.version !== 1 || cid.code !== 0x71 || cid.multihash.code !== 0x12)
    throw new ContentBundleError(
      "SCHEMA_INVALID",
      "Schema CID must use CIDv1, dag-cbor and sha2-256.",
    );
  return cid;
}

export function parseContentRef(value: string): ContentRef {
  if (value.startsWith("bundle:"))
    return Object.freeze({ kind: "bundle", path: safePath(value.slice(7)) });
  const match = /^(json|yaml|jsonl):([^:]+):(.+)$/u.exec(value);
  if (!match)
    throw new ContentBundleError(
      "REFERENCE_INVALID",
      "Expected json/yaml/jsonl:<Schema CID>:<path> or bundle:<path>.",
    );
  const kind =
    match[1] === "json" ? "json" : match[1] === "yaml" ? "yaml" : "jsonl";
  return Object.freeze({
    kind,
    schemaCid: schemaCid(match[2]!),
    path: safePath(match[3]!),
  });
}

export function assertJson(
  value: unknown,
  maximumNodes = 100_000,
  maximumDepth = 64,
): void {
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > maximumNodes || depth > maximumDepth)
      throw new ContentBundleError(
        "LIMIT_EXCEEDED",
        "JSON value exceeds node/depth limits.",
      );
    if (item === null || typeof item === "boolean" || typeof item === "string")
      return;
    if (
      typeof item === "number" &&
      Number.isFinite(item) &&
      (!Number.isInteger(item) || Number.isSafeInteger(item))
    )
      return;
    if (
      typeof item !== "object" ||
      ancestors.has(item) ||
      (!Array.isArray(item) &&
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null)
    )
      throw new ContentBundleError(
        "CONTENT_INVALID",
        "Expected finite, acyclic JSON-compatible data with safe integers.",
      );
    ancestors.add(item);
    for (const child of Object.values(item)) visit(child, depth + 1);
    ancestors.delete(item);
  };
  visit(value, 0);
}

export function parseData(
  bytes: Uint8Array,
  type: ContentType,
  nodes = 100_000,
  depth = 64,
): unknown {
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    let value: unknown;
    if (type === "application/json") value = JSON.parse(source);
    else if (type === "application/jsonl") {
      const lines = source.split("\n");
      if (lines.at(-1) === "") lines.pop();
      value = lines.map((line, index): unknown => {
        try {
          return JSON.parse(line);
        } catch (cause) {
          throw new ContentBundleError(
            "CONTENT_INVALID",
            `Invalid JSONL at line ${String(index + 1)}.`,
            "",
            `/${String(index)}`,
            [],
            { cause },
          );
        }
      });
    } else {
      const documents = parseAllDocuments(source, {
        schema: "core",
        uniqueKeys: true,
      });
      if (documents.length !== 1)
        throw new ContentBundleError(
          "CONTENT_INVALID",
          "Expected one YAML document.",
        );
      const document = documents[0]!;
      const issue = document.errors[0] ?? document.warnings[0];
      if (issue) throw new ContentBundleError("CONTENT_INVALID", issue.message);
      value = document.toJS({ maxAliasCount: 100 });
    }
    assertJson(value, nodes, depth);
    return value;
  } catch (cause) {
    if (cause instanceof ContentBundleError) throw cause;
    throw new ContentBundleError(
      "CONTENT_INVALID",
      "Invalid UTF-8 or document syntax.",
      "",
      "",
      [],
      { cause },
    );
  }
}

export function parseBundleManifest(bytes: Uint8Array): BundleManifest {
  if (bytes.byteLength > 64 * 1024)
    throw new ContentBundleError(
      "LIMIT_EXCEEDED",
      "Bundle manifest exceeds 64 KiB.",
    );
  try {
    const value = parseData(bytes, "application/yaml");
    if (
      !record(value) ||
      Object.keys(value).some((key) => key !== "entry") ||
      !record(value.entry) ||
      Object.keys(value.entry).some(
        (key) => !["path", "schemaCid", "contentType"].includes(key),
      )
    )
      throw new Error("Expected only an entry descriptor.");
    const { path, schemaCid: cid, contentType } = value.entry;
    if (typeof path !== "string" || typeof cid !== "string")
      throw new Error("Invalid entry fields.");
    if (
      contentType !== "application/json" &&
      contentType !== "application/yaml" &&
      contentType !== "application/jsonl"
    )
      throw new Error("Unsupported content type.");
    return Object.freeze({
      entry: Object.freeze({
        path: safePath(path),
        schemaCid: schemaCid(cid),
        contentType,
      }),
    });
  } catch (cause) {
    if (cause instanceof ContentBundleError && cause.code === "LIMIT_EXCEEDED")
      throw cause;
    throw new ContentBundleError(
      "MANIFEST_INVALID",
      "Invalid .bundle.yaml.",
      ".bundle.yaml",
      "",
      [],
      { cause },
    );
  }
}
