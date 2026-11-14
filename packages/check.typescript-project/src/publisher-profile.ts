import { gt, minVersion, parse, satisfies, validRange } from "semver";
import { projectStrategy, type Project } from "./commands.js";
import type { InspectionEvidence } from "./convention.js";
import { type Files, dataYaml, record, Unconfirmed } from "./files.js";
import { verified, type Metadata } from "./metadata.js";
import { repository } from "./repository.js";
import { fixedFile } from "./script-profile.js";
import { releaseMappings } from "./release-evidence.js";
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
function sameData(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(record(value))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, normalize(child)]),
      );
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
function fields(
  value: Record<string, unknown>,
  names: string[],
  source = "release.config.json",
) {
  if (names.some((name) => !Object.hasOwn(value, name)))
    throw new Unconfirmed(
      `${source}: 观察字段 ${JSON.stringify(Object.keys(value))}；npm publisher v1 要求字段 ${JSON.stringify(names)}`,
    );
}
export async function publisherProfile(
  files: Files,
  projects: Project[],
  assets: InspectionEvidence,
  report: Report,
  quality?: QualityProfile | null,
): Promise<PublisherProfile | undefined> {
  const targets = projects.filter(
    (project) =>
      project.manifest.private !== true &&
      (project.manifest.publishConfig !== undefined ||
        record(project.manifest.scripts ?? {})["lint-package"] !== undefined),
  );
  if (!targets.length && !files.exists("release.config.json")) return undefined;
  if (
    !targets.length &&
    projects.every((project) => project.manifest.private === true)
  )
    return undefined;
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
    const workflowPath = ".github/workflows/ci.yaml";
    const verifiedQuality =
      quality === undefined
        ? await qualityWorkflow(files, assets.ciWorkflow, report)
        : quality;
    if (!verifiedQuality) return undefined;
    const { nodeVersions } = verifiedQuality;
    const mappingPaths = [
      "scripts/lib/release-packages.mjs",
      "scripts/release-packages.js",
    ].filter((path) => files.exists(path));
    if (mappingPaths.length > 1)
      throw new Unconfirmed("存在多个发布映射文件，不能确定唯一静态映射");
    const mappings = mappingPaths.length
      ? releaseMappings(await files.text(mappingPaths[0]!))
      : [];
    if (mappings.length && files.exists("release.config.json"))
      throw new Unconfirmed(
        "存在重复发布映射来源；复用已有映射，不维护第二份 release.config.json",
      );
    if (
      targets.length > 1 &&
      !mappings.length &&
      !files.exists("release.config.json")
    )
      throw new Unconfirmed(
        `多个 npm 目标需已有明确 ID/tag 映射及每次唯一选择；观察成员=${targets.map((p) => p.directory || ".").join(", ")}`,
      );
    for (const key of ["id", "name", "directory"] as const)
      if (
        new Set(mappings.map((mapping) => mapping[key])).size !==
        mappings.length
      )
        throw new Unconfirmed(`发布映射 ${key} 不唯一`);
    for (const mapping of mappings)
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapping.id) ||
        !projects.some(
          (project) =>
            (project.directory || ".") === mapping.directory &&
            project.manifest.name === mapping.name,
        )
      )
        throw new Unconfirmed(
          `发布映射 ${JSON.stringify(mapping)} 与真实成员身份不一致`,
        );
    if (
      mappings.length &&
      targets.some(
        (project) =>
          !mappings.some(
            (mapping) =>
              mapping.directory === (project.directory || ".") &&
              mapping.name === project.manifest.name,
          ),
      )
    )
      throw new Unconfirmed("开放 npm 目标缺少唯一已有 ID/tag 映射");
    const inferred = targets[0]!;
    const source = files.exists("release.config.json")
      ? "release.config.json"
      : (mappingPaths[0] ?? files.path(inferred.directory, "package.json"));
    const config = files.exists("release.config.json")
      ? await files.json("release.config.json")
      : {
          schemaVersion: 1,
          package: mappings.find(
            (mapping) => mapping.directory === (inferred.directory || "."),
          ) ?? {
            id:
              typeof inferred.manifest.name === "string"
                ? inferred.manifest.name.split("/").at(-1)
                : undefined,
            name: inferred.manifest.name,
            directory: inferred.directory || ".",
          },
          ci: { nodeVersions },
        };
    fields(config, ["schemaVersion", "package", "ci"], source);
    const target = record(config.package);
    const ci = record(config.ci);
    fields(target, ["id", "name", "directory"], source);
    fields(ci, ["nodeVersions"], workflowPath);
    if (!sameData(ci.nodeVersions, nodeVersions))
      throw new Unconfirmed(
        "release.config.json 的旧矩阵与真实 workflow 不一致；以实际 workflow 为准，删除重复矩阵",
      );
    if (config.schemaVersion !== 1 || typeof target.directory !== "string")
      throw new Unconfirmed(
        `${source}: directory 无法确认；要求唯一真实根/成员 npm ESM 包`,
      );
    const project = projects.find(
      (candidate) => (candidate.directory || ".") === target.directory,
    );
    if (
      projects.filter((candidate) => candidate.manifest.name === target.name)
        .length > 1
    )
      throw new Unconfirmed(
        `${source}: package.name = ${JSON.stringify(target.name)}；观察多个同名项目，要求唯一成员身份；修复参考 ${reference}`,
      );
    if (
      !project ||
      project.manifest.private === true ||
      !targets.includes(project)
    ) {
      report(
        "release",
        "mismatch",
        `${source}: package.directory = ${JSON.stringify(target.directory)}；要求映射唯一真实非 private npm 交付包，观察职责 ${JSON.stringify(projects.map((candidate) => ({ directory: candidate.directory || ".", private: candidate.manifest.private, npm: targets.includes(candidate) })))}`,
      );
      return undefined;
    }
    if (topology === "workspace" && !project.directory) {
      report(
        "release",
        "mismatch",
        `${source}: package.directory = "."；实际有多个代码项目，要求显式选择一个 workspace npm 成员，不用聚合根身份发布`,
      );
      return undefined;
    }
    if (
      typeof target.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.id) ||
      target.name !== project.manifest.name
    ) {
      report(
        "release",
        "mismatch",
        `${source}: package = ${JSON.stringify(target)}；要求 id 为规范包标识，name = ${JSON.stringify(project.manifest.name)}，directory = ${JSON.stringify(project.directory || ".")}；无法推导 ID/tag 时复用最小显式映射`,
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
      files.path(project.directory, ".npmrc"),
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
          nodeVersions: ci.nodeVersions as string[],
          // A shared workspace profile does not select the first mapped package.
          ...(targets.length === 1 || files.exists("release.config.json")
            ? { directory: project.directory }
            : {}),
        }
      : undefined;
  } catch (error) {
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
