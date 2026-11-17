import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { extname } from "node:path";
import { parseAllDocuments } from "yaml";

export const limits = Object.freeze({
  document: 1024 * 1024,
  manifest: 64 * 1024,
  renderer: 16 * 1024 * 1024,
  files: 2048,
});

export class InputError extends Error {}
export class DocumentError extends Error {}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function schemaUri(value: string): string {
  if (!value || value.trim() !== value || !URL.canParse(value))
    throw new InputError("Schema must be a complete, nonempty URI.");
  return value;
}

export async function boundedRead(
  path: string,
  maximum: number,
): Promise<Uint8Array> {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile())
      throw new Error("Expected a regular file.");
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > maximum) throw new Error("File exceeds its byte limit.");
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}

function jsonValue(
  value: unknown,
  ancestors: Set<object>,
  budget: { left: number; bytes: number },
  depth = 0,
): void {
  if (--budget.left < 0 || depth > 100)
    throw new Error("Document exceeds JSON expansion/depth limits.");
  const charge = (size: number) => {
    budget.bytes -= size;
    if (budget.bytes < 0) throw new Error("Expanded document exceeds 1 MiB.");
  };
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    charge(Buffer.byteLength(JSON.stringify(value)));
    return;
  }
  if (typeof value !== "object" || ancestors.has(value))
    throw new Error(
      "Document must contain finite, acyclic JSON-compatible values.",
    );
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error("Document contains a non-JSON object.");
  ancestors.add(value);
  const entries = Object.entries(value);
  charge(2 + Math.max(0, entries.length - 1));
  for (const [key, item] of entries) {
    if (!Array.isArray(value))
      charge(Buffer.byteLength(JSON.stringify(key)) + 1);
    jsonValue(item, ancestors, budget, depth + 1);
  }
  ancestors.delete(value);
}

export function parseDocument(
  bytes: Uint8Array,
  extension: string,
): { document: Record<string, unknown>; schema: string } {
  const value = parseTaskDocument(bytes, extension);
  if (!record(value) || typeof value.$schema !== "string")
    throw new Error("Document root must be an object with a string $schema.");
  return { document: value, schema: schemaUri(value.$schema) };
}

export function parseTaskDocument(
  bytes: Uint8Array,
  extension: string,
): unknown {
  if (bytes.byteLength > limits.document)
    throw new Error("Document exceeds 1 MiB.");
  let value: unknown;
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (extension === ".json") {
    try {
      value = JSON.parse(source);
    } catch (error) {
      const positionMatch =
        error instanceof Error ? /position (\d+)/u.exec(error.message) : null;
      const position = positionMatch ? Number(positionMatch[1]) : source.length;
      const prefix = source.slice(0, position).split("\n");
      throw new Error(
        `Invalid JSON syntax at ${String(prefix.length)}:${String((prefix.at(-1)?.length ?? 0) + 1)}. Correct the document and save again.`,
        { cause: error },
      );
    }
  } else {
    const documents = parseAllDocuments(source, {
      schema: "core",
      uniqueKeys: true,
    });
    if (documents.length !== 1)
      throw new Error("Expected exactly one YAML document.");
    const parsed = documents[0]!;
    const issue = parsed.errors[0] ?? parsed.warnings[0];
    if (issue) {
      const position = issue.linePos?.[0];
      throw new Error(
        `Invalid YAML (${issue.code})${position ? ` at ${String(position.line)}:${String(position.col)}` : ""}.`,
      );
    }
    try {
      value = parsed.toJS({ maxAliasCount: 100 });
    } catch {
      throw new Error("YAML aliases exceed safe expansion limits.");
    }
  }
  jsonValue(value, new Set(), {
    left: limits.document,
    bytes: limits.document,
  });
  return value;
}

export function readDocument(
  path: string,
): Promise<{ document: Record<string, unknown>; schema: string }>;
export function readDocument(
  path: string,
  task: boolean,
): Promise<{ document: unknown; schema: string }>;
export async function readDocument(path: string, task = false) {
  const extension = extname(path).toLowerCase();
  if (![".json", ".yaml", ".yml"].includes(extension))
    throw new InputError(
      "Document must be a .yaml, .yml or .json file (not stdin).",
    );
  let bytes: Uint8Array;
  try {
    bytes = await boundedRead(path, limits.document);
  } catch {
    throw new DocumentError(
      "Cannot read document within the 1 MiB limit. Check the file exists and is readable.",
    );
  }
  try {
    if (task)
      return { document: parseTaskDocument(bytes, extension), schema: "" };
    return parseDocument(bytes, extension);
  } catch (error) {
    throw new DocumentError(
      error instanceof Error ? error.message : "Invalid document.",
    );
  }
}
