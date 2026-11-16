import { parse } from "acorn";
import type { Project } from "./commands.js";
import { type Files, dataYaml, record, Unconfirmed } from "./files.js";
import { repository } from "./repository.js";
import { projectDeliverables } from "./deliverables.js";
import { DeliverablesError, npmMappings } from "../assets/deliverables.mjs";

type Report = (
  status: "missing" | "mismatch" | "unconfirmed",
  brief: string,
) => void;
interface Mapping {
  id: string;
  name: string;
  directory: string;
}

export async function privatePublishEvidence(
  files: Files,
  projects: Project[],
  report: Report,
) {
  if (!projects.some((project) => project.manifest.private === true)) return;
  for (const path of files.paths.filter((path) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path),
  )) {
    const source = await files.text(path);
    if (
      !/\b(?:npm|pnpm) pkg (?:delete private|set private=false)\b/.test(source)
    )
      continue;
    let workflow: Record<string, unknown>;
    try {
      workflow = dataYaml(source);
    } catch (error) {
      if (!(error instanceof Unconfirmed)) throw error;
      continue;
    }
    for (const [name, raw] of Object.entries(record(workflow.jobs ?? {}))) {
      const job = record(raw);
      if (!Array.isArray(job.steps)) continue;
      const defaults = record(
        record(job.defaults ?? workflow.defaults ?? {}).run ?? {},
      );
      const unprotected = new Set<string>();
      for (const rawStep of job.steps as unknown[]) {
        const step = record(rawStep);
        if (typeof step.run !== "string" || step.if !== undefined) {
          unprotected.clear();
          continue;
        }
        const commands = step.run
          .split(/\r?\n|&&/)
          .map((part) => part.trim())
          .filter(Boolean);
        const change =
          /^(?:npm|pnpm) pkg (?:delete private|set private=(?:true|false))$/;
        const publish =
          /^(?:npm|pnpm) publish(?:\s+--[\w-]+(?:[= ][\w.-]+)?)*$/;
        if (
          commands.some(
            (command) => !change.test(command) && !publish.test(command),
          )
        ) {
          unprotected.clear();
          continue;
        }
        const directory =
          step["working-directory"] ?? defaults["working-directory"] ?? ".";
        if (typeof directory !== "string" || directory.includes("${{"))
          continue;
        const project = projects.find(
          (project) => files.path("", directory) === project.directory,
        );
        if (project?.manifest.private !== true) continue;
        // Only a literal removal of protection followed by publishing this directory
        // proves a bypass. A mapping or a publish keyword alone proves nothing.
        for (const command of commands) {
          if (
            /^(?:npm|pnpm) pkg (?:delete private|set private=false)$/.test(
              command,
            )
          )
            unprotected.add(project.directory);
          else if (/^(?:npm|pnpm) pkg set private=true$/.test(command))
            unprotected.delete(project.directory);
          else if (
            unprotected.has(project.directory) &&
            publish.test(command) &&
            !/\s--dry-run(?:\s|$)/.test(command)
          )
            report(
              "mismatch",
              `${path}:${name}: 显式移除 ${project.directory || "."} 的 private 保护后发布，禁止发布 private 包`,
            );
        }
      }
    }
  }
}

/** Historical data parser for migration diagnostics, never a target selector. */
export function releaseMappings(source: string): Mapping[] {
  let tree: Record<string, unknown>;
  try {
    tree = record(
      parse(source, { ecmaVersion: "latest", sourceType: "module" }),
    );
  } catch {
    throw new Unconfirmed("发布映射不是有效静态 ES module");
  }
  const body = tree.body as Record<string, unknown>[];
  if (body.length !== 1 || body[0]?.type !== "ExportNamedDeclaration")
    throw new Unconfirmed("仅支持 export const releasePackages 静态数据映射");
  const declaration = record(body[0].declaration);
  const declarations = declaration.declarations as
    Record<string, unknown>[] | undefined;
  if (
    declaration.type !== "VariableDeclaration" ||
    declaration.kind !== "const" ||
    declarations?.length !== 1 ||
    record(declarations[0]!.id).name !== "releasePackages"
  )
    throw new Unconfirmed("发布映射声明接口无法确认");
  const initial = record(declarations[0]!.init);
  if (initial.type !== "ArrayExpression" || !Array.isArray(initial.elements))
    throw new Unconfirmed("releasePackages 不是静态数组");
  return initial.elements.map((raw: unknown) => {
    const node = record(raw);
    if (node.type !== "ObjectExpression" || !Array.isArray(node.properties))
      throw new Unconfirmed("映射成员不是静态对象");
    const result: Record<string, string> = {};
    for (const rawProperty of node.properties as unknown[]) {
      const property = record(rawProperty);
      if (
        property.type !== "Property" ||
        property.kind !== "init" ||
        property.computed ||
        property.method ||
        property.shorthand
      )
        throw new Unconfirmed("映射不允许计算、展开或 accessor");
      const key = record(property.key);
      const name = key.type === "Identifier" ? key.name : key.value;
      const value = record(property.value);
      if (
        typeof name !== "string" ||
        !["id", "name", "directory"].includes(name) ||
        name in result ||
        value.type !== "Literal" ||
        typeof value.value !== "string"
      )
        throw new Unconfirmed("映射字段必须是唯一 id/name/directory 字符串");
      result[name] = value.value;
    }
    if (Object.keys(result).length !== 3)
      throw new Unconfirmed("映射 id/name/directory 不完整");
    return result as unknown as Mapping;
  });
}

export async function mappingEvidence(
  files: Files,
  projects: Project[],
  report: Report,
) {
  const entries = await projectDeliverables(files, projects, report);
  try {
    const mappings = npmMappings(entries, projects);
    for (const key of ["id", "name", "directory"] as const)
      if (
        new Set(mappings.map((mapping) => mapping[key])).size !==
        mappings.length
      )
        report("mismatch", `发布映射 ${key} 不唯一`);
  } catch (error) {
    if (!(error instanceof DeliverablesError)) throw error;
    report(error.status, error.message);
  }
}

export async function ciReuseEvidence(
  files: Files,
  workflows: { path: string; workflow: Record<string, unknown> }[],
  report: Report,
) {
  const origin = await repository(files);
  for (const { path, workflow } of workflows) {
    for (const rawJob of Object.values(record(workflow.jobs ?? {}))) {
      const job = record(rawJob);
      if (!Array.isArray(job.steps)) continue;
      for (const rawStep of job.steps as unknown[]) {
        const step = record(rawStep);
        if (
          typeof step.run !== "string" ||
          !step.run.includes("github-ci-verify")
        )
          continue;
        const root = await files.json("package.json");
        if (
          record(root.devDependencies ?? {})["github-ci-verify"] === undefined
        )
          report(
            "missing",
            `${path}: CI verifier 必须在根 devDependencies 显式声明并锁定`,
          );
        if (
          step.if !== undefined ||
          step["continue-on-error"] !== undefined ||
          job.if !== undefined ||
          job["continue-on-error"] !== undefined
        ) {
          report("unconfirmed", `${path}: CI 复用门卫存在条件/失败覆盖`);
          continue;
        }
        const command = step.run
          .replace(/\\\r?\n\s*/g, " ")
          .trim()
          .replace(/\s+/g, " ");
        const match =
          /^pnpm exec github-ci-verify --sha "\$\(git rev-parse HEAD\)" --branch ([A-Za-z0-9._/-]+) --workflow ([A-Za-z0-9._/-]+) --job-name "([^"]+)" --step-name "([^"]+)" --json --summary$/.exec(
            command,
          );
        if (!match) {
          report(
            "unconfirmed",
            `${path}: CI 复用只支持完整实际 HEAD SHA/branch/workflow/job/step 的已知 github-ci-verify 接口，不接受关键词或任意固定 SHA`,
          );
          continue;
        }
        if (match[1] !== origin.primary) {
          report(
            "mismatch",
            `${path}: CI verifier 分支 ${match[1]} 与主分支 ${origin.primary} 不一致`,
          );
          continue;
        }
        const source = workflows.find(
          (candidate) =>
            candidate.path === `.github/workflows/${match[2]}` ||
            candidate.path === match[2],
        );
        if (!source) {
          report(
            "mismatch",
            `${path}: verifier 指向不存在的 CI workflow ${match[2]}`,
          );
          continue;
        }
        const push = record(record(source.workflow.on ?? {}).push ?? {});
        if (
          push.paths !== undefined ||
          push["paths-ignore"] !== undefined ||
          push["branches-ignore"] !== undefined ||
          !Array.isArray(push.branches) ||
          !push.branches.includes(origin.primary)
        )
          report(
            "unconfirmed",
            `${path}: verifier 引用 workflow 的准确主分支 push 触发覆盖无法证明`,
          );
        const matches = Object.values(record(source.workflow.jobs ?? {}))
          .map(record)
          .filter((candidate) => candidate.name === match[3]);
        if (matches.length !== 1) {
          report(
            "mismatch",
            `${path}: verifier job 与 CI 的版本化标识不一致/不唯一`,
          );
          continue;
        }
        const aggregate = matches[0]!;
        if (!Array.isArray(aggregate.steps)) {
          report("unconfirmed", `${path}: CI 聚合 job 没有可识别 steps`);
          continue;
        }
        const guarded = (aggregate.steps as unknown[])
          .map(record)
          .filter((candidate) => candidate.name === match[4]);
        if (guarded.length !== 1) {
          report(
            "mismatch",
            `${path}: verifier step 与 CI 聚合检查标识不一致/不唯一`,
          );
          continue;
        }
        const guard = guarded[0]!;
        const needs = aggregate.needs;
        const jobs = record(source.workflow.jobs ?? {});
        const dependency =
          typeof needs === "string" ? record(jobs[needs] ?? {}) : {};
        const dependencySteps = Array.isArray(dependency.steps)
          ? (dependency.steps as unknown[]).map(record)
          : [];
        if (dependency.strategy !== undefined) {
          const matrix = record(record(dependency.strategy).matrix);
          if (
            Object.keys(matrix).some((key) => key !== "node-version") ||
            !Array.isArray(matrix["node-version"]) ||
            !matrix["node-version"].length ||
            matrix["node-version"].some(
              (value: unknown) =>
                typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value),
            )
          )
            report("unconfirmed", `${path}: 必需 CI 矩阵包含动态/过滤语义`);
        }
        let checkedOut = false;
        let installed = false;
        let checked = false;
        let supported = true;
        for (const candidate of dependencySteps) {
          if (
            candidate.if !== undefined ||
            candidate["continue-on-error"] !== undefined ||
            candidate.env !== undefined ||
            candidate["working-directory"] !== undefined
          )
            supported = false;
          if (typeof candidate.uses === "string") {
            if (candidate.uses.startsWith("actions/checkout@"))
              checkedOut = true;
            else if (
              !candidate.uses.startsWith("actions/setup-node@") &&
              !candidate.uses.startsWith("pnpm/action-setup@")
            )
              supported = false;
          }
          if (candidate.run !== undefined) {
            if (
              checkedOut &&
              candidate.run === "pnpm install --frozen-lockfile"
            )
              installed = true;
            else if (
              installed &&
              (candidate.run === "pnpm check" ||
                candidate.run === "pnpm run check")
            )
              checked = true;
            else supported = false;
          }
        }
        const expected =
          'if [ "$CHECK_RESULT" != success ]; then\necho "::error::Every required validation job must succeed; received $CHECK_RESULT."\nexit 1\nfi';
        const code =
          typeof guard.run === "string"
            ? guard.run
                .split(/\r?\n/)
                .map((line) => line.trim())
                .join("\n")
                .trim()
            : "";
        if (
          typeof needs !== "string" ||
          record(guard.env ?? {}).CHECK_RESULT !==
            `\${{ needs.${needs}.result }}` ||
          aggregate.if !== "always()" ||
          aggregate["continue-on-error"] !== undefined ||
          aggregate.env !== undefined ||
          aggregate.defaults !== undefined ||
          aggregate.steps.length !== 1 ||
          Object.keys(record(guard.env ?? {})).length !== 1 ||
          source.workflow.env !== undefined ||
          source.workflow.defaults !== undefined ||
          guard.if !== undefined ||
          dependency.if !== undefined ||
          dependency["continue-on-error"] !== undefined ||
          dependency.env !== undefined ||
          dependency.defaults !== undefined ||
          !checked ||
          !supported ||
          Object.keys(jobs).length !== 2 ||
          guard["continue-on-error"] !== undefined ||
          code !== expected ||
          record(source.workflow.jobs ?? {})[needs] === undefined
        )
          report(
            "unconfirmed",
            `${path}: 聚合 job 的全部必需依赖与失败传播不是已识别的完整门卫，不能只凭 verifier 名称通过`,
          );
      }
    }
  }
}
