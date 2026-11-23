import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nativeHost,
  parseNrm,
  type Host,
  type ToolEntry,
} from "./legacy/inspect.js";
import { compareVersions } from "./legacy/tools.js";
import { errorCode } from "./command.js";
import { registryUrl } from "./execution-context.js";

export interface ToolFact extends ToolEntry {
  readonly version: string;
}
export interface Device {
  readonly host: Host;
  readonly directory: string;
  defaultPackages(
    this: void,
    nvm: ToolFact,
  ): Promise<readonly string[] | undefined>;
  registryState(
    this: void,
    nrm: ToolEntry,
  ): Promise<{
    readonly registrations: ReadonlyMap<string, string>;
    readonly selectedUrl?: string;
  }>;
}
export const environmentKeys = [
  "PATH",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "NVM_DIR",
  "NVM_HOME",
  "NVM_SYMLINK",
  "PNPM_HOME",
  "TEMP",
  "TMP",
  "SystemRoot",
  "WINDIR",
  "npm_config_userconfig",
  "npm_config_globalconfig",
  "npm_config_prefix",
  "npm_config_registry",
  "npm_config_global",
  "npm_config_location",
] as const;

export function deviceEnvironment(source: NodeJS.ProcessEnv) {
  const env: NodeJS.ProcessEnv = {};
  for (const name of environmentKeys) {
    const values = Object.keys(source)
      .filter((key) => key.toLowerCase() === name.toLowerCase())
      .map((key) => source[key])
      .filter((value) => value !== undefined);
    if (new Set(values).size > 1)
      throw new Error(`Conflicting device environment aliases: ${name}.`);
    if (values[0] !== undefined) env[name] = values[0];
  }
  if (!env.PATH) throw new Error("Device PATH is unavailable in this Worker.");
  return env;
}

export function nativeDevice(
  env: NodeJS.ProcessEnv,
  directory: string,
  signal: AbortSignal,
): Device {
  const host = nativeHost(env);
  return {
    host,
    directory,
    async defaultPackages(nvm) {
      signal.throwIfAborted();
      if (host.platform === "win32") {
        if (compareVersions(nvm.version, "2") < 0) return undefined;
        const result = await host.run(
          nvm,
          ["config", "get", "auto_installed_modules"],
          directory,
          signal,
        );
        if (result.code !== 0)
          throw new Error(
            "Cannot read nvm default global package configuration.",
          );
        const text = result.stdout
          .trim()
          .replace(/^auto_installed_modules\s*[:=]\s*/, "");
        return text ? text.split(",").map((item) => item.trim()) : [];
      }
      const home = env.NVM_DIR;
      if (!home) throw new Error("Device NVM_DIR is unavailable.");
      const path = join(home, "default-packages");
      try {
        if ((await stat(path)).size > 65_536)
          throw new Error("nvm default package configuration is too large.");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await readFile(path),
        );
        signal.throwIfAborted();
        return text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"));
      } catch (error) {
        if (errorCode(error) === "ENOENT") return undefined;
        throw error;
      }
    },
    async registryState(nrm) {
      const result = await host.run(nrm, ["ls"], directory, signal);
      if (result.code !== 0)
        throw new Error("Cannot read nrm registry configuration.");
      const registrations = parseNrm(result.stdout);
      const text = result.stdout.replace(
        new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
        "",
      );
      const selected = new Set<string>();
      for (const line of text.split(/\r?\n/)) {
        const name = /^\s*\*\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s+-+/.exec(
          line,
        )?.[1];
        if (name) selected.add(registrations.get(name)!);
      }
      if (selected.size > 1)
        throw new Error("Ambiguous nrm current registry selection.");
      const selectedUrl = [...selected][0];
      return {
        registrations,
        ...(selectedUrl === undefined
          ? {}
          : { selectedUrl: registryUrl(selectedUrl) }),
      };
    },
  };
}

export async function withDevice<T>(
  signal: AbortSignal,
  action: (device: Device) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const env = deviceEnvironment(process.env);
  const directory = await mkdtemp(join(tmpdir(), "nodejs-toolchain-"));
  try {
    return await action(nativeDevice(env, directory, signal));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
