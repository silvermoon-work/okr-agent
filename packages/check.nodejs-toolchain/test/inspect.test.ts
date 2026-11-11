import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import contract, {
  type Input,
  type ProblemCode,
  type Tool,
} from "../src/contract.js";
import {
  compareVersions,
  inspect,
  nativeHost,
  parseNrm,
  registryUrl,
  validateInput,
  within,
  type Host,
  type ToolEntry,
} from "../src/inspect.js";
import { execute, stopTree } from "../src/command.js";

const cwd = resolve(".");
const signal = () => new AbortController().signal;
const entry = (name: Tool): ToolEntry => ({
  executable: join(cwd, name),
  args: [],
  realPath: join(cwd, "nvm", "v22.13.0", name === "node" ? "node.exe" : name),
});
function fixture(
  options: {
    missing?: Tool[];
    output?: Partial<Record<string, string>>;
    codes?: Partial<Record<string, number>>;
    npm?: string | null;
    npmNode?: string;
    platform?: NodeJS.Platform;
  } = {},
): Host {
  return {
    platform: options.platform ?? "win32",
    env: { NVM_DIR: join(cwd, "nvm") },
    canonical: (path) => Promise.resolve(path),
    locate: (name) =>
      Promise.resolve(
        options.missing?.includes(name) ? undefined : entry(name),
      ),
    npmLocation: () =>
      Promise.resolve(
        options.npm === null
          ? undefined
          : {
              cli:
                options.npm ??
                join(
                  cwd,
                  "nvm",
                  "v22.13.0",
                  "node_modules",
                  "npm",
                  "bin",
                  "npm-cli.js",
                ),
              node: options.npmNode ?? entry("node").realPath!,
            },
      ),
    run: (tool, args) => {
      const name = tool.executable.slice(cwd.length + 1);
      const key = `${name}:${args.join(" ")}`;
      const output =
        options.output?.[key] ??
        (args[0] === "--version" || args[0] === "version"
          ? "22.13.0\n"
          : args[0] === "root"
            ? `Current Root: ${join(cwd, "nvm")}\n`
            : args[0] === "current"
              ? "v22.13.0\n"
              : args[0] === "config"
                ? "https://example.test/registry/\n"
                : args[0] === "ls"
                  ? "* target ---- https://example.test/registry/\nextra ---- https://extra.test/\n"
                  : "");
      return Promise.resolve({
        code: options.codes?.[key] ?? 0,
        stdout: output,
      });
    },
  };
}
async function check(requirements: Input["requirements"], host = fixture()) {
  const problems: { code: ProblemCode; brief: string }[] = [];
  await inspect(
    { context: { projectDirectory: cwd }, requirements },
    signal(),
    (code, brief) => {
      problems.push({ code, brief });
    },
    host,
  );
  return problems;
}
const all: Input["requirements"] = {
  tools: { node: {}, npm: {}, pnpm: {} },
  pairing: { npmWithNode: true },
  management: { provider: "nvm", appliesTo: ["node", "npm"] },
  registries: {
    active: {
      npm: {
        allowedUrls: ["https://other.test", "https://example.test/registry"],
      },
      pnpm: { allowedUrls: ["https://example.test/registry/"] },
    },
    nrm: {
      required: [{ name: "target", url: "https://example.test/registry" }],
    },
  },
};

describe("composite requirements", () => {
  it("does not require undeclared tools or a manager, and accepts independent empty tool policies", async () => {
    expect(
      await check(
        { tools: { node: {} } },
        fixture({ missing: ["npm", "pnpm", "nvm", "nrm"] }),
      ),
    ).toEqual([]);
    expect(
      await check({ tools: { npm: {} }, pairing: { npmWithNode: false } }),
    ).toEqual([]);
    expect(await check(all)).toEqual([]);
  });
  it("compares numeric segments without precision loss and handles equality/zero padding", async () => {
    expect(compareVersions("001.2", "1.2.0")).toBe(0);
    expect(compareVersions("2.0", "1.999999999999999999999999999")).toBe(1);
    expect(
      compareVersions(
        "1.999999999999999999999999998",
        "1.999999999999999999999999999",
      ),
    ).toBe(-1);
    expect(
      await check({
        tools: {
          node: { minimumVersion: "22.13.0" },
          npm: { minimumVersion: "22.12" },
        },
      }),
    ).toEqual([]);
    expect(
      await check({ tools: { node: { minimumVersion: "23" } } }),
    ).toMatchObject([
      {
        code: "version-too-low",
        brief: expect.stringContaining("22.13.0") as string,
      },
    ]);
  });
  it("distinguishes missing/unusable/unparseable and aggregates real unmet requirements", async () => {
    expect(
      await check(
        all,
        fixture({
          missing: ["nrm"],
          codes: { "pnpm:--version": 1 },
          output: { "npm:--version": "banner 22.13.0" },
        }),
      ),
    ).toMatchObject([
      { code: "version-unparseable" },
      { code: "tool-unusable" },
      { code: "tool-missing" },
    ]);
  });
  it("separates pairing, uncertain evidence and per-tool nvm management", async () => {
    const outside = join(
      cwd,
      "nvm",
      "v22.13.0-other",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    expect(await check(all, fixture({ npm: outside }))).toMatchObject([
      { code: "pairing-mismatch" },
      {
        code: "management-mismatch",
        brief: expect.stringContaining("npm") as string,
      },
    ]);
    expect(await check(all, fixture({ npm: null }))).toMatchObject([
      { code: "pairing-unconfirmed" },
      { code: "management-unconfirmed" },
    ]);
    expect(
      await check(all, fixture({ npmNode: join(cwd, "system", "node.exe") })),
    ).toMatchObject([
      { code: "pairing-mismatch" },
      {
        code: "management-mismatch",
        brief: expect.stringContaining("npm") as string,
      },
    ]);
    expect(
      await check({ tools: { node: {}, npm: {} } }, fixture({ npm: outside })),
    ).toEqual([]);
    expect(
      await check(all, fixture({ output: { "nvm:current": "none" } })),
    ).toMatchObject([
      { code: "management-mismatch" },
      { code: "management-mismatch" },
    ]);
    await expect(
      check(
        all,
        fixture({ output: { "nvm:current": "unexpected implementation" } }),
      ),
    ).rejects.toThrow("Unknown nvm");
  });
  it("checks each effective registry and all exact nrm mappings, allowing extras", async () => {
    expect(
      await check(
        all,
        fixture({
          output: {
            "npm:config get registry": "https://evil.test/",
            "nrm:ls":
              "* target ---- https://different.test/\nextra ---- https://extra.test/\n",
          },
        }),
      ),
    ).toMatchObject([
      { code: "registry-mismatch" },
      { code: "nrm-registration-mismatch" },
    ]);
    expect(
      await check(
        all,
        fixture({ output: { "nrm:ls": "extra ---- https://extra.test/" } }),
      ),
    ).toMatchObject([{ code: "nrm-registration-missing" }]);
    expect(
      await check(all, fixture({ codes: { "pnpm:config get registry": 2 } })),
    ).toMatchObject([{ code: "registry-unusable" }]);
    await expect(
      check(all, fixture({ output: { "nrm:ls": "new output format" } })),
    ).rejects.toThrow("Unknown");
    await expect(
      check(
        all,
        fixture({
          output: {
            "npm:config get registry": "https://user:secret@example.test/",
          },
        }),
      ),
    ).rejects.toThrow("sensitive");
    expect(() =>
      parseNrm("x --- https://one.test\nx --- https://two.test"),
    ).toThrow();
  });
  it("preserves execution faults even after a collected business problem", async () => {
    const host = fixture({ missing: ["node"] });
    host.run = () => Promise.reject(new Error("execution fault"));
    await expect(check(all, host)).rejects.toThrow("execution fault");
    const abort = new AbortController();
    abort.abort();
    await expect(
      inspect(
        { context: { projectDirectory: cwd }, requirements: all },
        abort.signal,
        () => undefined,
        fixture(),
      ),
    ).rejects.toThrow();
    // SDK callback is used by the entrypoint, not a bespoke result envelope.
    expect(
      typeof createCheckCallback(contract, async () => {
        await Promise.resolve();
      }),
    ).toBe("function");
  });
});

describe("strict input and normalization", () => {
  it.each([
    {},
    { tools: {} },
    { pairing: {} },
    { pairing: { npmWithNode: false } },
    { tools: { node: { minimumVersion: "^22" } } },
    { tools: { node: { command: "custom" } } },
    { tools: { custom: {} } },
    { tools: { node: {} }, pairing: { npmWithNode: true } },
    {
      tools: { node: {} },
      management: { provider: "fnm", appliesTo: ["node"] },
    },
    {
      tools: { node: {} },
      management: { provider: "nvm", appliesTo: ["npm"] },
    },
    { tools: { node: {} }, management: { provider: "nvm", appliesTo: [] } },
    {
      tools: { node: {} },
      management: { provider: "nvm", appliesTo: ["node", "node"] },
    },
    { registries: {} },
    { registries: { active: {} } },
    {
      tools: { npm: {} },
      registries: { active: { npm: { allowedUrls: [] } } },
    },
    { registries: { active: { npm: { allowedUrls: ["https://test.test"] } } } },
    {
      tools: { npm: {} },
      registries: {
        active: {
          npm: { allowedUrls: ["https://test.test", "https://test.test/"] },
        },
      },
    },
    {
      registries: {
        nrm: {
          required: [
            { name: "x", url: "https://one.test" },
            { name: "x", url: "https://two.test" },
          ],
        },
      },
    },
    {
      registries: {
        nrm: {
          required: [{ name: "x", url: "https://user:secret@test.test" }],
        },
      },
    },
  ])("rejects malformed or contradictory requirements %j", (requirements) => {
    expect(() => {
      validateInput({ context: { projectDirectory: cwd }, requirements });
    }).toThrow();
  });
  it("rejects non-host and nonexistent paths and top-level unknown fields", async () => {
    expect(() => {
      validateInput({
        context: { projectDirectory: "relative" },
        requirements: { tools: { node: {} } },
      });
    }).toThrow();
    expect(() => {
      validateInput({
        context: { projectDirectory: cwd },
        requirements: { tools: { node: {} } },
        command: "x",
      });
    }).toThrow();
    await expect(
      inspect(
        {
          context: { projectDirectory: join(cwd, randomUUID()) },
          requirements: { tools: { node: {} } },
        },
        signal(),
        () => undefined,
        fixture(),
      ),
    ).rejects.toThrow();
  });
  it("uses URL structure and path boundaries, not prefixes", () => {
    expect(registryUrl("https://EXAMPLE.test:443/a/")).toBe(
      registryUrl("https://example.test/a"),
    );
    for (const url of [
      "http://example.test/a",
      "https://example.test:444/a",
      "https://example.test/ab",
      "https://example.test/A",
    ])
      expect(registryUrl(url)).not.toBe(registryUrl("https://example.test/a"));
    for (const url of [
      "file:///a",
      "https://u:p@test.test",
      "https://test.test/?token=secret",
      "https://test.test/#x",
    ])
      expect(() => registryUrl(url)).toThrow();
    expect(within(join(cwd, "v1"), join(cwd, "v10", "node"))).toBe(false);
    expect(within(join(cwd, "v1"), join(cwd, "v1", "node"))).toBe(true);
  });
});

const owned: string[] = [];
afterEach(async () => {
  for (const path of owned.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function scratch() {
  const path = join(cwd, `.toolchain-test-${randomUUID()}`);
  owned.push(path);
  await mkdir(path);
  return path;
}
describe("native read-only execution", () => {
  it("uses the actual selected Node without implicitly probing other tools", async () => {
    const problems = await check(
      { tools: { node: { minimumVersion: "0" } } },
      nativeHost(),
    );
    expect(problems).toEqual([]);
  });
  it("honors isolated npm project and environment registry overrides without changing files", async () => {
    const directory = await scratch();
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !/^npm_config_(registry|userconfig|globalconfig)$/i.test(name),
      ),
    );
    env.npm_config_userconfig = join(directory, "user.npmrc");
    env.npm_config_globalconfig = join(directory, "global.npmrc");
    await writeFile(
      env.npm_config_userconfig,
      "registry=https://user.example.test/\n",
    );
    await writeFile(env.npm_config_globalconfig, "");
    await writeFile(
      join(directory, "package.json"),
      '{"private":true,"scripts":{"preinstall":"exit 99"}}\n',
    );
    const host = nativeHost(env);
    const npm = await host.locate("npm", cwd);
    expect(npm).toBeDefined();
    const config = join(directory, ".npmrc");
    await writeFile(config, "registry=https://project.example.test/custom/\n");
    const before = await readFile(config);
    const result = await host.run(
      npm!,
      ["config", "get", "registry"],
      directory,
      signal(),
    );
    expect(result).toMatchObject({
      code: 0,
      stdout: "https://project.example.test/custom/\n",
    });
    const override = nativeHost({
      ...env,
      npm_config_registry: "https://env.example.test/",
    });
    expect(
      await override.run(
        npm!,
        ["config", "get", "registry"],
        directory,
        signal(),
      ),
    ).toMatchObject({ code: 0, stdout: "https://env.example.test/\n" });
    expect(await readFile(config)).toEqual(before);
  });
  it.each(["timeout", "cancel", "cleanup"] as const)(
    "keeps %s a fault and physically stops owned descendant processes",
    async (mode) => {
      const directory = await scratch();
      const marker = join(directory, "child.pid");
      const script = join(directory, "parent.cjs");
      await writeFile(
        script,
        `const {spawn}=require('node:child_process'); const fs=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
fs.writeFileSync(${JSON.stringify(marker)},String(child.pid)); setInterval(()=>{},1000);`,
      );
      const controller = new AbortController();
      const running = execute(
        process.execPath,
        [script],
        directory,
        controller.signal,
        mode === "cancel" ? 10_000 : 600,
        mode === "cleanup"
          ? async (pid) => {
              await stopTree(pid);
              throw new Error("owned cleanup fault");
            }
          : stopTree,
      );
      const expected = expect(running).rejects.toThrow(
        mode === "cancel"
          ? "cancelled"
          : mode === "cleanup"
            ? "cleanup"
            : "timed out",
      );
      let childPid: number | undefined;
      for (let i = 0; i < 100; i++) {
        try {
          childPid = Number(await readFile(marker, "utf8"));
          break;
        } catch (error) {
          if (!(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          ))
            throw error;
          await new Promise((done) => setTimeout(done, 10));
        }
      }
      expect(childPid).toBeGreaterThan(0);
      if (mode === "cancel") controller.abort();
      await expected;
      expect(() => process.kill(childPid!, 0)).toThrow();
      expect(dirname(script)).toBe(directory);
    },
  );
});
