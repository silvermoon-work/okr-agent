import { type Files, Unconfirmed, record } from "./files.js";

export interface Project {
  directory: string;
  manifest: Record<string, unknown>;
  sources: string[];
  tests: string[];
}
export function projectStrategy(projects: Project[]) {
  const scopes = projects.filter(
    (project) => project.sources.length + project.tests.length > 0,
  );
  return {
    kind: scopes.length > 1 ? "monorepo" : "single-package",
    scopes,
  } as const;
}
export function words(command: string): string[] {
  if (/[\r\n`$<>|;&]/.test(command))
    throw new Unconfirmed("unsupported shell operators or interpolation");
  const result: string[] = [];
  let word = "";
  let quote = "";
  let started = false;
  for (const c of command.trim()) {
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\") throw new Unconfirmed("shell escape is unsupported");
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) {
        result.push(word);
        word = "";
        started = false;
      }
    } else {
      word += c;
      started = true;
    }
  }
  if (quote) throw new Unconfirmed("unterminated command quote");
  if (started) result.push(word);
  if (!result.length) throw new Unconfirmed("empty command");
  return result;
}
export class Scripts {
  constructor(readonly files: Files) {}
  entry(project: Project, script: string): string {
    if (
      !script ||
      /[:\\/\s"'`$<>|;&*?[\]{}()%!^]/.test(script) ||
      [...script].some((character) => character.charCodeAt(0) < 32)
    )
      throw new Unconfirmed(`无效 script 名称: ${script}`);
    return this.files.path(project.directory, `scripts/${script}.mjs`);
  }
  validate(
    project: Project,
  ): { status: "missing" | "mismatch"; brief: string }[] {
    const scripts = record(project.manifest.scripts ?? {});
    const manifest = this.files.path(project.directory, "package.json");
    const result: { status: "missing" | "mismatch"; brief: string }[] = [];
    const mapped = new Set<string>();
    for (const [name, value] of Object.entries(scripts)) {
      let path: string;
      try {
        path = this.entry(project, name);
      } catch (error) {
        if (!(error instanceof Unconfirmed)) throw error;
        result.push({
          status: "mismatch",
          brief: `${manifest} scripts[${JSON.stringify(name)}]: ${error.message}；名称禁止冒号、路径分隔或 shell 元字符`,
        });
        continue;
      }
      mapped.add(path);
      const expected = `node scripts/${name}.mjs`;
      if (value !== expected) {
        result.push({
          status: "mismatch",
          brief: `${manifest} scripts[${JSON.stringify(name)}] = ${JSON.stringify(value)}；必须为 ${expected}（无参数）`,
        });
        continue;
      }
      if (!this.files.exists(path))
        result.push({ status: "missing", brief: `${path}: script 入口缺失` });
    }
    const base = this.files.path(project.directory, "scripts");
    for (const path of this.files.paths.filter((path) =>
      path.startsWith(`${base}/`),
    )) {
      const relative = path.slice(base.length + 1);
      if (relative.startsWith("lib/")) continue;
      if (
        relative.includes("/") ||
        !relative.endsWith(".mjs") ||
        !mapped.has(path)
      )
        result.push({
          status: "mismatch",
          brief: `${path}: scripts 顶层仅允许与 package scripts 一一对应的 .mjs 入口；共享模块放 scripts/lib/`,
        });
    }
    return result;
  }
}
