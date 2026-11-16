import { readdir } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { guardPath, readProjectFile } from "./read-file.js";

const Manifest = Type.Record(Type.String(), Type.Unknown());
const ignored = new Set([
  "node_modules",
  ".git",
  ".silvermoon",
  ".turbo",
  "dist",
  "coverage",
]);
export type RepositoryIdentity =
  | { readonly kind: "single-repo" | "monorepo" }
  | { readonly kind: "invalid"; readonly reason: string };

export async function identifyRepository(
  projectDirectory: string,
  signal: AbortSignal,
): Promise<RepositoryIdentity> {
  if (!isAbsolute(projectDirectory) || /[\0\r\n]/.test(projectDirectory))
    throw new Error("projectDirectory must be an absolute host directory.");
  const root = resolve(projectDirectory);
  const guard = (path: string) => guardPath(path, signal);
  if (!(await guard(root)).isDirectory())
    throw new Error("projectDirectory must be a directory.");

  const paths: string[] = [];
  let entries = 0;
  const scan = async (directory: string, depth: number): Promise<void> => {
    if (depth > 64) throw new Error("Project directory depth exceeds 64.");
    await guard(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      signal.throwIfAborted();
      if (++entries > 16_384)
        throw new Error("Project enumeration exceeds 16384 entries.");
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path, depth + 1);
      else if (entry.isFile()) paths.push(path);
      else throw new Error(`Unsupported filesystem entry: ${path}`);
    }
  };
  await scan(root, 0);
  const rootManifest = join(root, "package.json");
  if (!paths.includes(rootManifest))
    return { kind: "invalid", reason: "根目录缺少普通文件 package.json。" };

  const budget = { bytes: 0 };
  const manifest = async (path: string) => {
    const text = await readProjectFile(path, signal, budget);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return {
        valid: false,
        reason: `${path}: package.json 不是合法 JSON。`,
      } as const;
    }
    if (!Value.Check(Manifest, value))
      return {
        valid: false,
        reason: `${path}: package.json 必须是对象。`,
      } as const;
    return { valid: true, value } as const;
  };
  const rootPackage = await manifest(rootManifest);
  if (!rootPackage.valid)
    return { kind: "invalid", reason: rootPackage.reason };
  const kind =
    paths.includes(join(root, "pnpm-workspace.yaml")) ||
    Object.hasOwn(rootPackage.value, "workspaces")
      ? "monorepo"
      : "single-repo";
  const declaresTypeScript = (value: Record<string, unknown>): boolean =>
    [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ].some((field) => {
      const dependencies = value[field];
      return (
        Value.Check(Manifest, dependencies) &&
        typeof dependencies.typescript === "string" &&
        dependencies.typescript.trim().length > 0
      );
    });
  if (
    declaresTypeScript(rootPackage.value) ||
    paths.some(
      (path) =>
        /^tsconfig(?:\.[^.]+)*\.json$/.test(basename(path)) ||
        /\.(?:[cm]?ts|tsx)$/.test(path),
    )
  )
    return { kind };
  if (kind === "monorepo")
    for (const path of paths.filter(
      (path) => path !== rootManifest && basename(path) === "package.json",
    )) {
      const member = await manifest(path);
      if (member.valid && declaresTypeScript(member.value)) return { kind };
    }
  return {
    kind: "invalid",
    reason: "未发现 TypeScript 依赖声明、tsconfig 配置文件或 TS 源码。",
  };
}
