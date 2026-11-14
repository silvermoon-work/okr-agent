import { createHash } from "node:crypto";
import type { Project } from "./commands.js";
import { type Files, record, Unconfirmed } from "./files.js";

export const fixedCommands = [
  "typecheck",
  "lint",
  "format",
  "format-check",
  "test",
  "test-coverage",
  "lint-package",
  "check",
] as const;
export const scriptResources = [
  ...fixedCommands.map((name) => [name, `${name}.mjs`] as const),
  ["commands", "commands.mjs"],
  ["release", "release.mjs"],
  ["release-dry-run", "release-dry-run.mjs"],
  ["workflow-predicates", "workflow-predicates.mjs"],
] as const;
type Status = "missing" | "mismatch" | "unconfirmed";
type Report = (status: Status, brief: string) => void;
export async function fixedFile(
  files: Files,
  path: string,
  canonical: Uint8Array,
  report: Report,
): Promise<boolean> {
  if (!files.exists(path)) {
    report("missing", `${path}: 固定标准实现缺失`);
    return false;
  }
  const normalize = (value: string) => value.replace(/\r\n?/g, "\n");
  const expected = normalize(
    new TextDecoder("utf-8", { fatal: true }).decode(canonical),
  );
  let observed: string;
  try {
    observed = normalize(await files.text(path));
  } catch (error) {
    if (!(error instanceof Unconfirmed)) throw error;
    report(
      "unconfirmed",
      `${path}: ${error.message}；要求可完整读取的固定标准正文`,
    );
    return false;
  }
  if (observed !== expected) {
    const digest = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    report(
      "mismatch",
      `${path}: 固定标准实现不匹配（仅允许 LF 归一化），观察 SHA256 ${digest(observed)}；标准 SHA256 ${digest(expected)}`,
    );
    return false;
  }
  return true;
}
export async function scriptProfile(
  files: Files,
  projects: Project[],
  assets: Record<string, Uint8Array>,
  publisher: Uint8Array,
  report: Report,
): Promise<void> {
  const rootPublisher = projects.some((project) => {
    const scripts = project.manifest.scripts;
    return (
      project.manifest.private !== true &&
      (project.manifest.publishConfig !== undefined ||
        (scripts &&
          typeof scripts === "object" &&
          !Array.isArray(scripts) &&
          Object.hasOwn(scripts, "lint-package")) ||
        files.exists("release.config.json"))
    );
  });
  const names = new Map<string, Project>();
  const dependencies = new Map<Project, Project[]>();
  for (const project of projects)
    if (typeof project.manifest.name === "string") {
      if (names.has(project.manifest.name))
        report(
          "unconfirmed",
          `${files.path(project.directory, "package.json")} name = ${JSON.stringify(project.manifest.name)}；workspace 内部依赖要求唯一包名，观察重复身份`,
        );
      else names.set(project.manifest.name, project);
    }
  for (const project of projects) {
    const internal = new Set<Project>();
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      let declarations: Record<string, unknown>;
      try {
        declarations = record(project.manifest[field] ?? {});
      } catch (error) {
        if (!(error instanceof Unconfirmed)) throw error;
        report(
          "unconfirmed",
          `${files.path(project.directory, "package.json")} ${field} = ${JSON.stringify(project.manifest[field])}；拓扑推导要求依赖对象`,
        );
        continue;
      }
      for (const [name, value] of Object.entries(declarations)) {
        const target = names.get(name);
        if (target) internal.add(target);
        else if (typeof value === "string" && value.startsWith("workspace:"))
          report(
            "unconfirmed",
            `${files.path(project.directory, "package.json")} ${field}.${name} = ${JSON.stringify(value)}；要求匹配真实 workspace 成员，观察无对应身份`,
          );
      }
    }
    dependencies.set(project, [...internal]);
  }
  const visited = new Set<Project>();
  const cyclic = new Set<Project>();
  const visit = (project: Project, stack: Project[]) => {
    if (stack.includes(project)) {
      if (!cyclic.has(project)) {
        report(
          "unconfirmed",
          `package.json workspace 依赖拓扑观察循环: ${[...stack, project].map((item) => item.directory || ".").join(" -> ")}；固定调度要求无循环依赖顺序`,
        );
        for (const item of stack) cyclic.add(item);
      }
      return;
    }
    if (visited.has(project)) return;
    for (const target of dependencies.get(project) ?? [])
      visit(target, [...stack, project]);
    visited.add(project);
  };
  for (const project of projects) visit(project, []);
  for (const project of projects) {
    let scripts: Record<string, unknown>;
    try {
      scripts = record(project.manifest.scripts ?? {});
    } catch (error) {
      if (!(error instanceof Unconfirmed)) throw error;
      continue;
    }
    for (const [names, library, canonical] of [
      [fixedCommands, "commands", assets["commands"]!],
      [
        project.manifest.private === true &&
        (project.directory || !rootPublisher)
          ? ["release", "release-dry-run"]
          : [],
        "npm-publish",
        publisher,
      ],
    ] as const) {
      const affected: string[] = [];
      for (const name of names) {
        const path = files.path(project.directory, `scripts/${name}.mjs`);
        // The declaration, invocation and existence checks belong to Scripts.
        if (scripts[name] !== `node scripts/${name}.mjs` || !files.exists(path))
          continue;
        if (await fixedFile(files, path, assets[name]!, report))
          affected.push(
            `${files.path(project.directory, "package.json")} scripts.${name}`,
          );
      }
      if (affected.length)
        await fixedFile(
          files,
          files.path(project.directory, `scripts/lib/${library}.mjs`),
          canonical,
          (status, brief) => {
            report(status, `${brief}；影响范围: ${affected.join(", ")}`);
          },
        );
      if (affected.length && library === "npm-publish")
        await fixedFile(
          files,
          files.path(project.directory, "scripts/lib/workflow-predicates.mjs"),
          assets["workflow-predicates"]!,
          report,
        );
    }
  }
}
