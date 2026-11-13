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
import {
  argument,
  flag,
  type Command,
  type Project,
  type Scripts,
} from "./commands.js";
import { type Files, dataYaml, glob, record, Unconfirmed } from "./files.js";
import { fresh, type Metadata, type Release } from "./metadata.js";
import { tsconfig } from "./static.js";
import { repository } from "./repository.js";
import type { Capability } from "./requirements.js";
import { ciReuseEvidence, mappingEvidence } from "./release-evidence.js";
import {
  publisherProfile,
  compatibilityMatrix,
  type PublisherProfile,
} from "./publisher-profile.js";
import { tscDelivery } from "./delivery.js";
import { resolvedPeer } from "./lockfile.js";

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
      Object.hasOwn(scripts, "lint:package")
    )
  );
}

export async function convention(
  files: Files,
  projects: Project[],
  scripts: Scripts,
  commands: Map<string, Command[]>,
  evidence: InspectionEvidence,
  report: ProblemReporter<ProblemCode>,
  covers: (commands: Command[], capability: Capability) => boolean,
  blocked: (capability: Capability) => boolean,
): Promise<void> {
  const root = projects[0]!;
  const issue = (domain: Domain, status: Status, message: string) => {
    report(`${domain}-${status}` as ProblemCode, message);
  };
  const section = async (domain: Domain, action: () => Promise<void>) => {
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
    const now = observation.observedAt;
    const lts: unknown = release.lts;
    if (typeof lts !== "string" && lts !== false)
      throw new Unconfirmed("官方 Node 发行 LTS 标记缺项");
    if (
      !release.lts ||
      !(Date.parse(lifecycle.lts) <= now && now < Date.parse(lifecycle.end))
    )
      issue(
        "environment",
        "mismatch",
        `Node ${selected} 不是当前受支持 LTS; ${observation.source}; ${new Date(now).toISOString()}`,
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
  const tools = new Set([...commands.values()].flat().map((c) => c.tool));
  for (const project of projects) {
    await section("dependency", async () => {
      const own = record(project.manifest.devDependencies ?? {});
      const shared = record(root.manifest.devDependencies ?? {});
      const selected = [
        ...[...commands.values()].flat(),
        ...scripts.schedulers.values(),
      ].filter((c) => c.directory === project.directory);
      const required = new Set<string>();
      for (const command of selected) {
        const name = (
          {
            tsc: "typescript",
            eslint: "eslint",
            prettier: "prettier",
            vitest: "vitest",
            publint: "publint",
            turbo: "turbo",
          } as Record<string, string>
        )[command.tool];
        if (name) required.add(name);
      }
      for (const path of files.paths.filter(
        (p) =>
          (!project.directory || p.startsWith(`${project.directory}/`)) &&
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
        if (/vitest\.config/.test(path) && tools.has("vitest")) {
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
        // Unknown/custom tools still need an explicit support decision, never an implicit pass.
        if (!known.has(name)) {
          issue(
            "dependency",
            "unconfirmed",
            `${name}: 首版没有该开发依赖的公开元数据/能力支持，未发送该名称`,
          );
          continue;
        }
        let value: unknown = raw;
        if (raw.startsWith("catalog:")) {
          const catalogName = raw.slice(8);
          value = catalogName
            ? record(record(workspace.catalogs ?? {})[catalogName] ?? {})[name]
            : record(workspace.catalog ?? {})[name];
        }
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
      issue(
        "document",
        "unconfirmed",
        `${path}: 嵌套 Agent 入口可能覆盖根规则，首版不解释其自由正文`,
      );
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
  await section("gate", async () => {
    const names = [
      "typecheck",
      "lint",
      "format:check",
      "format",
      "test",
      "test:coverage",
      "check",
    ];
    const rootScripts = record(root.manifest.scripts ?? {});
    for (const name of names) {
      if (rootScripts[name] === undefined) {
        issue("gate", "missing", `根标准 script ${name} 缺失`);
        continue;
      }
      const expanded = commands.get(`:${name}`);
      if (!expanded) {
        issue("gate", "unconfirmed", `根 ${name} 未能静态展开`);
        continue;
      }
      const expected = (
        {
          typecheck: "tsc",
          lint: "eslint",
          "format:check": "prettier",
          format: "prettier",
          test: "vitest",
          "test:coverage": "vitest",
        } as Record<string, string>
      )[name];
      if (expected && !expanded.some((c) => c.tool === expected))
        issue("gate", "unconfirmed", `${name}: 未确认受支持 ${expected} 语义`);
      const capability = (
        {
          typecheck: "typecheck",
          lint: "lint",
          "format:check": "formatting",
          test: "test",
          "test:coverage": "coverage",
        } as Record<string, Capability>
      )[name];
      if (capability && !blocked(capability) && !covers(expanded, capability))
        issue(
          "gate",
          "mismatch",
          `标准 ${name} 未覆盖全部适用成员的已证明 ${capability} 能力`,
        );
      if (expected && expanded.some((c) => c.tool !== expected))
        issue(
          "gate",
          "unconfirmed",
          `${name}: 包含非 ${expected} 的未知动作，不能推断标准操作语义`,
        );
      if (
        name === "format" &&
        !expanded.some(
          (c) => c.tool === "prettier" && (flag(c, "--write") || flag(c, "-w")),
        )
      )
        issue("gate", "mismatch", "format 必须明确执行写入格式修正");
      if (name === "format") {
        const checks = commands.get(":format:check") ?? [];
        const signature = (command: Command) =>
          JSON.stringify([
            command.directory,
            command.tool,
            command.args.filter(
              (value) => !["--check", "-c", "--write", "-w"].includes(value),
            ),
          ]);
        if (
          !checks.every((check) =>
            expanded.some((write) => signature(write) === signature(check)),
          )
        )
          issue(
            "gate",
            "unconfirmed",
            "format 与已证明 format:check 的目标/配置范围不一致",
          );
      }
      if (
        name === "format:check" &&
        expanded.some(
          (c) =>
            c.tool === "prettier" &&
            ((!flag(c, "--check") && !flag(c, "-c")) ||
              flag(c, "--write") ||
              flag(c, "-w")),
        )
      )
        issue("gate", "mismatch", "format:check 必须只检查，不写入");
      if (name === "typecheck")
        for (const command of expanded.filter((c) => c.tool === "tsc")) {
          const config = await tsconfig(
            files,
            files.path(
              command.directory,
              argument(command, "-p") ??
                argument(command, "--project") ??
                "tsconfig.json",
            ),
          );
          if (!flag(command, "--noEmit") && config.options.noEmit !== true)
            issue("gate", "mismatch", "typecheck 必须 noEmit");
        }
      if (name === "check") {
        const safe = new Set([
          "tsc",
          "eslint",
          "prettier",
          "vitest",
          "publint",
        ]);
        if (expanded.some((c) => !safe.has(c.tool)))
          issue(
            "gate",
            "unconfirmed",
            "check 包含未知终端命令，不能证明无安装/发布/删除或失败吞没",
          );
        if (
          expanded.some(
            (c) =>
              (c.tool === "prettier" && flag(c, "--write")) ||
              (c.tool === "eslint" && flag(c, "--fix")),
          )
        )
          issue("gate", "mismatch", "check 调用了源码修正命令");
      }
      if (name === "test" || name === "test:coverage") {
        if (
          expanded.some(
            (c) =>
              c.tool === "vitest" &&
              !c.args.includes("run") &&
              !flag(c, "--run"),
          )
        )
          issue("gate", "mismatch", `${name} 必须单次执行`);
        if (
          name === "test:coverage" &&
          !blocked("coverage") &&
          !expanded.some(
            (c) =>
              c.tool === "vitest" &&
              (flag(c, "--coverage") || flag(c, "--coverage.enabled")),
          )
        )
          issue(
            "gate",
            "unconfirmed",
            "test:coverage 未显式启用覆盖率；配置隐式启用尚未连接到此入口",
          );
      }
    }
  });
  let profile: PublisherProfile | undefined;
  await section("release", async () => {
    profile = await publisherProfile(files, projects, evidence, issue);
  });
  const deliveries = projects.filter(
    (project) =>
      artifact(project) || (!project.directory && profile !== undefined),
  );
  for (const project of projects) {
    if (deliveries.includes(project))
      await section("delivery", async () => {
        await delivery(files, project, commands, nonempty, issue);
      });
    else if (
      project.manifest.private !== true ||
      project.manifest.exports !== undefined ||
      project.manifest.types !== undefined
    )
      issue(
        "delivery",
        "unconfirmed",
        `${project.directory || "."}: private/入口本身不能证明 npm 交付职责；缺少明确发布目标或包校验/已知发布声明，无法判定应用、内部库或 npm 库`,
      );
    if (project.sources.length)
      await section("delivery", async () => {
        const build = commands.get(`${project.directory}:build`);
        if (
          !build &&
          typeof project.manifest.main === "string" &&
          /\.[cm]?js$/.test(project.manifest.main)
        )
          issue(
            "delivery",
            "unconfirmed",
            `${project.directory || "."}: 应用 main 声明可能指向构建产物，但缺少已证明 build；不将其断言为 npm 库`,
          );
        if (
          record(project.manifest.scripts ?? {}).build !== undefined &&
          !build
        )
          throw new Unconfirmed(`${project.directory}: build 动态语义不支持`);
        if (build)
          for (const command of build) {
            if (command.tool !== "tsc")
              throw new Unconfirmed(
                `${project.directory}: 构建器 ${command.tool} 未受支持`,
              );
            const path = files.path(
              command.directory,
              argument(command, "-p") ??
                argument(command, "--project") ??
                "tsconfig.json",
            );
            const config = await tsconfig(files, path);
            if (flag(command, "--noEmit") || config.options.noEmit === true)
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
      await release(files, deliveries, issue, profile !== undefined);
    });
  await section("ci", async () => {
    const origin = await repository(files);
    if (!origin.github) return;
    const workflows = files.paths.filter((p) =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p),
    );
    let nodeSelection = false;
    let pnpmSelection = false;
    for (const path of workflows) {
      const workflow = dataYaml(await files.text(path));
      const trigger = record(workflow.on ?? {});
      if (
        !Object.hasOwn(trigger, "pull_request") ||
        !Object.hasOwn(trigger, "push")
      )
        continue;
      for (const raw of Object.values(record(workflow.jobs ?? {}))) {
        const job = record(raw);
        if (
          !Array.isArray(job.steps) ||
          job.if !== undefined ||
          job["continue-on-error"] !== undefined
        )
          continue;
        let selectedNode = false;
        let selectedPnpm = false;
        for (const rawStep of job.steps) {
          const step = record(rawStep);
          if (step.if !== undefined || step["continue-on-error"] !== undefined)
            continue;
          const settings = record(step.with ?? {});
          if (
            typeof step.uses === "string" &&
            step.uses.startsWith("actions/setup-node@") &&
            settings["node-version-file"] === ".node-version" &&
            settings["node-version"] === undefined
          )
            selectedNode = true;
          if (
            typeof step.uses === "string" &&
            step.uses.startsWith("pnpm/action-setup@") &&
            settings.version === undefined &&
            (settings.package_json_file === undefined ||
              settings.package_json_file === "package.json")
          )
            selectedPnpm = true;
          if (step.run === "pnpm check" || step.run === "pnpm run check") {
            nodeSelection ||= selectedNode;
            pnpmSelection ||= selectedPnpm;
          }
        }
      }
    }
    if (!nodeSelection || !pnpmSelection)
      issue(
        "ci",
        "unconfirmed",
        "未确认同一 PR/push check job 在执行前读取根 .node-version 和 packageManager",
      );
    if (deliveries.length && profile)
      await compatibilityMatrix(
        profile,
        root,
        evidence.metadata,
        issue,
        [...(actual.get("")?.values() ?? [])].flatMap((value) =>
          value.release.engines?.node ? [value.release.engines.node] : [],
        ),
      );
    else if (deliveries.length)
      issue(
        "ci",
        "unconfirmed",
        "npm engines 最低运行版本与更高受支持 Node 的实际兼容矩阵尚不能完整静态证明",
      );
  });
  // Keep the expansion object alive only for this run; no target commands are ever invoked.
  void scripts;
}

async function delivery(
  files: Files,
  project: Project,
  commands: Map<string, Command[]>,
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
  if (
    Object.keys(exports).some(
      (key) => ![".", "./package.json"].includes(key),
    ) ||
    Object.keys(entry).some((key) => !["types", "import"].includes(key))
  )
    throw new Unconfirmed(
      `${prefix}: 有限 npm ESM profile 不推测额外 subpath/CJS/default 条件出口`,
    );
  for (const key of ["import", "types"]) {
    const path = entry[key];
    if (typeof path !== "string" || !path.startsWith("./"))
      issue("delivery", "missing", `${prefix}: 根 exports.${key} 缺失`);
    else packagePath(files, project, path);
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
    for (const key of ["import", "types"])
      if (typeof entry[key] === "string") {
        const path = entry[key].replace(/^\.\//, "");
        for (const target of [path, `${path}.map`])
          if (
            !list.some(
              (p) =>
                glob(p, target) ||
                target.startsWith(`${p.replace(/\/$/, "")}/`),
            )
          )
            issue("delivery", "mismatch", `${prefix}: files 未覆盖 ${target}`);
      }
  }
  const build = commands.get(`${project.directory}:build`);
  if (!build?.length) issue("delivery", "missing", `${prefix}: 未确认 build`);
  else {
    for (const command of build) {
      if (command.tool !== "tsc")
        throw new Unconfirmed(`${prefix}: 未支持的构建器 ${command.tool}`);
      const config = await tsconfig(
        files,
        files.path(
          command.directory,
          argument(command, "-p") ??
            argument(command, "--project") ??
            "tsconfig.json",
        ),
      );
      if (
        config.options.noEmit === true ||
        flag(command, "--noEmit") ||
        config.options.declaration !== true ||
        config.options.sourceMap !== true ||
        config.options.declarationMap !== true
      )
        issue(
          "delivery",
          "mismatch",
          `${prefix}: build 必须 emit JS/declaration/sourceMap/declarationMap`,
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
          `${prefix}: 未确认构建 ESM module 语义`,
        );
      await tscDelivery(files, project, command, entry, (status, brief) => {
        issue("delivery", status, brief);
      });
    }
  }
  const lint = commands.get(`${project.directory}:lint:package`);
  if (!lint?.some((c) => c.tool === "publint"))
    issue("delivery", "missing", `${prefix}: lint:package 未连接 publint`);
  const gate = commands.get(":check") ?? [];
  const same = (left: Command, right: Command) =>
    JSON.stringify(left) === JSON.stringify(right);
  if (
    !build?.every((c) => gate.some((g) => same(c, g))) ||
    !lint?.every((c) => gate.some((g) => same(c, g)))
  )
    issue(
      "delivery",
      "mismatch",
      `${prefix}: build/lint:package 未全部连接根 check`,
    );
  else if (
    Math.max(...build.map((c) => gate.findIndex((g) => same(c, g)))) >
    Math.min(...lint.map((c) => gate.findIndex((g) => same(c, g))))
  )
    issue("delivery", "mismatch", `${prefix}: publint 必须在 build 后`);
}

async function release(
  files: Files,
  projects: Project[],
  issue: (domain: Domain, status: Status, message: string) => void,
  standardPublisher: boolean,
): Promise<void> {
  const paths = files.paths.filter((p) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p),
  );
  const workflows = await Promise.all(
    paths.map(async (path) => ({
      path,
      workflow: dataYaml(await files.text(path)),
    })),
  );
  const report = (status: Status, brief: string) => {
    issue("release", status, brief);
  };
  await mappingEvidence(files, projects, report);
  await ciReuseEvidence(files, workflows, report);
  let applicable = false;
  for (const path of paths) {
    if (standardPublisher && path === ".github/workflows/npm-publish.yaml") {
      applicable = true;
      continue;
    }
    const workflow = dataYaml(await files.text(path));
    const on = record(workflow.on ?? {});
    const push = record(on.push ?? {});
    if (!on.workflow_dispatch && !push.tags) continue;
    applicable = true;
    for (const [name, value] of Object.entries(record(workflow.jobs ?? {}))) {
      const job = record(value);
      if (!Array.isArray(job.steps)) continue;
      const steps = job.steps.map(record);
      const runs = steps
        .filter((s) => typeof s.run === "string")
        .map((s) => s.run as string);
      if (
        runs.some((s) =>
          /\b(?:pnpm\s+(?:-r|--recursive)\s+publish|npm\s+publish\s+--workspaces)\b/.test(
            s,
          ),
        )
      )
        issue("release", "mismatch", `${path}:${name}: 禁止批量发布`);
      if (runs.some((s) => /\b(?:npm|pnpm)\s+publish\b/.test(s))) {
        if (
          job.environment === undefined ||
          record(job.permissions ?? {})["id-token"] !== "write"
        )
          issue(
            "release",
            "mismatch",
            `${path}:${name}: npm 发布 job 必须 environment 和 id-token:write`,
          );
        if (JSON.stringify(job).match(/NODE_AUTH_TOKEN|NPM_TOKEN/))
          issue("release", "mismatch", `${path}:${name}: 不允许长效 npm token`);
        for (const command of runs.filter((s) =>
          /\b(?:npm|pnpm)\s+publish\b/.test(s),
        )) {
          if (!/--tag(?:=|\s+)(?:latest|rc|\$\{\{)/.test(command))
            issue(
              "release",
              "mismatch",
              `${path}:${name}: 必须显式 latest/rc channel`,
            );
          if (/\b--tag(?:=|\s+)(?:next|beta|canary)\b/.test(command))
            issue(
              "release",
              "mismatch",
              `${path}:${name}: 不允许其他发布 channel`,
            );
        }
      }
    }
    // A keyword match is evidence only of a potential operation, never of its guards.
    issue(
      "release",
      "unconfirmed",
      `${path}: 自定义发布语义不能静态证明；尚未支持的门卫包括唯一包映射/private 拒绝、rc 连续历史、版本不存在与内部依赖在线事实、main 可达性、已有准确 SHA/main-push/必需矩阵 CI 复用、OIDC 客户端、单次禁钩子 pack 与同 tarball 身份校验/发布、dispatch 只 dry-run`,
    );
  }
  if (!applicable)
    issue(
      "release",
      "missing",
      `npm 交付目标 ${projects.map((p) => p.directory || ".").join(", ")} 缺少明确发布 workflow`,
    );
}
