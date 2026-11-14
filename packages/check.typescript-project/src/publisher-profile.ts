import { gt, minVersion, parse, satisfies, validRange } from "semver";
import { projectStrategy, type Project } from "./commands.js";
import type { InspectionEvidence } from "./convention.js";
import { type Files, dataYaml, record, Unconfirmed } from "./files.js";
import { verified, type Metadata } from "./metadata.js";
import { repository } from "./repository.js";
import { fixedFile } from "./script-profile.js";
import { projectDeliverables } from "./deliverables.js";
import { DeliverablesError, npmMappings } from "../assets/deliverables.mjs";
import { qualityWorkflow, type QualityProfile } from "./quality-workflow.js";
import { workflowPredicates } from "../assets/workflow-predicates.mjs";

type Report = (
  domain: "release" | "ci" | "dependency",
  status: "missing" | "mismatch" | "unconfirmed",
  brief: string,
) => void;
export interface PublisherProfile {
  nodeVersions: string[];
  directory?: string;
}
export async function publisherProfile(
  files: Files,
  projects: Project[],
  assets: InspectionEvidence,
  report: Report,
  quality?: QualityProfile | null,
): Promise<PublisherProfile | undefined> {
  // The delivery domain owns declaration findings; release only depends on them.
  let declarationProblems = 0;
  const entries = await projectDeliverables(files, projects, () => {
    declarationProblems++;
  });
  if (declarationProblems) return undefined;
  const targets = projects.filter((project) => project.delivery === "npm");
  if (!targets.length) return undefined;
  const topology =
    projectStrategy(projects).kind === "monorepo"
      ? "workspace"
      : "single-package";
  const reference = `references/npm-publisher-v1.md#${topology}；标准 assets/release.mjs、assets/release-dry-run.mjs、assets/npm-publish.mjs`;
  const originalReport = report;
  report = (domain, status, brief) => {
    originalReport(domain, status, `${brief}；修复参考 ${reference}`);
  };
  try {
    const origin = await repository(files);
    if (!origin.github || origin.primary !== "main")
      throw new Unconfirmed(
        "npm publisher v1 只证明明确 GitHub/main 上的发布接口",
      );
    const verifiedQuality =
      quality === undefined
        ? await qualityWorkflow(files, assets.ciWorkflow, report)
        : quality;
    if (!verifiedQuality) return undefined;
    const { nodeVersions } = verifiedQuality;
    const mappings = npmMappings(entries, projects);
    for (const key of ["id", "name", "directory"] as const)
      if (
        new Set(mappings.map((mapping) => mapping[key])).size !==
        mappings.length
      )
        throw new Unconfirmed(`发布映射 ${key} 不唯一`);
    const source = "silvermoon.yaml";
    const project = targets[0]!;
    if (
      topology === "workspace" &&
      targets.some((target) => !target.directory)
    ) {
      report(
        "release",
        "mismatch",
        `${source}: path = "."；实际有多个代码项目，要求显式选择一个 workspace npm 成员，不用聚合根身份发布`,
      );
      return undefined;
    }
    let okay = true;
    for (const path of [".github/workflows/npm-publish.yaml"]) {
      if (!files.exists(path)) {
        report("release", "missing", `${path}: 标准 publisher workflow 缺失`);
        okay = false;
        continue;
      }
      const observed = dataYaml(await files.text(path));
      for (const failure of workflowPredicates(observed, "publisher")) {
        report("release", failure.status, `${path}: ${failure.brief}`);
        okay = false;
      }
    }
    const scripts = record(projects[0]!.manifest.scripts ?? {});
    const affected: string[] = [];
    for (const name of ["release", "release-dry-run"]) {
      if (scripts[name] === undefined) {
        report(
          "release",
          "missing",
          `package.json scripts.${name}: 未声明；要求 node scripts/${name}.mjs`,
        );
        okay = false;
        continue;
      }
      if (scripts[name] !== `node scripts/${name}.mjs`) {
        okay = false;
        continue;
      }
      // Generic script validation already reports an absent entry.
      if (!files.exists(`scripts/${name}.mjs`)) {
        okay = false;
        continue;
      }
      if (
        !(await fixedFile(
          files,
          `scripts/${name}.mjs`,
          assets.scripts[name]!,
          (status, brief) => {
            report("release", status, brief);
          },
        ))
      )
        okay = false;
      if (
        affected.length &&
        !(await fixedFile(
          files,
          "scripts/lib/workflow-predicates.mjs",
          assets.scripts["workflow-predicates"]!,
          (status, brief) => {
            report("release", status, brief);
          },
        ))
      )
        okay = false;
      if (
        affected.length &&
        !(await fixedFile(
          files,
          "scripts/lib/deliverables.mjs",
          assets.scripts["deliverables"]!,
          (status, brief) => {
            report("release", status, brief);
          },
        ))
      )
        okay = false;
      else affected.push(`package.json scripts.${name}`);
    }
    if (
      affected.length &&
      !(await fixedFile(
        files,
        "scripts/lib/npm-publish.mjs",
        assets.publisher,
        (status, brief) => {
          report(
            "release",
            status,
            `${brief}；影响范围: ${affected.join(", ")}`,
          );
        },
      ))
    )
      okay = false;
    for (const path of new Set([
      ".npmrc",
      ...targets.map((target) => files.path(target.directory, ".npmrc")),
    ]))
      if (files.exists(path)) {
        report(
          "release",
          "unconfirmed",
          `${path}: npm publisher v1 尚不解释目标认证/客户端覆盖；要求可证明无长效 token 的配置，不能假定安全`,
        );
        okay = false;
      }
    const dependencies = record(projects[0]!.manifest.devDependencies ?? {});
    for (const name of ["semver", "publint", "yaml", "acorn"]) {
      if (
        typeof dependencies[name] !== "string" ||
        dependencies[name].startsWith("workspace:")
      ) {
        report(
          "dependency",
          "missing",
          `npm publisher v1 必须在根 devDependencies 显式声明公开 ${name}`,
        );
        okay = false;
      }
    }
    if (
      !files.exists(".gitignore") ||
      !(await files.text(".gitignore"))
        .split(/\r?\n/)
        .some((line) =>
          [".release-artifacts", ".release-artifacts/"].includes(line.trim()),
        )
    ) {
      report(
        "release",
        "unconfirmed",
        "npm publisher v1 的专属 .release-artifacts/ 输出必须明确忽略",
      );
      okay = false;
    }
    return okay
      ? {
          nodeVersions,
          // A shared workspace profile does not select the first mapped package.
          ...(targets.length === 1 ? { directory: project.directory } : {}),
        }
      : undefined;
  } catch (error) {
    if (error instanceof DeliverablesError) {
      report("release", error.status, error.message);
      return undefined;
    }
    if (!(error instanceof Unconfirmed)) throw error;
    report("release", "unconfirmed", error.message);
    return undefined;
  }
}

export async function compatibilityMatrix(
  profile: PublisherProfile,
  projects: Project[],
  metadata: Metadata,
  report: Report,
  toolEngines: { name: string; range: string }[],
) {
  const runtimes = projects.map((project) => {
    const range = record(project.manifest.engines ?? {}).node;
    return {
      manifest: `${project.directory ? `${project.directory}/` : ""}package.json`,
      range,
      minimum:
        typeof range === "string" && validRange(range)
          ? minVersion(range)?.version
          : undefined,
    };
  });
  const minimum = runtimes[0]?.minimum;
  if (!minimum || runtimes.some((runtime) => runtime.minimum !== minimum))
    return;
  const supported = profile.nodeVersions.filter((version) =>
    runtimes.every((runtime) => satisfies(version, runtime.range as string)),
  );
  const unsupported = profile.nodeVersions.filter(
    (version) => !supported.includes(version),
  );
  const context = `运行声明=${JSON.stringify(runtimes)}；.github/workflows/ci.yaml compatibility matrix=${JSON.stringify(profile.nodeVersions)}；required 最低版本=${minimum} 及至少一个更高受支持官方 LTS；unsupported 额外条目=${JSON.stringify(unsupported)}，不代表所有包承诺支持`;
  if (!supported.includes(minimum)) {
    report("ci", "mismatch", `${context}；缺少 required 最低版本`);
    return;
  }
  for (const { name, range: engine } of toolEngines) {
    if (!validRange(engine))
      throw new Unconfirmed("兼容矩阵工具 engines 无法解析");
    if (profile.nodeVersions.some((version) => !satisfies(version, engine)))
      report(
        "ci",
        "unconfirmed",
        `package.json devDependencies ${name} 的 engines.node=${engine}；${context}；矩阵仍对全部条目运行开发 check；当前固定 profile 尚不能独立证明消费者运行兼容，不要求消费者最低 Node 运行现代开发工具，也不要求缩窄包 engines`,
      );
  }
  const observed = await metadata.node();
  const facts = verified(observed);
  if (
    profile.nodeVersions.some(
      (version) =>
        !facts.releases.some(
          (release) => release.version.replace(/^v/, "") === version,
        ),
    )
  )
    throw new Unconfirmed("官方发行事实不能确认全部兼容矩阵版本");
  const now = Date.now();
  if (
    !supported.some((version) => {
      const lifecycle = facts.schedule[`v${parse(version)!.major}`];
      return (
        gt(version, minimum) &&
        facts.releases.some(
          (release) =>
            release.version.replace(/^v/, "") === version && release.lts,
        ) &&
        lifecycle?.lts &&
        Date.parse(lifecycle.lts) <= now &&
        now < Date.parse(lifecycle.end)
      );
    })
  )
    report(
      "ci",
      "mismatch",
      `${context}；npm 兼容矩阵缺少更高且当前受支持的官方 LTS`,
    );
}
