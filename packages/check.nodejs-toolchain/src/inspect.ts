import { access, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { Value } from "@sinclair/typebox/value";
import { isAlias, isScalar, parseDocument } from "yaml";
import type { ProblemReporter } from "@silvermoon-work/check-task-sdk";
import { Input, type ProblemCode, type Tool } from "./contract.js";
import { errorCode, execute } from "./command.js";
import {
  absoluteHostPath,
  executionEnvironment,
  registryUrl,
  validateExecutionEnvironment,
} from "./execution-context.js";
export { registryUrl } from "./execution-context.js";

export function compareVersions(actual: string, expected: string): number {
  if (![actual, expected].every((v) => /^[0-9]+(?:\.[0-9]+)*$/.test(v)))
    throw new Error("Invalid numeric version.");
  const a = actual.split(".").map((p) => p.replace(/^0+(?=\d)/, ""));
  const b = expected.split(".").map((p) => p.replace(/^0+(?=\d)/, ""));
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? "0";
    const y = b[i] ?? "0";
    if (x.length !== y.length) return Math.sign(x.length - y.length);
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export function validateInput(value: unknown): asserts value is Input {
  if (!Value.Check(Input, value))
    throw new Error("Invalid Node.js toolchain input schema.");
  const { requirements: r, context } = value;
  if (
    !absoluteHostPath(context.projectDirectory) ||
    /[\0\r\n]/.test(context.projectDirectory)
  )
    throw new Error("projectDirectory must be an absolute host directory.");
  validateExecutionEnvironment(context.executionEnvironment);
  if (!Object.keys(r.tools ?? {}).length && !r.management && !r.registries)
    throw new Error("At least one actual requirement is required.");
  if (r.pairing?.npmWithNode && (!r.tools?.node || !r.tools.npm))
    throw new Error("Pairing requires declared node and npm.");
  for (const name of r.management?.appliesTo ?? [])
    if (!r.tools?.[name])
      throw new Error("Management references an undeclared tool.");
  for (const name of ["npm", "pnpm"] as const) {
    const registry = r.registries?.active?.[name];
    if (!registry) continue;
    if (!r.tools?.[name])
      throw new Error("Active registry references an undeclared tool.");
    const urls = registry.allowedUrls.map(registryUrl);
    if (new Set(urls).size !== urls.length)
      throw new Error("Duplicate equivalent registry URL.");
  }
  const names = new Set<string>();
  for (const registry of r.registries?.nrm?.required ?? []) {
    registryUrl(registry.url);
    if (names.has(registry.name))
      throw new Error("Duplicate or conflicting nrm registration name.");
    names.add(registry.name);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR")
      return false;
    throw new Error("Tool path could not be inspected.", { cause: error });
  }
}

export function within(root: string, path: string): boolean {
  const delta = relative(root, path);
  return (
    delta === "" ||
    (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`))
  );
}

export interface ToolEntry {
  readonly executable: string;
  readonly args: readonly string[];
  readonly realPath?: string;
}
export interface NpmLocation {
  readonly cli: string;
  readonly node: string;
}
const modernNpmShim = String.raw`:: Created by npm, please don't edit manually.
@ECHO OFF

SETLOCAL

SET "NODE_EXE=%~dp0\node.exe"
IF NOT EXIST "%NODE_EXE%" (
  SET "NODE_EXE=node"
)

SET "NPM_PREFIX_JS=%~dp0\node_modules\npm\bin\npm-prefix.js"
SET "NPM_CLI_JS=%~dp0\node_modules\npm\bin\npm-cli.js"
FOR /F "delims=" %%F IN ('CALL "%NODE_EXE%" "%NPM_PREFIX_JS%"') DO (
  SET "NPM_PREFIX_NPM_CLI_JS=%%F\node_modules\npm\bin\npm-cli.js"
)
IF EXIST "%NPM_PREFIX_NPM_CLI_JS%" (
  SET "NPM_CLI_JS=%NPM_PREFIX_NPM_CLI_JS%"
)

"%NODE_EXE%" "%NPM_CLI_JS%" %*`;
export interface Host {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  locate(name: Tool, cwd: string): Promise<ToolEntry | undefined>;
  run(
    entry: ToolEntry,
    args: readonly string[],
    cwd: string,
    signal: AbortSignal,
  ): ReturnType<typeof execute>;
  canonical(path: string): Promise<string>;
  npmLocation(
    entry: ToolEntry,
    cwd: string,
    signal: AbortSignal,
  ): Promise<NpmLocation | undefined>;
  assertRegistryContext(
    name: "npm" | "pnpm",
    entry: ToolEntry,
    cwd: string,
    signal: AbortSignal,
  ): Promise<void>;
}

async function pnpmLocalPrefix(cwd: string): Promise<string> {
  let directory = cwd;
  while (basename(directory) === "node_modules") {
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error("Cannot establish a safe pnpm local prefix.");
    directory = parent;
  }
  if (directory !== cwd) return directory;
  // pnpm 10.22/11.22 use these same local-prefix anchors before loading .npmrc.
  for (;;) {
    if (
      directory === "/" ||
      (process.platform === "win32" && /^[a-z]:[\\/]?$/i.test(directory))
    )
      return cwd;
    for (const name of [
      "node_modules",
      "package.json",
      "package.json5",
      "package.yaml",
      "pnpm-workspace.yaml",
    ])
      if (await exists(join(directory, name))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return cwd;
    directory = parent;
  }
}

async function assertPnpmStartup(
  cwd: string,
  env: NodeJS.ProcessEnv,
  node?: ToolEntry,
): Promise<void> {
  const home =
    (process.platform === "win32" ? env.USERPROFILE : env.HOME) ?? homedir();
  const configDirectory = env.XDG_CONFIG_HOME
    ? join(env.XDG_CONFIG_HOME, "pnpm")
    : process.platform === "darwin"
      ? join(home, "Library", "Preferences", "pnpm")
      : process.platform === "win32" && env.LOCALAPPDATA
        ? join(env.LOCALAPPDATA, "pnpm", "config")
        : join(home, ".config", "pnpm");
  const yamlPaths = [join(configDirectory, "config.yaml")];
  const iniPaths = [
    join(configDirectory, "rc"),
    env.npm_config_userconfig ?? join(home, ".npmrc"),
  ];
  if (env.npm_config_globalconfig) iniPaths.push(env.npm_config_globalconfig);
  else if (node?.realPath) {
    const prefix =
      env.npm_config_prefix ??
      (process.platform === "win32"
        ? dirname(node.realPath)
        : resolve(dirname(node.realPath), ".."));
    iniPaths.push(join(prefix, "etc", "npmrc"));
  }
  for (const project of new Set([cwd, await realpath(cwd)])) {
    iniPaths.push(
      join(project, ".npmrc"),
      join(await pnpmLocalPrefix(project), ".npmrc"),
    );
    for (let directory = project; ; directory = dirname(directory)) {
      const path = join(directory, "pnpm-workspace.yaml");
      if (await exists(path)) {
        yamlPaths.push(path);
        iniPaths.push(join(directory, ".npmrc"));
        break;
      }
      if (dirname(directory) === directory) break;
    }
  }
  for (const path of new Set(yamlPaths)) {
    if (!(await exists(path))) continue;
    const document = parseDocument(await readFile(path, "utf8"));
    if (document.errors.length)
      throw new Error("Cannot safely inspect pnpm startup configuration.");
    if (
      document.has("configDependencies") ||
      document.has("config-dependencies")
    )
      throw new Error(
        "pnpm configDependencies are unsupported: inspection must not install configuration packages.",
      );
  }
  for (const path of new Set(iniPaths)) {
    if (!(await exists(path))) continue;
    const text = await readFile(path, "utf8");
    if (
      /^\s*(?:config[-_]?dependencies)(?:\.[^=\r\n]+|\[[^\]\r\n]*\])?\s*=|^\s*\[config[-_]?dependencies\]\s*$/im.test(
        text,
      )
    )
      throw new Error(
        "pnpm configDependencies are unsupported: inspection must not install configuration packages.",
      );
  }
}

export function posixNrmTarget(shim: string): string | undefined {
  if (!shim.startsWith("#!/bin/sh\n")) return undefined;
  const targets = new Set(
    [
      ...shim.matchAll(
        /^\s*exec\s+(?:"\$basedir\/node(?:\.exe)?"|node(?:\.exe)?)\s+(?:"\$(?:basedir|basedir_win)\/([A-Za-z0-9_@./+~-]+(?:cli\.js|dist\/index\.js))"|"\$(?:basedir_abs|basedir_win)"\/'([A-Za-z0-9_@./+~-]+(?:cli\.js|dist\/index\.js))')\s+"\$@"\s*$/gm,
      ),
    ].map((match) => match[1] ?? match[2]),
  );
  return targets.size === 1 ? [...targets][0] : undefined;
}

export function nativeHost(env: NodeJS.ProcessEnv): Host {
  const host: Host = {
    platform: process.platform,
    env,
    canonical: realpath,
    async locate(name, cwd) {
      if (name === "nvm" && process.platform !== "win32") {
        const home = env.NVM_DIR;
        if (!home) return undefined;
        if (!isAbsolute(home)) throw new Error("NVM_DIR must be absolute.");
        const script = join(home, "nvm.sh");
        if (!(await exists(script))) return undefined;
        // No login/profile shell, inherited shell functions, or caller-supplied shell source.
        if (!(await exists("/bin/bash")))
          throw new Error("Unix nvm requires /bin/bash.");
        return {
          executable: "/bin/bash",
          args: [
            "--noprofile",
            "--norc",
            "-c",
            '. "$1" --no-use >/dev/null; command -v nvm >/dev/null || exit 125; shift; nvm "$@"',
            "nodejs-toolchain-nvm",
            script,
          ],
        };
      }
      const path = env.PATH ?? env.Path ?? "";
      for (let directory of path.split(delimiter)) {
        directory = directory.replace(/^"|"$/g, "");
        if (!isAbsolute(directory)) {
          // Relative PATH can execute project code; never silently skip to another installation.
          if (directory)
            throw new Error("Relative PATH entries are unsupported.");
          continue;
        }
        const extensions =
          process.platform === "win32"
            ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
                .toLowerCase()
                .split(";")
                .filter(Boolean)
            : [""];
        for (const suffix of extensions) {
          const entry = join(directory, `${name}${suffix}`);
          if (!(await exists(entry))) continue;
          if (!(await stat(entry)).isFile()) continue;
          if (
            process.platform === "win32" &&
            ![".exe", ".com", ".cmd", ".bat"].includes(suffix)
          )
            throw new Error("Unsupported selected PATH executable extension.");
          const selected = {
            executable: entry,
            args: [],
            realPath: await realpath(entry),
          };
          if (name === "pnpm")
            await assertPnpmStartup(cwd, env, await host.locate("node", cwd));
          if (name === "nrm") {
            let cli = selected.realPath;
            if (process.platform === "win32") {
              const shim = await readFile(entry, "utf8");
              const relativeCli =
                /"%~dp0[\\/]([^"\r\n]+(?:cli\.js|dist[\\/]index\.js))"/.exec(
                  shim,
                )?.[1];
              if (!relativeCli)
                throw new Error(
                  "Cannot establish read-only nrm entry provenance.",
                );
              cli = await realpath(resolve(dirname(entry), relativeCli));
            } else if (dirname(selected.realPath).endsWith(`${sep}.bin`)) {
              const shim = await readFile(entry, "utf8");
              const relativeCli = posixNrmTarget(shim);
              if (!relativeCli)
                throw new Error(
                  "Cannot establish read-only nrm entry provenance.",
                );
              cli = await realpath(
                resolve(dirname(selected.realPath), relativeCli),
              );
            }
            const packageRoot = cli.endsWith(`${sep}cli.js`)
              ? dirname(cli)
              : dirname(dirname(cli));
            const manifest = JSON.parse(
              await readFile(join(packageRoot, "package.json"), "utf8"),
            ) as {
              name?: string;
              version?: string;
            };
            // nrm 2.1.0 rewrites ~/.npmrc even for --version/ls. Never invoke it.
            if (manifest.name !== "nrm" || manifest.version !== "1.2.6")
              throw new Error(
                "Unsupported nrm implementation: read-only startup is verified only for nrm 1.2.6.",
              );
          }
          return selected;
        }
      }
      return undefined;
    },
    async run(entry, args, cwd, signal) {
      const result = await execute(
        entry.executable,
        [...entry.args, ...args],
        cwd,
        signal,
        env,
        10_000,
      );
      if (result.unsupportedInterpolation)
        throw new Error(
          "Tool configuration requires unsupported environment interpolation.",
        );
      return result;
    },
    async npmLocation(entry, cwd, signal) {
      if (process.platform !== "win32") {
        if (!entry.realPath?.endsWith(`${sep}npm-cli.js`)) return undefined;
        const source = await readFile(entry.realPath, "utf8");
        const shebang = source.split(/\r?\n/, 1)[0];
        const node =
          shebang === "#!/usr/bin/env node"
            ? (await host.locate("node", cwd))?.realPath
            : shebang === "#!/usr/bin/node"
              ? await host.canonical("/usr/bin/node")
              : undefined;
        return node ? { cli: entry.realPath, node } : undefined;
      }
      if (!/\.cmd$/i.test(entry.executable)) return undefined;
      const shim = await readFile(entry.executable, "utf8");
      const base = dirname(entry.executable);
      const npmCli = join(base, "node_modules", "npm", "bin", "npm-cli.js");
      if (shim.replaceAll("\r\n", "\n").trim() !== modernNpmShim)
        return undefined;
      if (!(await exists(npmCli))) return undefined;
      const adjacentNode = join(base, "node.exe");
      const node = (await exists(adjacentNode))
        ? {
            executable: adjacentNode,
            args: [],
            realPath: await realpath(adjacentNode),
          }
        : await host.locate("node", cwd);
      if (!node?.realPath) return undefined;
      // Modern npm.cmd can select npm from the effective global prefix. Honor that choice.
      if (shim.includes("NPM_PREFIX_NPM_CLI_JS")) {
        const prefixScript = join(
          base,
          "node_modules",
          "npm",
          "bin",
          "npm-prefix.js",
        );
        const result = await host.run(node, [prefixScript], cwd, signal);
        const prefix = result.stdout.trim();
        if (result.code !== 0 || !isAbsolute(prefix) || /[\r\n\0]/.test(prefix))
          throw new Error("Cannot establish effective npm shim provenance.");
        const override = join(
          prefix,
          "node_modules",
          "npm",
          "bin",
          "npm-cli.js",
        );
        if (await exists(override))
          return { cli: await realpath(override), node: node.realPath };
      }
      return { cli: await realpath(npmCli), node: node.realPath };
    },
    async assertRegistryContext(name, entry, cwd, signal) {
      if (name !== "pnpm") return;
      const configurations: string[] = [];
      for (let directory = cwd; ; directory = dirname(directory)) {
        const path = join(directory, "pnpm-workspace.yaml");
        if (await exists(path)) {
          configurations.push(path);
          break;
        }
        if (dirname(directory) === directory) break;
      }
      const global = await host.run(
        entry,
        ["config", "get", "globalconfig"],
        cwd,
        signal,
      );
      if (global.code !== 0)
        throw new Error(
          "Cannot establish effective pnpm configuration sources.",
        );
      const path = global.stdout.trim();
      if (!absoluteHostPath(path))
        throw new Error("Unknown pnpm global configuration path output.");
      if (
        absoluteHostPath(path) &&
        /\.ya?ml$/i.test(path) &&
        (await exists(path))
      )
        configurations.push(path);
      for (const configuration of configurations) {
        const document = parseDocument(await readFile(configuration, "utf8"));
        if (document.errors.length)
          throw new Error("Cannot inspect pnpm registry configuration safely.");
        const selected: unknown = document.get("registry", true);
        const registry = isAlias(selected)
          ? selected.resolve(document)
          : selected;
        if (
          registry !== undefined &&
          (!isScalar(registry) || typeof registry.value !== "string")
        )
          throw new Error(
            "Cannot establish a valid pnpm default registry value.",
          );
        // pnpm 11 silently ignores these placeholders. A permitted fallback URL
        // must not conceal an unsupported intended registry requirement.
        if (
          isScalar(registry) &&
          typeof registry.value === "string" &&
          registry.value.includes("${")
        )
          throw new Error(
            "Unsupported registry interpolation in pnpm configuration.",
          );
      }
    },
  };
  return host;
}

export async function inspect(
  input: Input,
  signal: AbortSignal,
  report: ProblemReporter<ProblemCode>,
  suppliedHost?: Host,
): Promise<void> {
  validateInput(input);
  const host =
    suppliedHost ??
    nativeHost(executionEnvironment(input.context.executionEnvironment));
  signal.throwIfAborted();
  const cwd = input.context.projectDirectory;
  if (!(await stat(cwd)).isDirectory())
    throw new Error("projectDirectory must exist and be a directory.");
  if (!["win32", "linux", "darwin"].includes(host.platform))
    throw new Error("Unsupported execution platform.");
  const r = input.requirements;
  const requested = new Set<Tool>(Object.keys(r.tools ?? {}) as Tool[]);
  if (r.management) requested.add("nvm");
  if (r.registries?.nrm) requested.add("nrm");
  const tools = new Map<Tool, ToolEntry>();
  for (const name of requested) {
    const entry = await host.locate(name, cwd);
    if (!entry) {
      report("tool-missing", `${name}：当前执行上下文中未找到所需工具。`);
      continue;
    }
    const output = await host.run(
      entry,
      [name === "nvm" && host.platform === "win32" ? "version" : "--version"],
      cwd,
      signal,
    );
    if (output.code !== 0) {
      report(
        "tool-unusable",
        `${name}：版本命令不可用（退出码 ${String(output.code)}）；未输出可能含秘密的命令内容。`,
      );
      continue;
    }
    const version = /^v?([0-9]+(?:\.[0-9]+)+)\s*$/.exec(
      output.stdout.trim(),
    )?.[1];
    if (!version) {
      report(
        "version-unparseable",
        `${name}：成功执行版本命令，但无法识别其数字版本。`,
      );
      continue;
    }
    tools.set(name, entry);
    const minimum = r.tools?.[name]?.minimumVersion;
    if (minimum && compareVersions(version, minimum) < 0)
      report(
        "version-too-low",
        `${name}：当前 ${version}，要求不低于 ${minimum}。`,
      );
  }

  const node = tools.get("node");
  const npm = tools.get("npm");
  const npmLocation =
    npm && (r.pairing?.npmWithNode || r.management?.appliesTo.includes("npm"))
      ? await host.npmLocation(npm, cwd, signal)
      : undefined;
  if (r.pairing?.npmWithNode && node && npm) {
    if (!node.realPath || !npmLocation) {
      report(
        "pairing-unconfirmed",
        "node/npm：无法确认当前 npm 入口与 Node 安装环境的关系。",
      );
    } else {
      const prefix = dirname(node.realPath);
      const candidates: string[] = [];
      for (const candidate of [
        join(prefix, "node_modules", "npm", "bin", "npm-cli.js"),
        join(prefix, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
      ]) {
        try {
          candidates.push(await host.canonical(candidate));
        } catch (error) {
          if (!["ENOENT", "ENOTDIR"].includes(errorCode(error) ?? ""))
            throw error;
        }
      }
      if (
        !candidates.includes(resolve(npmLocation.cli)) ||
        node.realPath !== npmLocation.node
      )
        if (
          npmLocation.node !== node.realPath ||
          npmLocation.cli.includes(`${sep}node_modules${sep}npm${sep}bin${sep}`)
        )
          report(
            "pairing-mismatch",
            "node/npm：当前 npm 不属于当前 Node 的安装环境；请使两者指向同一环境。",
          );
        else
          report(
            "pairing-unconfirmed",
            "node/npm：当前 npm 为非标准拆分布局，无法确认与 Node 安装环境的关系。",
          );
    }
  }
  if (r.management && tools.has("nvm")) {
    const nvm = tools.get("nvm")!;
    const managedRoots: string[] = [];
    if (host.platform === "win32") {
      const root = await host.run(nvm, ["root"], cwd, signal);
      const installed = await host.run(nvm, ["list"], cwd, signal);
      const rootPath = /^Current Root:\s*(.+)$/im
        .exec(root.stdout.trim())?.[1]
        ?.trim();
      if (root.code !== 0 || installed.code !== 0)
        throw new Error("nvm-windows state inspection failed.");
      if (!rootPath || !absoluteHostPath(rootPath))
        throw new Error("Unknown nvm-windows root output.");
      if (!/^No installations recognized\.?$/i.test(installed.stdout.trim())) {
        for (const line of installed.stdout
          .split(/\r?\n/)
          .filter((line) => line.trim())) {
          const version =
            /^\s*\*?\s*v?(\d+\.\d+\.\d+)(?:\s+\(Currently using (?:32|64)-bit executable\))?\s*$/i.exec(
              line,
            )?.[1];
          if (!version)
            throw new Error("Unknown nvm-windows installed-version output.");
          managedRoots.push(
            await host.canonical(join(rootPath, `v${version}`)),
          );
        }
        if (!managedRoots.length)
          throw new Error("Empty nvm-windows installed-version output.");
      }
    } else {
      const home = host.env.NVM_DIR;
      if (!home || !absoluteHostPath(home))
        throw new Error("NVM_DIR unavailable.");
      const base = await host.canonical(join(home, "versions", "node"));
      for (const toolPath of [
        node?.realPath,
        npmLocation?.cli,
        npmLocation?.node,
      ]) {
        if (!toolPath || !within(base, toolPath)) continue;
        const version = relative(base, toolPath).split(sep)[0];
        if (!version || !/^v\d+\.\d+\.\d+$/.test(version))
          throw new Error("Unknown Unix nvm installation layout.");
        const root = await host.canonical(join(base, version));
        if (managedRoots.includes(root)) continue;
        const which = await host.run(nvm, ["which", version], cwd, signal);
        const path = which.stdout.trim();
        if (which.code !== 0 || !isAbsolute(path) || /[\r\n\0]/.test(path))
          throw new Error("Unknown Unix nvm which output.");
        const actual = await host.canonical(path);
        if (!within(root, actual))
          throw new Error("Unix nvm provenance is inconsistent.");
        managedRoots.push(root);
      }
    }
    for (const name of r.management.appliesTo) {
      const entry = tools.get(name);
      if (!entry) continue;
      const path = name === "node" ? entry.realPath : npmLocation?.cli;
      if (!path)
        report(
          "management-unconfirmed",
          `${name}：无法确认当前入口与 nvm 管理环境的关系。`,
        );
      else if (
        !managedRoots.some((root) => within(root, path)) ||
        (name === "npm" &&
          npmLocation &&
          !managedRoots.some((root) => within(root, npmLocation.node)))
      )
        report(
          "management-mismatch",
          `${name}：当前入口或其运行时不属于 nvm 已确认管理的安装环境。`,
        );
    }
  }
  for (const name of ["npm", "pnpm"] as const) {
    const requirement = r.registries?.active?.[name];
    const entry = tools.get(name);
    if (!requirement || !entry) continue;
    await host.assertRegistryContext(name, entry, cwd, signal);
    const result = await host.run(
      entry,
      ["config", "get", "registry"],
      cwd,
      signal,
    );
    if (result.code !== 0) {
      report(
        "registry-unusable",
        `${name}：无法读取项目上下文中的有效默认 registry（退出码 ${String(result.code)}）。`,
      );
      continue;
    }
    let actual: string;
    try {
      actual = registryUrl(result.stdout.trim());
    } catch {
      // Never echo raw effective configuration: it may contain embedded credentials.
      throw new Error(
        `${name}: effective registry is invalid or contains sensitive URL components.`,
      );
    }
    if (!requirement.allowedUrls.some((url) => registryUrl(url) === actual))
      report(
        "registry-mismatch",
        `${name}：有效默认 registry 不在声明的 allowedUrls 中；实际 URL 已隐藏以避免泄露配置。`,
      );
  }
  if (r.registries?.nrm && tools.has("nrm")) {
    const output = await host.run(tools.get("nrm")!, ["ls"], cwd, signal);
    if (output.code !== 0) throw new Error("nrm registry inspection failed.");
    const registrations = parseNrm(output.stdout);
    for (const required of r.registries.nrm.required) {
      const actual = registrations.get(required.name);
      if (actual === undefined)
        report(
          "nrm-registration-missing",
          `nrm：缺少注册名称 ${required.name}。`,
        );
      else if (actual !== registryUrl(required.url))
        report(
          "nrm-registration-mismatch",
          `nrm：注册名称 ${required.name} 的 URL 与要求不符；实际 URL 已隐藏。`,
        );
    }
  }
  signal.throwIfAborted();
}

export function parseNrm(output: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  const text = output.replace(
    new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
    "",
  );
  for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
    const match =
      /^\s*\*?\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s+-+\s+(https?:\/\/\S+)\s*$/.exec(
        line,
      );
    if (!match?.[1] || !match[2] || entries.has(match[1]))
      throw new Error("Unknown or ambiguous nrm ls output.");
    entries.set(match[1], registryUrl(match[2]));
  }
  if (!entries.size)
    throw new Error("Empty nrm ls output cannot establish registration state.");
  return entries;
}
