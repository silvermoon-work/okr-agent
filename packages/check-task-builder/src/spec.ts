import { posix } from "node:path";
import {
  renderCheckpointDocumentation,
  type CheckpointDocumentation,
} from "@silvermoon-work/check-task-sdk";
import {
  checkTreePath,
  listTree,
  memoryTree,
  readBytes,
  type ReadonlyFileTree,
  type ReadOptions,
  type TreeEntry,
} from "@silvermoon-work/task-builder/tree";
import { isAlias, parseDocument, visit } from "yaml";

export interface CheckSpecification {
  readonly name: string;
  readonly description: string;
  readonly parameter: {
    readonly schema: Record<string, unknown>;
  };
  readonly checkpoints: readonly CheckpointDocumentation[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const knownFields = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  scope: string,
): void => {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined)
    throw new Error(`Unknown ${scope} field: ${unknown}`);
};
const inertText = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_[\]{}()#+.!|~-]/g, "\\$&");

export async function readSpecification(
  input: ReadonlyFileTree,
  buildPath: string,
  spec: unknown,
  options: ReadOptions,
): Promise<CheckSpecification> {
  if (!nonempty(spec) || posix.isAbsolute(spec) || /[\\:*?[\]{}]/.test(spec))
    throw new Error("Spec must be a relative YAML file-tree path.");
  const path = posix.normalize(posix.join(posix.dirname(buildPath), spec));
  checkTreePath(path);
  const document = parseDocument(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readBytes(input, path, 1024 * 1024, options),
    ),
    { schema: "core", customTags: [] },
  );
  if (document.errors.length || document.warnings.length)
    throw new Error("Invalid Task Spec YAML.", {
      cause: document.errors[0] ?? document.warnings[0],
    });
  visit(document, (_key, node) => {
    if (isAlias(node))
      throw new Error("Task Spec YAML aliases are not allowed.");
  });
  const raw: unknown = document.toJS({ maxAliasCount: 0 });
  if (
    !record(raw) ||
    raw.$schema !== "urn:ipfsaw:check-bundle:1" ||
    raw.specVersion !== "1.0" ||
    !nonempty(raw.name) ||
    !nonempty(raw.description) ||
    !record(raw.parameter) ||
    !record(raw.parameter.schema) ||
    !Array.isArray(raw.checkpoints)
  )
    throw new Error("Invalid Task Spec v1 documentation.");
  knownFields(
    raw,
    [
      "$schema",
      "specVersion",
      "name",
      "description",
      "parameter",
      "checkpoints",
    ],
    "Task Spec",
  );
  knownFields(raw.parameter, ["schema"], "Task Spec parameter");
  const ids = new Set<string>();
  for (const value of raw.checkpoints as unknown[]) {
    if (
      !record(value) ||
      !nonempty(value.instructions) ||
      value.output === undefined
    )
      throw new Error(
        "Task Spec checkpoints require instructions and output documentation.",
      );
    knownFields(
      value,
      ["id", "title", "description", "instructions", "rules", "output"],
      "Task Spec checkpoint",
    );
    renderCheckpointDocumentation(value as unknown as CheckpointDocumentation);
    const checkpoint = value as unknown as CheckpointDocumentation;
    if (ids.has(checkpoint.id))
      throw new Error("Duplicate Task Spec checkpoint ID.");
    ids.add(checkpoint.id);
  }
  return raw as unknown as CheckSpecification;
}

export function validateSpecificationContract(
  spec: CheckSpecification,
  ids: readonly string[],
  codes: readonly string[],
): void {
  if (
    spec.checkpoints.length !== ids.length ||
    spec.checkpoints.some((checkpoint, index) => checkpoint.id !== ids[index])
  )
    throw new Error(
      "Task Spec checkpoint order/IDs do not match the compiled contract.",
    );
  const used = new Set(
    spec.checkpoints.flatMap((checkpoint) =>
      checkpoint.rules.map((rule) => rule.code),
    ),
  );
  if (
    codes.some((code) => !used.has(code)) ||
    [...used].some((code) => !codes.includes(code))
  )
    throw new Error(
      "Task Spec rule membership does not match the compiled contract.",
    );
}

/** Preserve authored files as supplementary text in a read-only virtual overlay. */
export async function specificationTree(
  input: ReadonlyFileTree,
  root: string,
  spec: CheckSpecification,
  options: ReadOptions,
): Promise<ReadonlyFileTree> {
  const generated = new Map<string, Uint8Array>();
  const documents = new Map([
    [
      `${root}/check.md`,
      `# ${inertText(spec.name)}\n\n${inertText(spec.description)}\n\n## Checked parameters\n\n\`\`\`json\n${JSON.stringify(spec.parameter.schema, null, 2)}\n\`\`\`\n`,
    ],
    ...spec.checkpoints.map(
      (checkpoint) =>
        [
          `${root}/checkpoints/${checkpoint.id}.md`,
          renderCheckpointDocumentation(checkpoint),
        ] as const,
    ),
  ]);
  const directories = new Map<string, readonly TreeEntry[] | undefined>();
  const entries = async (
    directory: string,
  ): Promise<readonly TreeEntry[] | undefined> => {
    if (directories.has(directory)) return directories.get(directory);
    if (directory === "") {
      const result = await listTree(input, "", options);
      directories.set(directory, result);
      return result;
    }
    const parent = posix.dirname(directory);
    const siblings = await entries(parent === "." ? "" : parent);
    const name = posix.basename(directory);
    const found = siblings?.find((entry) => entry.name === name);
    if (
      siblings?.some(
        (entry) =>
          entry.name !== name &&
          entry.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error(`Reference paths require exact case: ${directory}`);
    if (found && found.kind !== "directory")
      throw new Error(`Reference directory is not a directory: ${directory}`);
    const result = found
      ? await listTree(input, directory, options)
      : undefined;
    directories.set(directory, result);
    return result;
  };
  for (const [path, documentation] of documents) {
    const siblings = await entries(posix.dirname(path));
    const name = posix.basename(path);
    if (
      siblings?.some(
        (entry) =>
          entry.name !== name &&
          entry.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error(`Reference paths require exact case: ${path}`);
    const found = siblings?.find((entry) => entry.name === name);
    let supplementary = "";
    if (found) {
      if (found.kind !== "file")
        throw new Error(`Reference is not a file: ${path}`);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await readBytes(input, path, 16 * 1024 * 1024, options),
      );
      if (!text.trim()) throw new Error(`Reference must not be empty: ${path}`);
      supplementary = `\n## Supplementary guidance\n\n${text.trim()}\n`;
    }
    generated.set(path, Buffer.from(documentation + supplementary));
  }
  const overlay = memoryTree(generated);
  return {
    async list(path, readOptions) {
      if (!directories.has(path)) return input.list(path, readOptions);
      readOptions?.signal?.throwIfAborted();
      const authored = directories.get(path) ?? [];
      const merged = new Map(authored.map((entry) => [entry.name, entry]));
      for (const entry of await listTree(overlay, path, readOptions))
        merged.set(entry.name, entry);
      return [...merged.values()];
    },
    read: (path, readOptions) =>
      generated.has(path)
        ? overlay.read(path, readOptions)
        : input.read(path, readOptions),
  };
}
