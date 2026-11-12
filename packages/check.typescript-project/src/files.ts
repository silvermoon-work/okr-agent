import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseDocument } from "yaml";

export class Unconfirmed extends Error {}
export function dataYaml(text: string): Record<string, unknown> {
  const parsed = parseDocument(text, { uniqueKeys: true });
  if (parsed.errors.length || parsed.warnings.length)
    throw new Unconfirmed("invalid or unsupported YAML");
  return record(parsed.toJS({ maxAliasCount: 32 }) as unknown);
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Unconfirmed("expected a static object");
  return value as Record<string, unknown>;
}
export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
    throw new Unconfirmed("expected static string patterns");
  return value as string[];
}
export function slash(path: string): string {
  return path.split(sep).join("/");
}
export function glob(pattern: string, path: string): boolean {
  if (
    pattern.startsWith("!") ||
    /[\\[\]{}()+@!]/.test(pattern) ||
    pattern.includes("..")
  )
    throw new Unconfirmed(`unsupported glob: ${pattern}`);
  if (path.startsWith("/") || path.split("/").includes("..")) return false;
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i++;
      }
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.$^|]/g, "\\$&");
  }
  return new RegExp(`${source}$`).test(path);
}
export function matches(patterns: unknown, path: string): boolean {
  const list = stringArray(patterns);
  const results = list.map((pattern) => glob(pattern, path));
  return results.some(Boolean);
}
export class Files {
  readonly root: string;
  readonly paths: string[] = [];
  readonly links: string[] = [];
  private readonly cache = new Map<string, string>();
  private bytes = 0;
  private count = 0;
  constructor(
    root: string,
    private readonly signal: AbortSignal,
  ) {
    if (!isAbsolute(root)) throw new Error("projectDirectory must be absolute");
    this.root = resolve(root);
  }
  path(base: string, child: string): string {
    const absolute = resolve(this.root, base, child);
    const rel = relative(this.root, absolute);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new Unconfirmed("path escapes the target root");
    return slash(rel);
  }
  async guard(path: string): Promise<string> {
    this.signal.throwIfAborted();
    const rel = this.path("", path);
    const parts = rel.split("/").filter(Boolean);
    let current = this.root;
    for (const part of ["", ...parts]) {
      current = resolve(current, part);
      const info = await lstat(current);
      if (info.isSymbolicLink())
        throw new Unconfirmed(`symbolic link is not followed: ${rel}`);
      if ((await realpath(current)) !== current)
        throw new Unconfirmed(`noncanonical or redirected path: ${rel}`);
    }
    return current;
  }
  async scan(): Promise<void> {
    await this.guard("");
    const walk = async (directory: string): Promise<void> => {
      const full = await this.guard(directory);
      const entries = await readdir(full, { withFileTypes: true });
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        this.signal.throwIfAborted();
        if (++this.count > 16_384)
          throw new Unconfirmed("file enumeration exceeds 16384 entries");
        const path = directory ? `${directory}/${entry.name}` : entry.name;
        if (
          [
            "node_modules",
            ".git",
            ".silvermoon",
            ".turbo",
            "dist",
            "coverage",
          ].includes(entry.name)
        )
          continue;
        if (entry.isSymbolicLink()) this.links.push(path);
        else if (entry.isDirectory()) await walk(path);
        else if (entry.isFile()) this.paths.push(path);
        else throw new Unconfirmed(`unsupported filesystem entry: ${path}`);
      }
    };
    await walk("");
  }
  exists(path: string): boolean {
    return this.paths.includes(path);
  }
  async text(path: string): Promise<string> {
    const cached = this.cache.get(path);
    if (cached !== undefined) return cached;
    if (this.cache.size >= 512)
      throw new Unconfirmed("configuration file budget exceeds 512");
    const full = await this.guard(path);
    const file = await open(full, "r");
    try {
      const before = await file.stat();
      if (!before.isFile())
        throw new Error("configuration is not a regular file");
      if (before.size > 1_048_576 || this.bytes + before.size > 16_777_216)
        throw new Unconfirmed(
          "configuration byte budget exceeded (1MiB/file, 16MiB total)",
        );
      const buffer = Buffer.alloc(before.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const result = await file.read(
          buffer,
          offset,
          buffer.length - offset,
          offset,
        );
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
      if (offset > before.size)
        throw new Error("configuration changed during read");
      const after = await file.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
        throw new Error("configuration changed during read");
      await this.guard(path);
      this.bytes += offset;
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        buffer.subarray(0, offset),
      );
      this.cache.set(path, text);
      return text;
    } finally {
      await file.close();
    }
  }
  async json(path: string): Promise<Record<string, unknown>> {
    const text = await this.text(path);
    try {
      return record(JSON.parse(text));
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Unconfirmed(`${path}: invalid JSON`);
      throw error;
    }
  }
  async optionalText(path: string): Promise<string | undefined> {
    try {
      return await this.text(path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return undefined;
      throw error;
    }
  }
  parent(path: string): string {
    return slash(dirname(path));
  }
}
