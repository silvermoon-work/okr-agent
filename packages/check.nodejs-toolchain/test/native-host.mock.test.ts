import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandResult } from "../src/command.js";
import type * as command from "../src/command.js";
import { nativeHost, type ToolEntry } from "../src/inspect.js";

const mocks = vi.hoisted(() => {
  const files = new Map<string, string>();
  const aliases = new Map<string, string>();
  return {
    files,
    aliases,
    access: vi.fn((path: string) => {
      if (!files.has(path))
        return Promise.reject(
          Object.assign(new Error("missing"), { code: "ENOENT" }),
        );
      return Promise.resolve();
    }),
    readFile: vi.fn((path: string) => Promise.resolve(files.get(path) ?? "")),
    realpath: vi.fn((path: string) =>
      Promise.resolve(aliases.get(path) ?? path),
    ),
    stat: vi.fn(() =>
      Promise.resolve({
        isFile: (): boolean => true,
        isDirectory: (): boolean => true,
      }),
    ),
    execute: vi.fn<(...args: unknown[]) => Promise<CommandResult>>(),
    homedir: vi.fn(() => resolve("mock-home")),
  };
});
vi.mock("node:fs/promises", () => mocks);
vi.mock("node:os", () => ({ homedir: mocks.homedir }));
vi.mock("../src/command.js", async (original) => ({
  ...(await original<typeof command>()),
  execute: mocks.execute,
}));

const platformDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "platform",
)!;
const cwd = resolve("mock-project");
const bin = resolve("mock-tools");
const home = resolve("mock-home");
const signal = () => new AbortController().signal;
const tool = (name: string): ToolEntry => ({
  executable: join(bin, name),
  args: ["fixed"],
  realPath: join(bin, name),
});
function platform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value, configurable: true });
}
function windowsHost() {
  platform("win32");
  return nativeHost({ PATH: bin, PATHEXT: ".CMD", USERPROFILE: home });
}
const npmShim = String.raw`:: Created by npm, please don't edit manually.
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.files.clear();
  mocks.aliases.clear();
  mocks.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => true });
  mocks.execute.mockResolvedValue({ code: 0, stdout: "1.2.3\n" });
});
afterEach(() => {
  Object.defineProperty(process, "platform", platformDescriptor);
});

describe("native discovery with isolated filesystem mocks", () => {
  it("rejects relative PATH, skips empty entries and directories, and preserves canonical selection", async () => {
    const host = windowsHost();
    expect(await nativeHost({}).locate("node", cwd)).toBeUndefined();
    await expect(
      nativeHost({ PATH: "relative" }).locate("node", cwd),
    ).rejects.toThrow("Relative PATH");
    mocks.files.set(join(bin, "node.cmd"), "");
    mocks.stat.mockResolvedValueOnce({
      isFile: () => false,
      isDirectory: () => true,
    });
    expect(await host.locate("node", cwd)).toBeUndefined();
    mocks.aliases.set(join(bin, "node.cmd"), join(bin, "actual-node.exe"));
    expect(
      await nativeHost({ Path: `"${bin}"`, PATHEXT: ".CMD;;" }).locate(
        "node",
        cwd,
      ),
    ).toEqual({
      executable: join(bin, "node.cmd"),
      args: [],
      realPath: join(bin, "actual-node.exe"),
    });
    mocks.files.set(join(bin, "node.js"), "");
    await expect(
      nativeHost({ PATH: bin, PATHEXT: ".JS" }).locate("node", cwd),
    ).rejects.toThrow("extension");
  });

  it("distinguishes missing paths from inspection permission failures", async () => {
    const host = windowsHost();
    mocks.access.mockRejectedValueOnce(
      Object.assign(new Error("not a directory"), { code: "ENOTDIR" }),
    );
    expect(await host.locate("node", cwd)).toBeUndefined();
    mocks.access.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "EACCES" }),
    );
    await expect(host.locate("node", cwd)).rejects.toThrow(
      "could not be inspected",
    );
  });

  it("establishes Unix nvm without loading profiles or executing a discovery shell", async () => {
    platform("linux");
    expect(await nativeHost({}).locate("nvm", cwd)).toBeUndefined();
    await expect(
      nativeHost({ NVM_DIR: "relative" }).locate("nvm", cwd),
    ).rejects.toThrow("absolute");
    const host = nativeHost({ NVM_DIR: home });
    expect(await host.locate("nvm", cwd)).toBeUndefined();
    mocks.files.set(join(home, "nvm.sh"), "");
    await expect(host.locate("nvm", cwd)).rejects.toThrow("/bin/bash");
    mocks.files.set("/bin/bash", "");
    expect(await host.locate("nvm", cwd)).toMatchObject({
      executable: "/bin/bash",
      args: [
        "--noprofile",
        "--norc",
        "-c",
        expect.stringContaining("--no-use"),
        "nodejs-toolchain-nvm",
        join(home, "nvm.sh"),
      ],
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["win32", "linux"] as const)(
    "checks %s nrm shim target and pinned package before execution",
    async (os) => {
      platform(os);
      const bins = os === "win32" ? bin : join(bin, ".bin");
      const entry = join(bins, os === "win32" ? "nrm.cmd" : "nrm");
      const cli = resolve(bins, "..", "nrm", "dist", "index.js");
      const host = nativeHost({ PATH: bins, PATHEXT: ".CMD" });
      mocks.files.set(entry, "unrecognized");
      await expect(host.locate("nrm", cwd)).rejects.toThrow("provenance");
      mocks.files.set(
        entry,
        os === "win32"
          ? '@node "%~dp0/../nrm/dist/index.js" %*'
          : '#!/bin/sh\nexec node "$basedir/../nrm/dist/index.js" "$@"\n',
      );
      const manifest = join(dirname(dirname(cli)), "package.json");
      mocks.files.set(manifest, '{"name":"nrm","version":"2.1.0"}');
      await expect(host.locate("nrm", cwd)).rejects.toThrow(
        "read-only startup",
      );
      mocks.files.set(manifest, '{"name":"nrm","version":"1.2.6"}');
      expect(await host.locate("nrm", cwd)).toMatchObject({
        executable: entry,
      });
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  it.each(["linux", "darwin", "win32"] as const)(
    "inspects %s pnpm startup config without running pnpm",
    async (os) => {
      platform(os);
      const selected = join(bin, os === "win32" ? "pnpm.cmd" : "pnpm");
      mocks.files.set(selected, "");
      mocks.files.set(join(cwd, "package.json"), "{}");
      const config =
        os === "darwin"
          ? join(home, "Library", "Preferences", "pnpm", "config.yaml")
          : os === "win32"
            ? join(home, "pnpm", "config", "config.yaml")
            : join(home, ".config", "pnpm", "config.yaml");
      const host = nativeHost({
        PATH: bin,
        PATHEXT: ".CMD",
        HOME: home,
        USERPROFILE: home,
        LOCALAPPDATA: home,
      });
      mocks.files.set(config, "configDependencies: {}\n");
      await expect(host.locate("pnpm", cwd)).rejects.toThrow(
        "must not install",
      );
      mocks.files.set(config, "registry: [");
      await expect(host.locate("pnpm", cwd)).rejects.toThrow("safely inspect");
      mocks.files.set(config, "{}");
      expect(await host.locate("pnpm", cwd)).toMatchObject({
        executable: selected,
      });
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  it("checks canonical projects, node_modules local prefixes and effective global npmrc", async () => {
    const host = windowsHost();
    const project = join(cwd, "node_modules", "node_modules");
    const canonical = resolve("mock-canonical");
    mocks.aliases.set(project, canonical);
    mocks.files.set(join(bin, "pnpm.cmd"), "");
    mocks.files.set(join(bin, "node.cmd"), "");
    mocks.files.set(join(cwd, ".npmrc"), "config_dependencies[]=package");
    await expect(host.locate("pnpm", project)).rejects.toThrow(
      "must not install",
    );
    mocks.files.set(join(cwd, ".npmrc"), "");
    mocks.files.set(join(canonical, "pnpm-workspace.yaml"), "packages: []");
    mocks.files.set(join(bin, "etc", "npmrc"), "config-dependencies.owned=1");
    await expect(host.locate("pnpm", project)).rejects.toThrow(
      "must not install",
    );
    mocks.files.set(join(bin, "etc", "npmrc"), "");
    expect(await host.locate("pnpm", project)).toBeDefined();
  });
});

describe("native npm provenance and process delegation", () => {
  it.each(["#!/usr/bin/env node", "#!/usr/bin/node", "#!/untrusted/node"])(
    "handles npm shebang %s",
    async (shebang) => {
      platform("linux");
      const cli = join(bin, "npm-cli.js");
      const host = nativeHost({ PATH: bin });
      mocks.files.set(cli, `${shebang}\n`);
      mocks.files.set(join(bin, "node"), "");
      const location = await host.npmLocation(
        { ...tool("npm"), realPath: cli },
        cwd,
        signal(),
      );
      expect(location).toEqual(
        shebang === "#!/untrusted/node"
          ? undefined
          : {
              cli,
              node:
                shebang === "#!/usr/bin/env node"
                  ? join(bin, "node")
                  : "/usr/bin/node",
            },
      );
      expect(
        await host.npmLocation(tool("npm"), cwd, signal()),
      ).toBeUndefined();
      mocks.files.delete(join(bin, "node"));
      mocks.files.set(cli, "#!/usr/bin/env node\n");
      expect(
        await host.npmLocation(
          { ...tool("npm"), realPath: cli },
          cwd,
          signal(),
        ),
      ).toBeUndefined();
    },
  );

  it("accepts only the recognized Windows shim and honors canonical prefix overrides", async () => {
    const host = windowsHost();
    const npm = tool("npm.cmd");
    expect(
      await host.npmLocation(tool("npm.exe"), cwd, signal()),
    ).toBeUndefined();
    mocks.files.set(npm.executable, "@node npm-cli.js %*");
    expect(await host.npmLocation(npm, cwd, signal())).toBeUndefined();
    mocks.files.set(npm.executable, npmShim.replaceAll("\n", "\r\n"));
    expect(await host.npmLocation(npm, cwd, signal())).toBeUndefined();
    const cli = join(bin, "node_modules", "npm", "bin", "npm-cli.js");
    mocks.files.set(cli, "");
    expect(await host.npmLocation(npm, cwd, signal())).toBeUndefined();
    mocks.files.set(join(bin, "node.exe"), "");
    const prefix = resolve("mock-prefix");
    mocks.execute.mockResolvedValue({ code: 0, stdout: `${prefix}\n` });
    expect(await host.npmLocation(npm, cwd, signal())).toEqual({
      cli,
      node: join(bin, "node.exe"),
    });
    const override = join(prefix, "node_modules", "npm", "bin", "npm-cli.js");
    mocks.files.set(override, "");
    mocks.aliases.set(override, join(prefix, "canonical-cli.js"));
    expect(await host.npmLocation(npm, cwd, signal())).toEqual({
      cli: join(prefix, "canonical-cli.js"),
      node: join(bin, "node.exe"),
    });
    mocks.files.delete(join(bin, "node.exe"));
    mocks.files.set(join(bin, "node.cmd"), "");
    expect((await host.npmLocation(npm, cwd, signal()))?.node).toBe(
      join(bin, "node.cmd"),
    );
    for (const result of [
      { code: 1, stdout: prefix },
      { code: 0, stdout: "relative" },
      { code: 0, stdout: `${prefix}\nextra` },
    ]) {
      mocks.execute.mockResolvedValue(result);
      await expect(host.npmLocation(npm, cwd, signal())).rejects.toThrow(
        "effective npm shim provenance",
      );
    }
  });

  it("forwards fixed arguments and authorized environment, rejects unsupported interpolation", async () => {
    const env = { PATH: bin };
    const host = nativeHost(env);
    const abort = signal();
    expect(await host.run(tool("node"), ["--version"], cwd, abort)).toEqual({
      code: 0,
      stdout: "1.2.3\n",
    });
    expect(mocks.execute).toHaveBeenCalledWith(
      join(bin, "node"),
      ["fixed", "--version"],
      cwd,
      abort,
      env,
      10_000,
    );
    mocks.execute.mockResolvedValue({
      code: 0,
      stdout: "",
      unsupportedInterpolation: true,
    });
    await expect(host.run(tool("pnpm"), [], cwd, abort)).rejects.toThrow(
      "unsupported environment interpolation",
    );
  });

  it("rejects unknown pnpm configuration sources and validates YAML registry aliases", async () => {
    const host = windowsHost();
    const pnpm = tool("pnpm.cmd");
    await host.assertRegistryContext("npm", pnpm, cwd, signal());
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.execute.mockResolvedValue({ code: 1, stdout: "" });
    await expect(
      host.assertRegistryContext("pnpm", pnpm, cwd, signal()),
    ).rejects.toThrow("configuration sources");
    mocks.execute.mockResolvedValue({ code: 0, stdout: "relative" });
    await expect(
      host.assertRegistryContext("pnpm", pnpm, cwd, signal()),
    ).rejects.toThrow("configuration path");
    const global = join(home, "global.yml");
    mocks.execute.mockResolvedValue({ code: 0, stdout: global });
    for (const [text, error] of [
      ["registry: [", "safely"],
      ["registry: 42", "valid pnpm"],
      ["value: &url https://${HOST}/\nregistry: *url", "interpolation"],
    ]) {
      mocks.files.set(global, text!);
      await expect(
        host.assertRegistryContext("pnpm", pnpm, cwd, signal()),
      ).rejects.toThrow(error);
    }
    mocks.files.set(
      global,
      "value: &url https://example.test/\nregistry: *url",
    );
    await expect(
      host.assertRegistryContext("pnpm", pnpm, cwd, signal()),
    ).resolves.toBeUndefined();
    mocks.files.set(global, "{}");
    await expect(
      host.assertRegistryContext("pnpm", pnpm, cwd, signal()),
    ).resolves.toBeUndefined();
  });
});
