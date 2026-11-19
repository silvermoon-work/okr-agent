import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Host } from "../src/legacy/inspect.js";
import type * as filesystem from "node:fs/promises";
import type * as legacy from "../src/legacy/inspect.js";
import {
  deviceEnvironment,
  nativeDevice,
  withDevice,
  type ToolFact,
} from "../src/device.js";

const state = vi.hoisted(() => ({
  platform: vi.fn<() => NodeJS.Platform>(),
  run: vi.fn<Host["run"]>(),
  stat: vi.fn<(path: unknown) => Promise<{ size: number }>>(),
  readFile: vi.fn<(path: unknown) => Promise<Buffer>>(),
}));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof filesystem>()),
  stat: state.stat,
  readFile: state.readFile,
}));
vi.mock("../src/legacy/inspect.js", async (original) => ({
  ...(await original<typeof legacy>()),
  nativeHost: (env: NodeJS.ProcessEnv): Host => ({
    platform: state.platform(),
    env,
    locate: () => Promise.resolve(undefined),
    canonical: (path) => Promise.resolve(path),
    npmLocation: () => Promise.resolve(undefined),
    assertRegistryContext: () => Promise.resolve(),
    run: state.run,
  }),
}));
const fact: ToolFact = {
  executable: resolve("nvm"),
  args: [],
  version: "2.0.0",
};
const signal = () => new AbortController().signal;
const device = () =>
  nativeDevice({ NVM_DIR: resolve("nvm-home") }, resolve("probe"), signal());
beforeEach(() => {
  vi.clearAllMocks();
  state.platform.mockReturnValue("win32");
  state.stat.mockResolvedValue({ size: 20 });
  state.readFile.mockResolvedValue(
    Buffer.from("# defaults\npnpm\nnrm@1.2.6\n\n"),
  );
  state.run.mockResolvedValue({ code: 0, stdout: "pnpm,nrm@1.2.6" });
});
afterEach(() => vi.unstubAllEnvs());

it("selects named device fields, rejects conflicting aliases and never copies arbitrary secrets", () => {
  expect(
    deviceEnvironment({
      Path: "selected",
      PATH: "selected",
      SECRET: "not-copied",
    }),
  ).toEqual({ PATH: "selected" });
  expect(() => deviceEnvironment({ Path: "one", PATH: "two" })).toThrow(
    "Conflicting",
  );
  expect(() => deviceEnvironment({ HOME: "unused" })).toThrow("PATH");
});

it("reads known Windows default-package configuration and distinguishes unsupported versions", async () => {
  expect(await device().defaultPackages(fact)).toEqual(["pnpm", "nrm@1.2.6"]);
  expect(
    await device().defaultPackages({ ...fact, version: "1.2.2" }),
  ).toBeUndefined();
  state.run.mockResolvedValueOnce({
    code: 0,
    stdout: "auto_installed_modules=pnpm, nrm@1.2.6",
  });
  expect(await device().defaultPackages(fact)).toEqual(["pnpm", "nrm@1.2.6"]);
  state.run.mockResolvedValueOnce({ code: 0, stdout: "" });
  expect(await device().defaultPackages(fact)).toEqual([]);
  state.run.mockResolvedValueOnce({ code: 1, stdout: "" });
  await expect(device().defaultPackages(fact)).rejects.toThrow("Cannot read");
});

it("reads bounded strict-UTF8 Unix configuration without treating errors as absence", async () => {
  state.platform.mockReturnValue("linux");
  expect(await device().defaultPackages(fact)).toEqual(["pnpm", "nrm@1.2.6"]);
  state.stat.mockRejectedValueOnce(
    Object.assign(new Error("missing"), { code: "ENOENT" }),
  );
  expect(await device().defaultPackages(fact)).toBeUndefined();
  state.stat.mockResolvedValueOnce({ size: 65_537 });
  await expect(device().defaultPackages(fact)).rejects.toThrow("too large");
  state.readFile.mockResolvedValueOnce(Buffer.from([255]));
  await expect(device().defaultPackages(fact)).rejects.toThrow();
  state.stat.mockRejectedValueOnce(
    Object.assign(new Error("denied"), { code: "EACCES" }),
  );
  await expect(device().defaultPackages(fact)).rejects.toThrow("denied");
  await expect(
    nativeDevice({}, resolve("probe"), signal()).defaultPackages(fact),
  ).rejects.toThrow("NVM_DIR");
});

it("preserves cancellation before probing and after a Unix read", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    nativeDevice({}, resolve("probe"), controller.signal).defaultPackages(fact),
  ).rejects.toThrow();
  state.platform.mockReturnValue("linux");
  const reading = new AbortController();
  state.readFile.mockImplementationOnce(() => {
    reading.abort();
    return Promise.resolve(Buffer.from("pnpm"));
  });
  await expect(
    nativeDevice(
      { NVM_DIR: resolve("nvm") },
      resolve("probe"),
      reading.signal,
    ).defaultPackages(fact),
  ).rejects.toThrow();
});

it("reads nrm registrations and actual selection, allowing same-URL aliases but rejecting ambiguity", async () => {
  state.run.mockResolvedValueOnce({
    code: 0,
    stdout:
      "* npm --- https://registry.npmjs.org/\n* alias --- https://registry.npmjs.org\n",
  });
  expect(await device().registryState(fact)).toEqual({
    registrations: new Map([
      ["npm", "https://registry.npmjs.org"],
      ["alias", "https://registry.npmjs.org"],
    ]),
    selectedUrl: "https://registry.npmjs.org",
  });
  state.run.mockResolvedValueOnce({
    code: 0,
    stdout: "npm --- https://registry.npmjs.org/\n",
  });
  expect(await device().registryState(fact)).not.toHaveProperty("selectedUrl");
  state.run.mockResolvedValueOnce({
    code: 0,
    stdout:
      "* npm --- https://registry.npmjs.org/\n* other --- https://other.test\n",
  });
  await expect(device().registryState(fact)).rejects.toThrow("Ambiguous");
  state.run.mockResolvedValueOnce({ code: 1, stdout: "" });
  await expect(device().registryState(fact)).rejects.toThrow("Cannot read");
  state.run.mockResolvedValueOnce({ code: 0, stdout: "unknown protocol" });
  await expect(device().registryState(fact)).rejects.toThrow("Unknown");
});

it("owns an isolated probe directory and removes it on success and failure", async () => {
  vi.stubEnv("PATH", resolve("controlled-tools"));
  let directory = "";
  expect(
    await withDevice(signal(), async (selected) => {
      directory = selected.directory;
      await access(directory);
      return "done";
    }),
  ).toBe("done");
  await expect(access(directory)).rejects.toThrow();
  await expect(
    withDevice(signal(), (selected) => {
      directory = selected.directory;
      return Promise.reject(new Error("probe failed"));
    }),
  ).rejects.toThrow("probe failed");
  await expect(access(directory)).rejects.toThrow();
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    withDevice(aborted.signal, () => Promise.resolve()),
  ).rejects.toThrow();
});
