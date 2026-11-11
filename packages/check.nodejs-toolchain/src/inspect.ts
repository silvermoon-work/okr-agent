import { access, readFile, realpath, stat } from "node:fs/promises";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { Value } from "@sinclair/typebox/value";
import type { ProblemReporter } from "@silvermoon-work/check-task-sdk";
import { Input, type ProblemCode, type Tool } from "./contract.js";
import { errorCode, execute } from "./command.js";

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

export function registryUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Registry URL must be an absolute HTTP(S) URL.");
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[\s\\]/.test(value)
  )
    throw new Error(
      "Registry URL must not contain credentials, query, fragment or whitespace.",
    );
  // URL normalizes host/default ports/dot segments; path case and internal slashes remain significant.
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function validateInput(value: unknown): asserts value is Input {
  if (!Value.Check(Input, value))
    throw new Error("Invalid Node.js toolchain input schema.");
  const { requirements: r, context } = value;
  if (
    !isAbsolute(context.projectDirectory) ||
    /[\0\r\n]/.test(context.projectDirectory)
  )
    throw new Error("projectDirectory must be an absolute host directory.");
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
}

export function nativeHost(env: NodeJS.ProcessEnv = process.env): Host {
  const host: Host = {
    platform: process.platform,
    env,
    canonical: realpath,
    async locate(name) {
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
          return {
            executable: entry,
            args: [],
            realPath: await realpath(entry),
          };
        }
      }
      return undefined;
    },
    run: (entry, args, cwd, signal) =>
      execute(
        entry.executable,
        [...entry.args, ...args],
        cwd,
        signal,
        10_000,
        undefined,
        env,
      ),
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
  };
  return host;
}

export async function inspect(
  input: Input,
  signal: AbortSignal,
  report: ProblemReporter<ProblemCode>,
  host: Host = nativeHost(),
): Promise<void> {
  validateInput(input);
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
      const candidates = [
        join(prefix, "node_modules", "npm", "bin", "npm-cli.js"),
        join(prefix, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
      ].map(resolvePath);
      if (
        !candidates.includes(resolve(npmLocation.cli)) ||
        node.realPath !== npmLocation.node
      )
        report(
          "pairing-mismatch",
          "node/npm：当前 npm 不属于当前 Node 的标准安装布局；请使两者指向同一环境。",
        );
    }
  }
  if (r.management && tools.has("nvm")) {
    const nvm = tools.get("nvm")!;
    let managedRoot: string | undefined;
    if (host.platform === "win32") {
      const root = await host.run(nvm, ["root"], cwd, signal);
      const current = await host.run(nvm, ["current"], cwd, signal);
      const rootPath = /^Current Root:\s*(.+)$/im
        .exec(root.stdout.trim())?.[1]
        ?.trim();
      const version = /^v?(\d+\.\d+\.\d+)\s*$/.exec(current.stdout.trim())?.[1];
      if (root.code !== 0 || current.code !== 0)
        throw new Error("nvm-windows state inspection failed.");
      if (rootPath && isAbsolute(rootPath) && version)
        managedRoot = await host.canonical(join(rootPath, `v${version}`));
      else if (
        !/^(?:No current version|none|system)/i.test(current.stdout.trim())
      )
        throw new Error("Unknown nvm-windows state output.");
    } else {
      const current = await host.run(nvm, ["current"], cwd, signal);
      if (current.code !== 0)
        throw new Error("Unix nvm current inspection failed.");
      if (/^v\d+\.\d+\.\d+$/.test(current.stdout.trim())) {
        const which = await host.run(nvm, ["which", "current"], cwd, signal);
        const path = which.stdout.trim();
        if (which.code !== 0 || !isAbsolute(path) || /[\r\n\0]/.test(path))
          throw new Error("Unknown Unix nvm which output.");
        const home = host.env.NVM_DIR;
        if (!home || !isAbsolute(home)) throw new Error("NVM_DIR unavailable.");
        const root = await host.canonical(
          join(home, "versions", "node", current.stdout.trim()),
        );
        const actual = await host.canonical(path);
        if (!within(root, actual))
          throw new Error("Unix nvm provenance is inconsistent.");
        managedRoot = root;
      } else if (!/^(system|none)$/.test(current.stdout.trim()))
        throw new Error("Unknown Unix nvm state output.");
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
        !managedRoot ||
        !within(managedRoot, path) ||
        (name === "npm" &&
          npmLocation &&
          !within(managedRoot, npmLocation.node))
      )
        report(
          "management-mismatch",
          `${name}：当前入口不属于 nvm 当前选定的版本环境。`,
        );
    }
  }
  for (const name of ["npm", "pnpm"] as const) {
    const requirement = r.registries?.active?.[name];
    const entry = tools.get(name);
    if (!requirement || !entry) continue;
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

function resolvePath(path: string): string {
  return resolve(path);
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
