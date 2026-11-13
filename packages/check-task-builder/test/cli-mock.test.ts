import { join, resolve } from "node:path";
import type * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  memoryTree,
  type ReadonlyFileTree,
} from "@silvermoon-work/task-builder/tree";
import { runCheckBuilderCli } from "../src/cli.js";
import type * as builder from "../src/index.js";

const mocks = vi.hoisted(() => ({
  lstat: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  directoryTree: vi.fn(),
  writeDirectory: vi.fn(),
  writeStreamFile: vi.fn(),
  transform: vi.fn(),
  build: vi.fn(),
  encode: vi.fn(),
  close: vi.fn(),
  contentClose: vi.fn(),
  content: vi.fn(),
}));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof fs>()),
  lstat: mocks.lstat,
  stat: mocks.stat,
  realpath: mocks.realpath,
  mkdir: mocks.mkdir,
  rename: mocks.rename,
  rm: mocks.rm,
}));
vi.mock("@silvermoon-work/task-builder-cli/node", () => ({
  directoryTree: mocks.directoryTree,
  writeDirectory: mocks.writeDirectory,
  writeStreamFile: mocks.writeStreamFile,
}));
vi.mock("@silvermoon-work/task-builder/car", () => ({
  encodeTaskBundleCar: mocks.encode,
}));
vi.mock("@silvermoon-work/ipfs-store/node", () => ({
  createConfiguredContent: mocks.content,
}));
vi.mock("../src/index.js", async (original) => ({
  ...(await original<typeof builder>()),
  transformCheckTree: mocks.transform,
  buildCheckBundle: mocks.build,
}));

const cwd = resolve("mock-project");
const output = join(cwd, "dist", "check");
const definition = () => ({
  outDirectory: output,
  options: {
    source: { entry: "src/main.ts", contract: "src/contract.ts" },
    include: [],
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.lstat.mockRejectedValue(
    Object.assign(new Error("missing"), { code: "ENOENT" }),
  );
  mocks.stat.mockResolvedValue({ isDirectory: () => true });
  mocks.realpath.mockImplementation((path: string) => Promise.resolve(path));
  mocks.directoryTree.mockResolvedValue(
    memoryTree(new Map([["task.yaml", Buffer.from("task")]])),
  );
  mocks.transform.mockResolvedValue(definition());
  mocks.build.mockResolvedValue(memoryTree(new Map()));
  mocks.writeDirectory.mockResolvedValue(["task.yaml"]);
  mocks.encode.mockResolvedValue({
    cid: "verified-cid",
    stream: new ReadableStream(),
    close: mocks.close,
  });
  mocks.content.mockResolvedValue({ close: mocks.contentClose });
});
afterEach(() => vi.restoreAllMocks());

async function invoke(
  argv = ["build"],
  options: Parameters<typeof runCheckBuilderCli>[1] = {},
) {
  let text = "";
  const exitCode = await runCheckBuilderCli(argv, {
    cwd,
    ...options,
    stdout: {
      write(value) {
        text += value;
      },
    },
  });
  return { exitCode, text };
}

describe("mocked delivery failures", () => {
  it("delivers selected files and forwards gateway and relative content storage", async () => {
    const result = await invoke([
      "build",
      "--content-gateway",
      "https://gateway.test",
      "--content-data-dir",
      "cache",
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.text)).toMatchObject({
      ok: true,
      data: { cid: "verified-cid", car: { path: `${output}.car` } },
    });
    expect(mocks.content).toHaveBeenCalledWith({
      gateway: "https://gateway.test",
      dataDir: join(cwd, "cache"),
    });
    expect(mocks.close).toHaveBeenCalledTimes(2);
    expect(mocks.contentClose).toHaveBeenCalledOnce();
    expect(mocks.rm).toHaveBeenCalledTimes(2);
  });

  it.each(["permission", "symlink", "contract", "resource", "archive"])(
    "rejects unsafe %s before creating staging",
    async (mode) => {
      if (mode === "permission")
        mocks.lstat.mockRejectedValue(new Error("access denied"));
      if (mode === "symlink")
        mocks.lstat.mockResolvedValue({ isSymbolicLink: () => true });
      if (mode === "contract")
        mocks.transform.mockResolvedValue({
          ...definition(),
          options: { source: { entry: "src/main.ts", contract: {} } },
        });
      if (mode === "resource" || mode === "archive")
        mocks.transform.mockResolvedValue({
          ...definition(),
          options: {
            ...definition().options,
            include: [
              {
                from: mode === "resource" ? "dist/check/*" : "dist/*.txt",
                to: "resources/",
              },
            ],
          },
        });
      const result = await invoke();
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.text)).toMatchObject({
        ok: false,
        error: { code: "OPERATION_FAILED" },
      });
      expect(mocks.writeDirectory).not.toHaveBeenCalled();
      expect(mocks.contentClose).toHaveBeenCalledOnce();
    },
  );

  it("observes lazy input reads and rejects canonical paths inside output", async () => {
    mocks.build.mockImplementation(async (tree: ReadonlyFileTree) => {
      await tree.list("");
      await tree.read("task.yaml");
      mocks.realpath.mockResolvedValue(join(output, "task.yaml"));
      await tree.read("src/main.ts");
    });
    const result = await invoke();
    expect(JSON.parse(result.text)).toMatchObject({
      error: {
        code: "OPERATION_FAILED",
        message: "Output must not contain or replace build inputs.",
      },
    });
    expect(mocks.writeDirectory).not.toHaveBeenCalled();
  });

  it.each(["write", "identity", "cleanup", "non-error"])(
    "keeps %s failures distinct from verified delivery",
    async (mode) => {
      if (mode === "write")
        mocks.rename.mockRejectedValue(new Error("cannot replace"));
      if (mode === "identity")
        mocks.encode.mockResolvedValueOnce({
          cid: "other-cid",
          stream: new ReadableStream(),
          close: mocks.close,
        });
      if (mode === "cleanup")
        mocks.rm.mockRejectedValue(new Error("cannot clean"));
      if (mode === "non-error") mocks.writeDirectory.mockRejectedValue("bad");
      const result = await invoke();
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.text)).toMatchObject({
        ok: false,
        error: {
          code:
            mode === "cleanup"
              ? "CLEANUP_UNCERTAIN"
              : mode === "non-error"
                ? "OPERATION_FAILED"
                : "DELIVERY_UNCERTAIN",
        },
      });
      expect(mocks.contentClose).toHaveBeenCalledOnce();
    },
  );

  it.each(["staging", "verified", "finished", "cleanup"])(
    "reports cancellation during %s without hiding cleanup uncertainty",
    async (phase) => {
      const controller = new AbortController();
      if (phase === "staging")
        mocks.writeDirectory.mockImplementation(() => {
          controller.abort();
          return ["task.yaml"];
        });
      if (phase === "verified")
        mocks.rename.mockImplementation((from: string) => {
          if (from.endsWith(".car")) controller.abort();
        });
      if (phase === "finished")
        mocks.contentClose.mockImplementation(() => {
          controller.abort();
        });
      if (phase === "cleanup")
        mocks.rm.mockImplementation(() => {
          controller.abort();
          throw new Error("cleanup blocked");
        });
      const result = await invoke(["build"], {
        signal: controller.signal,
        signalExitCode: () => 143,
      });
      expect(result.exitCode).toBe(phase === "cleanup" ? 1 : 143);
      expect(JSON.parse(result.text)).toMatchObject({
        ok: false,
        error: {
          code: phase === "cleanup" ? "CLEANUP_UNCERTAIN" : "INTERRUPTED",
        },
        ...(phase === "verified" || phase === "finished"
          ? { data: { cid: "verified-cid" } }
          : {}),
      });
    },
  );

  it("reports aggregate cleanup faults as uncertain even after cancellation", async () => {
    const controller = new AbortController();
    mocks.contentClose.mockImplementation(() => {
      controller.abort();
      throw new AggregateError([new Error("close failed")], "uncertain");
    });
    const result = await invoke(["build"], { signal: controller.signal });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.text)).toMatchObject({
      error: { code: "CLEANUP_UNCERTAIN" },
    });
  });

  it("rejects a non-directory init parent and keeps positional option delimiters", async () => {
    mocks.stat.mockResolvedValue({ isDirectory: () => false });
    const result = await invoke(["init", "--", "new"]);
    expect(JSON.parse(result.text)).toMatchObject({
      error: {
        code: "OPERATION_FAILED",
        message: "Parent must be a directory.",
      },
    });
    expect(mocks.writeDirectory).not.toHaveBeenCalled();
  });
});
