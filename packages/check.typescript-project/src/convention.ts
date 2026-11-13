import {
  maxSatisfying,
  minVersion,
  parse,
  satisfies,
  subset,
  valid,
  validRange,
} from "semver";
import type { ProblemReporter } from "@silvermoon-work/check-task-sdk";
import type { ProblemCode } from "./contract.js";
import { type Project } from "./commands.js";
import { type Files, dataYaml, glob, record, Unconfirmed } from "./files.js";
import { fresh, type Metadata, type Release } from "./metadata.js";
import { tsconfig } from "./static.js";
import { repository } from "./repository.js";
import { privatePublishEvidence } from "./release-evidence.js";
import {
  publisherProfile,
  compatibilityMatrix,
  type PublisherProfile,
} from "./publisher-profile.js";
import { resolvedPeer } from "./lockfile.js";
import { configuredDelivery } from "./delivery.js";
import type { QualityProfile } from "./quality-workflow.js";

type Domain =
  | "environment"
  | "dependency"
  | "document"
  | "delivery"
  | "release"
  | "gate"
  | "ci";
type Status = "missing" | "mismatch" | "unconfirmed";
export interface InspectionEvidence {
  agents: Uint8Array;
  metadata: Metadata;
  publisher: Uint8Array;
  publishWorkflow: Uint8Array;
  ciWorkflow: Uint8Array;
  scripts: Record<string, Uint8Array>;
}
export function stableSeries(version: string): string {
  const v = parse(version);
  if (!v || v.prerelease.length)
    throw new Unconfirmed(`不是稳定版本: ${version}`);
  return v.major > 0
    ? `${v.major}.x`
    : v.minor > 0
      ? `0.${v.minor}.x`
      : version;
}
function declarationRange(value: string): string {
  if (!validRange(value)) throw new Unconfirmed(`无法解析版本范围: ${value}`);
  const minimum = minVersion(value);
  if (!minimum) throw new Unconfirmed(`无法解析版本范围: ${value}`);
  const expected =
    minimum.major === 0 && minimum.minor === 0
      ? minimum.version
      : value.startsWith("^")
        ? value
        : "";
  const caret = `^${minimum.version}`;
  if (
    !expected ||
    (minimum.major === 0 && minimum.minor === 0 && value !== expected) ||
    (minimum.major + minimum.minor > 0 &&
      (!subset(value, caret) || !subset(caret, value)))
  )
    throw new Unconfirmed(
      `开发依赖必须使用兼容 caret，0.0.patch 必须精确锁定: ${value}`,
    );
  return value;
}
function packagePath(files: Files, project: Project, path: string): string {
  const result = files.path(project.directory, path);
  if (project.directory && !result.startsWith(`${project.directory}/`))
    throw new Unconfirmed(`${path}: 公共入口越过包边界`);
  return result;
}
function url(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value.replace(/^git\+/, ""));
    return (
      ["https:", "git:"].includes(parsed.protocol) &&
      !!parsed.hostname &&
      !parsed.username &&
      !parsed.password &&
      !/example\.(?:com|org)|your[-_]/i.test(value)
    );
  } catch {
    return false;
  }
}
function artifact(project: Project): boolean {
  const scripts = project.manifest.scripts;
  return (
    project.manifest.publishConfig !== undefined ||
    !!(
      scripts &&
      typeof scripts === "object" &&
      !Array.isArray(scripts) &&
      Object.hasOwn(scripts, "lint-package")
    )
  );
}
export async function convention(
  files: Files,
  projects: Project[],
  evidence: InspectionEvidence,
  report: ProblemReporter<ProblemCode>,
  quality: QualityProfile | null,
): Promise<void> {
  const root = projects[0]!;
  const reported = new Set<string>();
  const issue = (domain: Domain, status: Status, message: string) => {
    const key = JSON.stringify([domain, status, message]);
    if (reported.has(key)) return;
    reported.add(key);
    report(`${domain}-${status}` as ProblemCode, message);
  };
  const section = async (
    domain: Domain,
    action: () => Promise<void> | void,
  ) => {
    try {
      await action();
    } catch (error) {
      if (!(error instanceof Unconfirmed)) throw error;
      issue(domain, "unconfirmed", error.message);
    }
  };
  const nonempty = async (path: string, domain: Domain) => {
    if (!files.exists(path)) {
      issue(domain, "missing", `${path}: 文件缺失`);
      return;
    }
    if (!(await files.text(path)).trim())
      issue(domain, "mismatch", `${path}: 文件为空`);
  };
  let node: string | undefined;
  await section("environment", async () => {
    if (!files.exists(".node-version")) {
      issue("environment", "missing", "根 .node-version 缺失");
      return;
    }
    const selected = (await files.text(".node-version"))
      .trim()
      .replace(/^v/, "");
    if (!valid(selected) || parse(selected)!.prerelease.length) {
      issue("environment", "mismatch", ".node-version 必须声明精确稳定版本");
      return;
    }
    node = selected;
    const observation = await evidence.metadata.node();
    const facts = fresh(observation);
    const version = parse(selected)!;
    const lifecycle = facts.schedule[`v${version.major}`];
    if (
      !lifecycle ||
      typeof lifecycle.end !== "string" ||
      typeof lifecycle.lts !== "string" ||
      !Number.isFinite(Date.parse(lifecycle.lts)) ||
      !Number.isFinite(Date.parse(lifecycle.end))
    )
      throw new Unconfirmed("官方 Node 生命周期缺项");
    const release = facts.releases.find(
      (r) => r.version.replace(/^v/, "") === selected,
    );
    if (!release)
      throw new Unconfirmed(`官方发行列表不能确认 Node ${selected}`);
    const now = Date.now();
    const lts: unknown = release.lts;
    if (typeof lts !== "string" && lts !== false)
      throw new Unconfirmed("官方 Node 发行 LTS 标记缺项");
    if (release.lts && Date.parse(lifecycle.lts) > now)
      throw new Unconfirmed(
        `${observation.source}: .node-version ${selected} 的发行已标 LTS，但官方 lts=${lifecycle.lts} 尚未开始，来源冲突，不能回退旧版`,
      );
    if (
      !release.lts ||
      !(Date.parse(lifecycle.lts) <= now && now < Date.parse(lifecycle.end))
    ) {
      issue(
        "environment",
        "mismatch",
        `.node-version 观察 ${selected}；该官方发行不是当前受支持 LTS，要求精确采用最高 SemVer 的稳定、已标 LTS 且当前仍受支持的发行；${observation.source}；${new Date(now).toISOString()}`,
      );
      return;
    }
    const candidates: string[] = [];
    for (const candidate of facts.releases) {
      if (!candidate.lts) continue;
      const parsed = parse(candidate.version.replace(/^v/, ""));
      if (!parsed || parsed.prerelease.length)
        throw new Unconfirmed(
          `${observation.source}: 发行 ${candidate.version} 的稳定版本/LTS 标记冲突`,
        );
      const key =
        parsed.major === 0 ? `v0.${parsed.minor}` : `v${parsed.major}`;
      const support = facts.schedule[key];
      if (
        !support?.lts ||
        !Number.isFinite(Date.parse(support.lts)) ||
        !Number.isFinite(Date.parse(support.end)) ||
        Date.parse(support.lts) >= Date.parse(support.end)
      )
        throw new Unconfirmed(
          `${observation.source}: LTS 发行 ${candidate.version} 对应 ${key} 的官方支持周期缺失或冲突`,
        );
      if (Date.parse(support.lts) > now)
        throw new Unconfirmed(
          `${observation.source}: ${candidate.version} 已标 LTS，但官方 ${key}.lts=${support.lts} 尚未开始，不能回退旧版`,
        );
      if (now < Date.parse(support.end)) candidates.push(parsed.version);
    }
    const latest = maxSatisfying(candidates, "*");
    if (!latest)
      throw new Unconfirmed(
        `${observation.source}: 没有可确认的稳定、标记 LTS 且当前仍受支持的官方发行`,
      );
    if (selected !== latest)
      issue(
        "environment",
        "mismatch",
        `.node-version 观察 ${selected}；要求最高 SemVer 的稳定、官方标 LTS 且当前仍受支持的发行 ${latest}；${observation.source}；${new Date(observation.observedAt).toISOString()}`,
      );
  });
  await section("environment", async () => {
    if (
      files.exists(".nvmrc") &&
      (await files.text(".nvmrc")).trim().replace(/^v/, "") !== node
    )
      issue("environment", "mismatch", ".nvmrc 与根 .node-version 不一致");
    if (
      root.manifest.volta !== undefined &&
      record(root.manifest.volta).node !== node
    )
      issue(
        "environment",
        "mismatch",
        "Volta 默认 Node 与 .node-version 不一致",
      );
    for (const project of projects) {
      const prefix = project.directory || ".";
      if (project.directory) {
        const path = files.path(project.directory, ".node-version");
        if (
          files.exists(path) &&
          (await files.text(path)).trim().replace(/^v/, "") !== node
        )
          issue("environment", "mismatch", `${path}: 覆盖根默认 Node`);
        if (
          project.manifest.packageManager !== undefined &&
          project.manifest.packageManager !== root.manifest.packageManager
        )
          issue(
            "environment",
            "mismatch",
            `${prefix}: packageManager 与根不一致`,
          );
        if (project.manifest.volta !== undefined)
          throw new Unconfirmed(`${prefix}: 成员 Volta 选择无法确认`);
      }
      if (project.sources.length || project.tests.length || artifact(project)) {
        const range = record(project.manifest.engines ?? {}).node;
        if (range === undefined)
          issue("environment", "missing", `${prefix}: engines.node 缺失`);
        else if (typeof range !== "string" || !validRange(range))
          throw new Unconfirmed(`${prefix}: engines.node 无法解析`);
        else if (node && !satisfies(node, range))
          issue(
            "environment",
            "mismatch",
            `${prefix}: 根开发 Node ${node} 不满足自身运行范围 ${range}`,
          );
      }
    }
  });
  await section("dependency", async () => {
    const declared = root.manifest.packageManager;
    const match =
      typeof declared === "string" &&
      /^pnpm@(\d+\.\d+\.\d+)(?:\+sha(?:224|256|384|512)\.[a-f0-9]+)?$/.exec(
        declared,
      );
    if (!match || !valid(match[1])) {
      issue(
        "dependency",
        "mismatch",
        "根 packageManager 必须精确锁定 pnpm 稳定版本",
      );
      return;
    }
    const observation = await evidence.metadata.package("pnpm", {
      current: match[1]!,
      series: stableSeries(match[1]!),
    });
    const facts = fresh(observation);
    const versions = facts.releases;
    const newest = maxSatisfying(facts.versions, stableSeries(match[1]!));
    if (!newest)
      throw new Unconfirmed(`${observation.source}: 同 major 稳定版本缺失`);
    if (!versions[newest] || !versions[match[1]!])
      throw new Unconfirmed("pnpm 当前/最新精确 manifest 缺失");
    if (newest !== match[1])
      issue(
        "dependency",
        "mismatch",
        `packageManager ${match[1]}，同系列最新 ${newest}; ${observation.source}; ${new Date(observation.observedAt).toISOString()}`,
      );
    const engine = versions[newest].engines?.node;
    if (engine && (!node || !validRange(engine)))
      issue(
        "dependency",
        "unconfirmed",
        `pnpm ${newest} Node 兼容事实/默认版本不完整`,
      );
    else if (engine && node && !satisfies(node, engine))
      issue(
        "dependency",
        "mismatch",
        `最新 pnpm ${newest} 的 Node 要求 ${engine} 与默认 Node ${node} 不兼容`,
      );
  });
  let workspace: Record<string, unknown> = {};
  let importers: Record<string, unknown> = {};
  let lock: Record<string, unknown> = {};
  await section("dependency", async () => {
    workspace = files.exists("pnpm-workspace.yaml")
      ? dataYaml(await files.text("pnpm-workspace.yaml"))
      : {};
    lock = files.exists("pnpm-lock.yaml")
      ? dataYaml(await files.text("pnpm-lock.yaml"))
      : {};
    importers = record(lock.importers ?? {});
  });
  const known = new Set([
    "typescript",
    "eslint",
    "typescript-eslint",
    "@eslint/js",
    "@typescript-eslint/parser",
    "@typescript-eslint/eslint-plugin",
    "prettier",
    "vitest",
    "vite",
    "@vitest/coverage-v8",
    "@vitest/coverage-istanbul",
    "publint",
    "turbo",
    "globals",
    "@types/node",
    "@types/semver",
    "github-ci-verify",
    "semver",
  ]);
  interface InstalledTool {
    version: string;
    release: Release;
    reference: string;
    importer: string;
  }
  const actual = new Map<string, Map<string, InstalledTool>>();
  for (const project of projects) {
    await section("dependency", async () => {
      const own = record(project.manifest.devDependencies ?? {});
      const shared = record(root.manifest.devDependencies ?? {});
      const required = new Set<string>();
      if (project.sources.length + project.tests.length > 0)
        for (const name of [
          "typescript",
          "eslint",
          "typescript-eslint",
          "@eslint/js",
          "vitest",
        ])
          required.add(name);
      if (!project.directory) required.add("prettier");
      if (artifact(project)) required.add("publint");
      if (!project.directory && files.exists("turbo.json"))
        required.add("turbo");
      for (const path of files.paths.filter(
        (p) =>
          (!project.directory || p.startsWith(`${project.directory}/`)) &&
          !projects.some((owner) =>
            p.startsWith(`${files.path(owner.directory, "scripts")}/`),
          ) &&
          /(?:eslint|vitest)\.config\.[cm]?[jt]s$/.test(p),
      )) {
        const source = await files.text(path);
        for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
          const name = match[1]!
            .split("/")
            .slice(0, match[1]!.startsWith("@") ? 2 : 1)
            .join("/");
          if (known.has(name)) required.add(name);
        }
        if (/vitest\.config/.test(path)) {
          const provider =
            /\bprovider\s*:\s*["'](v8|istanbul)["']/.exec(source)?.[1] ?? "v8";
          required.add(`@vitest/coverage-${provider}`);
        }
      }
      for (const name of required)
        if (own[name] === undefined && shared[name] === undefined)
          issue(
            "dependency",
            "missing",
            `${project.directory || "."}: ${name} 未在自身/共享根 devDependencies 声明`,
          );
      const resolved = new Map<string, InstalledTool>();
      actual.set(project.directory, resolved);
      for (const [name, raw] of Object.entries(own)) {
        const internal = projects.some((p) => p.manifest.name === name);
        if (
          !known.has(name) &&
          !internal &&
          !(typeof raw === "string" && raw.startsWith("workspace:"))
        )
          continue;
        if (typeof raw !== "string")
          throw new Unconfirmed(`${name}: 依赖声明不是字符串`);
        if (raw.startsWith("workspace:")) {
          if (!projects.some((p) => p.manifest.name === name))
            issue(
              "dependency",
              "mismatch",
              `${name}: workspace 引用无对应成员`,
            );
          continue;
        }
        if (internal) {
          issue(
            "dependency",
            "mismatch",
            `${name}: 内部包必须使用 workspace 协议`,
          );
          continue;
        }
        if (!raw.startsWith("catalog:")) {
          issue(
            "dependency",
            "mismatch",
            `${project.directory || "."}: ${name} 必须引用根 pnpm-workspace.yaml 的 catalog`,
          );
          continue;
        }
        const catalogName = raw.slice(8);
        const value = catalogName
          ? record(record(workspace.catalogs ?? {})[catalogName] ?? {})[name]
          : record(workspace.catalog ?? {})[name];
        if (typeof value !== "string")
          throw new Unconfirmed(`${name}: catalog 无对应版本声明`);
        let range: string;
        try {
          range = declarationRange(value);
        } catch (error) {
          if (!(error instanceof Unconfirmed)) throw error;
          issue("dependency", "mismatch", `${name}: ${error.message}`);
          continue;
        }
        const importer = record(importers[project.directory || "."] ?? {});
        const entry = record(
          record(importer.devDependencies ?? {})[name] ?? {},
        );
        if (entry.specifier !== raw)
          issue(
            "dependency",
            "mismatch",
            `${project.directory || "."}: ${name} lockfile importer specifier != ${raw}`,
          );
        const installedReference =
          typeof entry.version === "string" ? entry.version : undefined;
        const installed = installedReference?.split("(")[0];
        if (!installedReference || !installed || !valid(installed)) {
          issue(
            "dependency",
            "unconfirmed",
            `${name}: 目标 importer 缺少可确认的实际解析版本`,
          );
          continue;
        }
        if (!satisfies(installed, range))
          issue(
            "dependency",
            "mismatch",
            `${project.directory || "."}: ${name} 目标 importer ${installed} 不满足声明 ${range}`,
          );
        const minimum = minVersion(range)!;
        const observation = await evidence.metadata.package(name, {
          current: installed,
          series: stableSeries(minimum.version),
        });
        const facts = fresh(observation);
        const versions = facts.releases;
        const newest = maxSatisfying(
          facts.versions,
          stableSeries(minimum.version),
        );
        if (!newest || !versions[installed] || !versions[newest])
          throw new Unconfirmed(
            `${observation.source}: 缺少完整候选/已解析版本证据`,
          );
        if (installed !== newest)
          issue(
            "dependency",
            "mismatch",
            `${project.directory || "."}: ${name} 声明 ${raw} -> ${range}; importer ${installed}; 系列 ${stableSeries(minimum.version)} 最新 ${newest}; ${observation.source}; ${new Date(observation.observedAt).toISOString()}`,
          );
        const release = versions[installed];
        const latestEngine = versions[newest].engines?.node;
        if (latestEngine && (!node || !validRange(latestEngine)))
          issue(
            "dependency",
            "unconfirmed",
            `${name} 最新 ${newest} 的 Node 兼容范围/默认版本无法确认`,
          );
        else if (latestEngine && node && !satisfies(node, latestEngine))
          issue(
            "dependency",
            "mismatch",
            `${name} 同系列最新 ${newest} 要求 Node ${latestEngine}，与默认 ${node} 冲突；不能回退旧版后宣称最新`,
          );
        resolved.set(name, {
          version: installed,
          release,
          reference: installedReference,
          importer: project.directory || ".",
        });
        const engine = release.engines?.node;
        if (engine && (!node || !validRange(engine)))
          issue(
            "dependency",
            "unconfirmed",
            `${name}@${installed} 的 Node 兼容范围/默认版本无法确认`,
          );
        else if (engine && node && !satisfies(node, engine))
          issue(
            "dependency",
            "mismatch",
            `${name}@${installed} engines.node=${engine} 与默认 Node ${node} 不兼容`,
          );
      }
    });
  }
  for (const project of projects)
    await section("dependency", async () => {
      const resolved = new Map([
        ...(actual.get("") ?? []),
        ...(actual.get(project.directory) ?? []),
      ]);
      for (const [name, value] of resolved) {
        for (const [peer, range] of Object.entries(
          value.release.peerDependencies ?? {},
        )) {
          const found = resolvedPeer(
            lock,
            value.importer,
            name,
            value.reference,
            peer,
          );
          if (!found && value.release.peerDependenciesMeta?.[peer]?.optional)
            continue;
          if (!found || !validRange(range)) {
            issue(
              "dependency",
              "unconfirmed",
              `${name}@${value.version}: peer ${peer}@${range} 未确认实际解析`,
            );
          } else if (!satisfies(found.version, range))
            issue(
              "dependency",
              "mismatch",
              `${name}@${value.version}: peer ${peer}@${found.version} 不满足 ${range}`,
            );
          else {
            const direct = actual
              .get(value.importer === "." ? "" : value.importer)
              ?.get(peer);
            let release =
              direct?.version === found.version ? direct.release : undefined;
            if (!release) {
              if (!known.has(peer))
                throw new Unconfirmed(
                  `${name}: 已解析 peer ${peer} 尚无公开元数据支持，未发送该名称`,
                );
              const observed = await evidence.metadata.package(peer, {
                current: found.version,
                series: stableSeries(found.version),
              });
              release = fresh(observed).releases[found.version];
              if (!release)
                throw new Unconfirmed(
                  `${name}: 已解析 peer ${peer}@${found.version} 缺少准确 manifest`,
                );
            }
            const engine = release.engines?.node;
            if (engine && (!node || !validRange(engine)))
              issue(
                "dependency",
                "unconfirmed",
                `${name}: peer ${peer}@${found.version} 的 Node 兼容范围无法确认`,
              );
            else if (engine && node && !satisfies(node, engine))
              issue(
                "dependency",
                "mismatch",
                `${name}: peer ${peer}@${found.version} engines.node=${engine} 与默认 Node ${node} 不兼容`,
              );
          }
        }
      }
    });
  await section("document", async () => {
    for (const path of [
      "README.md",
      "CONTRIBUTING.md",
      "docs/agent-project.md",
    ])
      await nonempty(path, "document");
    const canonical = new TextDecoder("utf-8", { fatal: true }).decode(
      evidence.agents,
    );
    const lf = (text: string) => text.replace(/\r\n?/g, "\n");
    if (!files.exists("AGENTS.md"))
      issue(
        "document",
        "missing",
        "AGENTS.md 缺失；标准 assets/AGENTS.md，先保护现有自定义内容到 docs/agent-project.md",
      );
    else if (lf(await files.text("AGENTS.md")) !== lf(canonical))
      issue(
        "document",
        "mismatch",
        "AGENTS.md 与完整标准 assets/AGENTS.md 不匹配；先保留自定义内容到 docs/agent-project.md，不可直接丢弃",
      );
    for (const path of files.paths.filter(
      (p) => p !== "AGENTS.md" && /(?:^|\/)AGENTS\.md$/.test(p),
    ))
      await section("document", async () => {
        const owner = projects
          .filter((p) => !p.directory || path.startsWith(`${p.directory}/`))
          .sort((a, b) => b.directory.length - a.directory.length)[0]!;
        const asset = files.path(owner.directory, "assets/AGENTS.md");
        const build = files.path(owner.directory, "check.build.yaml");
        if (
          path === asset &&
          files.exists(build) &&
          lf(await files.text(path)) === lf(canonical)
        ) {
          const include = dataYaml(await files.text(build)).include;
          if (
            Array.isArray(include) &&
            include.some((raw: unknown) => {
              const entry = record(raw);
              return (
                entry.from === "assets/**" &&
                (entry.to === "resources/assets" ||
                  entry.to === "resources/assets/")
              );
            })
          )
            return;
        }
        issue(
          "document",
          "unconfirmed",
          `${path}: 嵌套 Agent 入口可能覆盖根规则，首版不解释其自由正文`,
        );
      });
    if (!files.exists(".gitignore")) {
      issue("document", "missing", ".gitignore 缺失");
      return;
    }
    const patterns = (await files.text(".gitignore"))
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith("#"));
    if (patterns.some((p) => p.startsWith("!") || /[\\[\]{}]/.test(p)))
      throw new Unconfirmed(".gitignore 的否定/复杂规则不在首版支持范围");
    const ignored = (path: string) =>
      patterns.some((raw) => {
        const pattern = raw.replace(/^\//, "").replace(/\/$/, "");
        return (
          glob(pattern, path) ||
          glob(`${pattern}/**`, path) ||
          (!pattern.includes("/") &&
            path.split("/").some((part) => glob(pattern, part)))
        );
      });
    for (const path of [
      "node_modules/file",
      "coverage/report",
      ".turbo/cache",
      ".env",
      ".env.local",
    ])
      if (!ignored(path))
        issue("document", "mismatch", `.gitignore 未排除 ${path}`);
    for (const path of files.paths.filter(
      (p) =>
        /\.(?:[cm]?ts|tsx)$/.test(p) ||
        /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|.*config\.[^/]+)$/.test(p) ||
        p.startsWith(".github/workflows/"),
    ))
      if (ignored(path))
        issue("document", "mismatch", `.gitignore 排除了必要文件 ${path}`);
  });
  await section("gate", () => {
    const names = [
      "typecheck",
      "lint",
      "format-check",
      "format",
      "test",
      "test-coverage",
      "check",
    ];
    const rootScripts = record(root.manifest.scripts ?? {});
    for (const name of names) {
      if (rootScripts[name] === undefined) {
        issue(
          "gate",
          "missing",
          `package.json scripts[${JSON.stringify(name)}] 未声明；要求 node scripts/${name}.mjs 固定标准入口`,
        );
      }
    }
  });
  let profile: PublisherProfile | undefined;
  await section("release", async () => {
    profile = await publisherProfile(files, projects, evidence, issue, quality);
  });
  const deliveries = projects.filter(
    (project) =>
      project.manifest.private !== true &&
      (artifact(project) || project.directory === profile?.directory),
  );
  for (const project of projects) {
    if (deliveries.includes(project))
      await section("delivery", async () => {
        await delivery(files, project, nonempty, issue);
      });
    else if (project.manifest.private !== true)
      issue(
        "delivery",
        "unconfirmed",
        `${project.directory || "."}: private/入口本身不能证明 npm 交付职责；缺少明确发布目标或包校验/已知发布声明，无法判定应用、内部库或 npm 库`,
      );
    if (project.sources.length)
      await section("delivery", async () => {
        const build = record(project.manifest.scripts ?? {}).build;
        if (
          !build &&
          typeof project.manifest.main === "string" &&
          /\.[cm]?js$/.test(project.manifest.main)
        )
          issue(
            "delivery",
            "unconfirmed",
            `${project.directory || "."}: 应用 main 声明可能指向构建产物，但缺少 build 接口；不将其断言为 npm 库`,
          );
        const path = files.path(project.directory, "tsconfig.build.json");
        if (build && files.exists(path)) {
          const config = await tsconfig(files, path);
          if (config.options.noEmit === true)
            issue("delivery", "mismatch", `${path}: build 不得 noEmit`);
          if (
            typeof config.options.outDir === "string" &&
            files.exists(".gitignore")
          ) {
            const ignore = await files.text(".gitignore");
            const output = config.options.outDir
              .replace(/^\.\//, "")
              .replace(/\/$/, "");
            if (
              !ignore
                .split(/\r?\n/)
                .some((p) =>
                  [output, `${output}/`, `**/${output}/`].includes(p.trim()),
                )
            )
              issue(
                "document",
                "unconfirmed",
                `${path}: 未确认 gitignore 排除实际输出 ${output}`,
              );
          }
        }
      });
  }
  if (deliveries.length)
    await section("release", async () => {
      await release(files, issue);
    });
  await section("release", async () => {
    await privatePublishEvidence(files, projects, (status, brief) => {
      issue("release", status, brief);
    });
  });
  await section("ci", async () => {
    const origin = await repository(files);
    if (!origin.github) return;
    if (deliveries.length && quality)
      for (const project of deliveries)
        await section("ci", () =>
          compatibilityMatrix(
            quality,
            project,
            evidence.metadata,
            issue,
            [...(actual.get("")?.entries() ?? [])].flatMap(([name, value]) =>
              value.release.engines?.node
                ? [{ name, range: value.release.engines.node }]
                : [],
            ),
          ),
        );
  });
}

async function delivery(
  files: Files,
  project: Project,
  nonempty: (path: string, domain: Domain) => Promise<void>,
  issue: (domain: Domain, status: Status, message: string) => void,
): Promise<void> {
  const m = project.manifest;
  const prefix = project.directory || ".";
  if (
    typeof m.name !== "string" ||
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(m.name) ||
    /template|your[-_]|example|^@workspace\//i.test(m.name)
  )
    issue("delivery", "mismatch", `${prefix}: npm name 非法或占位`);
  if (m.private !== undefined && typeof m.private !== "boolean")
    issue("delivery", "mismatch", `${prefix}: private 必须是布尔声明`);
  if (
    typeof m.version !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/.test(
      m.version,
    )
  )
    issue("delivery", "mismatch", `${prefix}: 仅接受 x.y.z / x.y.z-rc.n`);
  for (const key of ["description", "license"])
    if (typeof m[key] !== "string" || !m[key].trim())
      issue("delivery", "missing", `${prefix}: ${key} 缺失`);
  if (
    !Array.isArray(m.keywords) ||
    !m.keywords.length ||
    m.keywords.some((v) => typeof v !== "string" || !v.trim())
  )
    issue("delivery", "missing", `${prefix}: keywords 缺失/无效`);
  for (const key of ["repository", "homepage", "bugs"]) {
    const raw = m[key];
    if (!url(typeof raw === "object" && raw ? record(raw).url : raw))
      issue("delivery", "mismatch", `${prefix}: ${key} 不是有效非占位项目地址`);
  }
  for (const name of ["README.md", "LICENSE"])
    await nonempty(files.path(project.directory, name), "delivery");
  if (m.type !== "module")
    issue("delivery", "mismatch", `${prefix}: type 必须 module`);
  const exports = record(m.exports ?? {});
  const entry = record(exports["."] ?? {});
  const entries: Record<string, Record<string, unknown>> = { ".": entry };
  for (const [name, raw] of Object.entries(exports)) {
    if (name === "./package.json") continue;
    if (
      name !== "." &&
      (!/^\.\/[A-Za-z0-9._/-]+$/.test(name) ||
        name
          .slice(2)
          .split("/")
          .some((part) => !part || part === "." || part === ".."))
    )
      throw new Unconfirmed(`${prefix}: 未支持的 exports 子路径 ${name}`);
    const value = record(raw);
    if (Object.keys(value).some((key) => !["types", "import"].includes(key)))
      throw new Unconfirmed(
        `${prefix}: exports ${name} 含未知条件，不推测 CJS/default 语义`,
      );
    entries[name] = value;
  }
  for (const [name, value] of Object.entries(entries)) {
    for (const key of ["import", "types"]) {
      const path = value[key];
      if (typeof path !== "string" || !path.startsWith("./"))
        issue("delivery", "missing", `${prefix}: exports ${name}.${key} 缺失`);
      else packagePath(files, project, path);
    }
  }
  if (exports["./package.json"] !== "./package.json")
    issue(
      "delivery",
      "mismatch",
      `${prefix}: exports 必须显式开放 ./package.json`,
    );
  if (
    (m.main !== undefined && m.main !== entry.import) ||
    (m.types !== undefined && m.types !== entry.types)
  )
    issue("delivery", "mismatch", `${prefix}: main/types 与根 exports 不一致`);
  const publish = record(m.publishConfig ?? {});
  if (Object.keys(publish).some((key) => !["access", "registry"].includes(key)))
    throw new Unconfirmed(`${prefix}: publishConfig 存在尚未支持的发布覆盖`);
  if (
    publish.access !== "public" ||
    publish.registry !== "https://registry.npmjs.org/"
  )
    issue(
      "delivery",
      "mismatch",
      `${prefix}: publishConfig 必须显式 public 和无凭据 npm registry`,
    );
  if (
    !Array.isArray(m.files) ||
    !m.files.length ||
    m.files.some((p) => typeof p !== "string")
  )
    issue("delivery", "missing", `${prefix}: files allowlist 缺失`);
  else {
    const list = m.files as string[];
    for (const value of list) {
      packagePath(files, project, value);
      glob(value, "");
      if (
        value === "." ||
        value === "**" ||
        value === "*" ||
        /test|cache|\.env|node_modules/.test(value)
      )
        issue(
          "delivery",
          "mismatch",
          `${prefix}: files 含开发/秘密/过宽路径 ${value}`,
        );
    }
    for (const value of Object.values(entries))
      for (const key of ["import", "types"])
        if (typeof value[key] === "string") {
          const path = value[key].replace(/^\.\//, "");
          for (const target of [path, `${path}.map`])
            if (
              !list.some(
                (p) =>
                  glob(p, target) ||
                  target.startsWith(`${p.replace(/\/$/, "")}/`),
              )
            )
              issue(
                "delivery",
                "mismatch",
                `${prefix}: files 未覆盖 ${target}`,
              );
        }
  }
  const declared = record(m.scripts ?? {});
  for (const name of ["build", "lint-package"])
    if (declared[name] === undefined)
      issue("delivery", "missing", `${prefix}: ${name} 接口缺失`);
  const path = files.path(project.directory, "tsconfig.build.json");
  if (files.exists(path)) {
    const config = await tsconfig(files, path);
    if (
      config.options.noEmit === true ||
      config.options.declaration !== true ||
      config.options.sourceMap !== true ||
      config.options.declarationMap !== true
    )
      issue(
        "delivery",
        "mismatch",
        `${path}: 构建配置必须 emit JS/declaration/sourceMap/declarationMap`,
      );
    if (
      ![
        "ESNext",
        "ES2022",
        "NodeNext",
        "Node16",
        "Preserve",
        "esnext",
        "es2022",
        "nodenext",
        "node16",
        "preserve",
      ].includes(String(config.options.module))
    )
      issue(
        "delivery",
        "unconfirmed",
        `${path}: 未确认构建配置 ESM module 语义`,
      );
    await configuredDelivery(files, project, path, entries, (status, brief) => {
      issue("delivery", status, `${prefix}: ${brief}`);
    });
  }
}

async function release(
  files: Files,
  issue: (domain: Domain, status: Status, message: string) => void,
): Promise<void> {
  const paths = files.paths.filter((p) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p),
  );
  for (const path of paths) {
    const workflow = dataYaml(await files.text(path));
    for (const [name, value] of Object.entries(record(workflow.jobs ?? {}))) {
      const job = record(value);
      if (!Array.isArray(job.steps)) continue;
      const steps = job.steps.map(record);
      const runs = steps
        .filter((s) => typeof s.run === "string")
        .map((s) => s.run as string);
      const unsafe = steps.filter(
        (step) =>
          typeof step.run === "string" &&
          (/\b(?:npm|pnpm)\s+(?:(?:-r|--recursive)\s+)?publish\b/.test(
            step.run,
          ) ||
            /\bnode\s+[^\r\n]*(?:npm-publish|scripts\/(?:lib\/)?release)[^\s]*\.mjs\b/.test(
              step.run,
            )),
      );
      if (unsafe.length)
        issue(
          "release",
          "mismatch",
          `${path} jobs[${JSON.stringify(name)}] 发布步骤观察值=${JSON.stringify(unsafe.map((step) => ({ name: step.name, run: step.run })))}；CI 只能通过 pnpm release/release-dry-run 调用固定发布入口，禁止裸 publish 或直接运行内部 Node 发布文件`,
        );
      if (
        path !== ".github/workflows/npm-publish.yaml" &&
        runs.some((run) =>
          /\bpnpm\s+(?:run\s+)?release(?:-dry-run)?(?:\s|$)/.test(run),
        )
      )
        issue(
          "release",
          "mismatch",
          `${path}:${name}: 发布入口只能由固定 npm-publish.yaml 的受保护触发路径调用`,
        );
      if (JSON.stringify(job).match(/NODE_AUTH_TOKEN|NPM_TOKEN/))
        issue("release", "mismatch", `${path}:${name}: 不允许长效 npm token`);
    }
  }
}
