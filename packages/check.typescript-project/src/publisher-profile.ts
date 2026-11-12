import { createHash } from "node:crypto";
import { gt, minVersion, parse, satisfies, valid, validRange } from "semver";
import type { Project } from "./commands.js";
import type { InspectionEvidence } from "./convention.js";
import { type Files, dataYaml, record, Unconfirmed } from "./files.js";
import { fresh, type Metadata } from "./metadata.js";
import { repository } from "./repository.js";

type Report = (
  domain: "release" | "ci" | "dependency",
  status: "missing" | "mismatch" | "unconfirmed",
  brief: string,
) => void;
export interface PublisherProfile {
  nodeVersions: string[];
}
function text(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function lf(value: string) {
  return value.replace(/\r\n?/g, "\n");
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
function fields(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).sort().join() !== [...names].sort().join())
    throw new Unconfirmed("npm publisher v1 的声明必须是完整闭合对象");
}

export async function publisherProfile(
  files: Files,
  projects: Project[],
  assets: InspectionEvidence,
  report: Report,
): Promise<PublisherProfile | undefined> {
  if (!files.exists("release.config.json")) return undefined;
  const origin = await repository(files);
  if (!origin.github || origin.primary !== "main")
    throw new Unconfirmed(
      "npm publisher v1 只证明明确 GitHub/main 上的发布接口",
    );
  const config = await files.json("release.config.json");
  fields(config, ["schemaVersion", "package", "ci"]);
  const target = record(config.package);
  const ci = record(config.ci);
  fields(target, ["id", "name", "directory"]);
  fields(ci, ["nodeVersions"]);
  if (
    config.schemaVersion !== 1 ||
    projects.length !== 1 ||
    target.directory !== "."
  )
    throw new Unconfirmed(
      "npm publisher v1 只支持显式映射到根的单个 npm ESM 包",
    );
  const project = projects[0]!;
  if (
    typeof target.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.id) ||
    target.name !== project.manifest.name
  ) {
    report(
      "release",
      "mismatch",
      "release.config.json 的包 ID/name 不匹配真实根包",
    );
    return undefined;
  }
  if (
    !Array.isArray(ci.nodeVersions) ||
    ci.nodeVersions.length < 2 ||
    ci.nodeVersions.length > 8 ||
    new Set(ci.nodeVersions as unknown[]).size !== ci.nodeVersions.length ||
    (ci.nodeVersions as unknown[]).some(
      (value) =>
        typeof value !== "string" ||
        valid(value) !== value ||
        parse(value)!.prerelease.length,
    )
  )
    throw new Unconfirmed(
      "npm publisher v1 需要 2..8 个唯一精确稳定 Node 矩阵版本",
    );
  let okay = true;
  for (const [path, canonical] of [
    [".github/workflows/npm-publish.yaml", assets.publishWorkflow],
    [".github/workflows/ci.yaml", assets.ciWorkflow],
  ] as const) {
    if (!files.exists(path)) {
      report("release", "missing", `${path}: 标准 publisher workflow 缺失`);
      okay = false;
      continue;
    }
    const expected = dataYaml(text(canonical));
    if (path.endsWith("/ci.yaml"))
      record(
        record(record(record(expected.jobs).compatibility).strategy).matrix,
      )["node-version"] = ci.nodeVersions;
    if (!sameData(dataYaml(await files.text(path)), expected)) {
      report(
        "release",
        "unconfirmed",
        `${path}: 不等同已审查 npm publisher v1 workflow；不猜测额外动作、channel、OIDC、dispatch 或 CI 聚合语义`,
      );
      okay = false;
    }
  }
  const helper = ".github/scripts/npm-publish.mjs";
  if (!files.exists(helper)) {
    report("release", "missing", `${helper}: 标准发布门卫缺失`);
    okay = false;
  } else {
    const digest = (value: string) =>
      createHash("sha256").update(lf(value), "utf8").digest("hex");
    const expected = digest(text(assets.publisher));
    if (digest(await files.text(helper)) !== expected) {
      report(
        "release",
        "unconfirmed",
        `${helper}: 实际源字节不是 Bundle 中已审查 publisher v1，期望 SHA256 ${expected}；不执行目标脚本`,
      );
      okay = false;
    }
  }
  if (files.exists(".npmrc")) {
    report(
      "release",
      "unconfirmed",
      "npm publisher v1 尚不解释目标 .npmrc 的认证/客户端覆盖；不会假定无长效 token",
    );
    okay = false;
  }
  const dependencies = record(project.manifest.devDependencies ?? {});
  for (const name of ["semver", "publint"]) {
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
  return okay ? { nodeVersions: ci.nodeVersions as string[] } : undefined;
}

export async function compatibilityMatrix(
  profile: PublisherProfile,
  project: Project,
  metadata: Metadata,
  report: Report,
  toolEngines: string[],
) {
  const range = record(project.manifest.engines ?? {}).node;
  const minimum =
    typeof range === "string" && validRange(range)
      ? minVersion(range)
      : undefined;
  if (
    !minimum ||
    !profile.nodeVersions.includes(minimum.version) ||
    !profile.nodeVersions.every((version) =>
      satisfies(version, range as string),
    )
  ) {
    report(
      "ci",
      "mismatch",
      "npm 兼容矩阵必须包含 engines.node 的实际最低版本，且各条目满足该范围",
    );
    return;
  }
  for (const engine of toolEngines) {
    if (!validRange(engine))
      throw new Unconfirmed("兼容矩阵工具 engines 无法解析");
    if (profile.nodeVersions.some((version) => !satisfies(version, engine)))
      report(
        "ci",
        "mismatch",
        `此 publisher profile 在矩阵执行完整 check，工具 Node 要求 ${engine} 必须兼容每个条目`,
      );
  }
  const observed = await metadata.node();
  const facts = fresh(observed);
  if (
    profile.nodeVersions.some(
      (version) =>
        !facts.releases.some(
          (release) => release.version.replace(/^v/, "") === version,
        ),
    )
  )
    throw new Unconfirmed("官方发行事实不能确认全部兼容矩阵版本");
  if (
    !profile.nodeVersions.some((version) => {
      const lifecycle = facts.schedule[`v${parse(version)!.major}`];
      return (
        gt(version, minimum.version) &&
        facts.releases.some(
          (release) =>
            release.version.replace(/^v/, "") === version && release.lts,
        ) &&
        lifecycle?.lts &&
        Date.parse(lifecycle.lts) <= observed.observedAt &&
        observed.observedAt < Date.parse(lifecycle.end)
      );
    })
  )
    report("ci", "mismatch", "npm 兼容矩阵缺少更高且当前受支持的官方 LTS");
}
