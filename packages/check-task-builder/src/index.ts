import { posix } from "node:path";
import type { IpfsStore } from "@silvermoon-work/ipfs-store";
import {
  buildTaskBundle,
  readTaskBuild,
  type TaskBuildFile,
} from "@silvermoon-work/task-builder";
import {
  checkTreePath,
  listTree,
  memoryFile,
  readBytes,
  type ReadonlyFileTree,
  type ReadOptions,
} from "@silvermoon-work/task-builder/tree";
import { parse, stringify } from "yaml";

export { createCheckProject } from "./project.js";
export type { CheckProjectOptions } from "./project.js";

export const checkBuildSchemaUri =
  "https://silvermoon-work.github.io/okr-agent/schemas/check-build/v1.json";

export interface CheckBuild extends TaskBuildFile {
  readonly tree: ReadonlyFileTree;
  readonly references: string;
}

export interface CheckBuildOptions extends ReadOptions {
  readonly outDirectory?: string;
  readonly content?: IpfsStore;
}

/** Overlay only a standard build description; sources and dependencies stay lazy. */
export async function transformCheckTree(
  input: ReadonlyFileTree,
  path = "check.build.yaml",
  options: CheckBuildOptions = {},
): Promise<CheckBuild> {
  checkTreePath(path);
  const raw: unknown = parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readBytes(input, path, 65_536, options),
    ),
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Check build file must contain an object.");
  const config = raw as Record<string, unknown>;
  if (config.$schema !== undefined && config.$schema !== checkBuildSchemaUri)
    throw new Error("Invalid Check build schema.");
  if (
    !config.source ||
    typeof config.source !== "object" ||
    Array.isArray(config.source)
  )
    throw new Error("Check source must contain entry and contract.");
  const source = config.source as Record<string, unknown>;
  if (Object.keys(source).some((key) => !["entry", "contract"].includes(key)))
    throw new Error(
      "Check source only accepts entry and contract; the explicit Task entry owns the SDK wrapper.",
    );
  const include = config.include ?? [];
  if (!Array.isArray(include)) throw new Error("Include must be an array.");
  const normalized: Record<string, unknown> = {
    ...config,
    source: { ...source, mode: "explicit" },
    include: [
      ...(include as unknown[]),
      { from: "references/**", to: "resources/references/" },
    ],
  };
  delete normalized.$schema;
  const bytes = Buffer.from(stringify(normalized));
  const tree: ReadonlyFileTree = {
    list: (name, readOptions) => input.list(name, readOptions),
    read: (name, readOptions) =>
      name === path
        ? Promise.resolve(memoryFile(bytes, readOptions))
        : input.read(name, readOptions),
  };
  const definition = await readTaskBuild(tree, path, {
    ...options,
    allowContractExecution: true,
  });
  const base = posix.dirname(path);
  const references = base === "." ? "references" : `${base}/references`;
  let visited = 0;
  const inspectReferences = async (directory: string): Promise<void> => {
    for (const entry of await listTree(input, directory, options)) {
      if (++visited > 16_384)
        throw new Error("Reference subtree exceeds path capacity.");
      const child = `${directory}/${entry.name}`;
      if (
        entry.name.startsWith(".") ||
        entry.name.toLowerCase() === "node_modules"
      )
        throw new Error(
          `Unsupported reference path (upstream resource exclusion): ${child}`,
        );
      if (entry.kind === "directory") await inspectReferences(child);
    }
  };
  await inspectReferences(references);
  return {
    ...definition,
    options: {
      ...definition.options,
      ...(options.content ? { content: options.content } : {}),
    },
    tree,
    references,
  };
}

function literalCodes(value: unknown, allowEmpty = false): string[] {
  if (!value || typeof value !== "object")
    throw new Error("Missing Check rule code or checkpoint ID schema.");
  const schema = value as { const?: unknown; anyOf?: unknown[]; not?: unknown };
  if (
    allowEmpty &&
    schema.not !== null &&
    typeof schema.not === "object" &&
    Object.keys(schema.not).length === 0
  )
    return [];
  if (Array.isArray(schema.anyOf)) {
    const codes = schema.anyOf.flatMap((member) => literalCodes(member));
    if (!codes.length || new Set(codes).size !== codes.length)
      throw new Error("Empty or duplicate Check identifiers.");
    return codes;
  }
  if (
    typeof schema.const !== "string" ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(schema.const) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(schema.const)
  )
    throw new Error("Check codes must be finite portable string literals.");
  return [schema.const];
}

async function validateReferences(
  input: ReadonlyFileTree,
  root: string,
  codes: readonly string[],
  options: ReadOptions,
): Promise<void> {
  const rootEntries = await listTree(input, root, options);
  if (
    !rootEntries.some(
      (entry) => entry.name === "check.md" && entry.kind === "file",
    ) ||
    (codes.length > 0 &&
      !rootEntries.some(
        (entry) => entry.name === "checkpoints" && entry.kind === "directory",
      ))
  )
    throw new Error(
      "References require exact case-sensitive check.md and checkpoints/ paths.",
    );
  const hasCheckpoints = rootEntries.some(
    (entry) => entry.name === "checkpoints" && entry.kind === "directory",
  );
  const problemEntries = hasCheckpoints
    ? await listTree(input, `${root}/checkpoints`, options)
    : [];
  const required = [
    "check.md",
    ...codes.map((code) => `checkpoints/${code}.md`),
  ];
  for (const path of required) {
    if (
      path !== "check.md" &&
      !problemEntries.some(
        (entry) => entry.name === posix.basename(path) && entry.kind === "file",
      )
    )
      throw new Error(
        `Missing exact case-sensitive reference: ${root}/${path}`,
      );
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        await readBytes(input, `${root}/${path}`, 16 * 1024 * 1024, options),
      );
    } catch (cause) {
      throw new Error(`Missing or invalid UTF-8 reference: ${root}/${path}`, {
        cause,
      });
    }
    if (!text.trim())
      throw new Error(`Reference must not be empty: ${root}/${path}`);
  }
  let visited = 0;
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await listTree(
      input,
      `${root}/${directory}`,
      options,
    )) {
      if (++visited > 16_384)
        throw new Error("Checkpoint references exceed path capacity.");
      const path = `${directory}/${entry.name}`;
      if (entry.kind === "directory") await walk(path);
      else if (/\.md$/i.test(entry.name) && !required.includes(path))
        throw new Error(`Undeclared checkpoint Markdown: ${root}/${path}`);
    }
  };
  if (hasCheckpoints) await walk("checkpoints");
  if (rootEntries.some((entry) => entry.name.toLowerCase() === "problems"))
    throw new Error("Per-code problem documentation is not supported.");
}

/** Compile and validate the Check-specific contract/docs, leaving Bundle/CAR mechanics upstream. */
export async function buildCheckBundle(
  input: ReadonlyFileTree,
  path = "check.build.yaml",
  options: CheckBuildOptions = {},
): Promise<ReadonlyFileTree> {
  const definition = await transformCheckTree(input, path, options);
  const bundle = await buildTaskBundle(definition.tree, definition.options);
  const codeSchema: unknown = JSON.parse(
    Buffer.from(
      await readBytes(
        bundle,
        "schemas/shared/check-rule-code.json",
        65_536,
        options,
      ),
    ).toString(),
  );
  literalCodes(codeSchema);
  const checkpointSchema: unknown = JSON.parse(
    Buffer.from(
      await readBytes(
        bundle,
        "schemas/shared/check-checkpoint-id.json",
        65_536,
        options,
      ),
    ).toString(),
  );
  await validateReferences(
    input,
    definition.references,
    literalCodes(checkpointSchema, true),
    options,
  );
  return bundle;
}
