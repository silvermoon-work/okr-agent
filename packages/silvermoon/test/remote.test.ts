import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scratch } from "./fixtures.js";

const command = vi.hoisted(() =>
  vi.fn<
    (
      file: string,
      args: string[],
      options: { cwd: string },
    ) => Promise<{ stdout: string; stderr: string }>
  >(),
);
vi.mock("node:child_process", () => ({
  execFile: Object.assign(() => undefined, {
    [Symbol.for("nodejs.util.promisify.custom")]: command,
  }),
}));
import { remoteTip } from "../src/repository.js";
afterEach(() => {
  command.mockReset();
});

describe("remote-only snapshot selection", () => {
  it("fetches the configured primary without requiring local HEAD synchronization or consuming dirty Idea files", async () => {
    const root = await scratch();
    await mkdir(join(root, ".silvermoon"));
    await writeFile(
      join(root, ".silvermoon", "config.yaml"),
      "version: 2\nprimaryRepository: example/project\nprimaryBranch: main\n",
    );
    const tip = "b".repeat(40);
    command.mockImplementation((_file, args) => {
      if (args.includes("--show-toplevel"))
        return Promise.resolve({ stdout: root, stderr: "" });
      if (args.at(-1) === "remote")
        return Promise.resolve({ stdout: "other\norigin\n", stderr: "" });
      if (args.includes("get-url"))
        return Promise.resolve({
          stdout:
            args.at(-1) === "other"
              ? "https://github.com/elsewhere/project.git"
              : "https://github.com/example/project.git",
          stderr: "",
        });
      return Promise.resolve({
        stdout: args.includes("FETCH_HEAD") ? tip : "",
        stderr: "",
      });
    });
    expect(await remoteTip(root)).toBe(tip);
    const args = command.mock.calls.map((call) => call[1]);
    expect(args.some((args) => args.includes("fetch"))).toBe(true);
    expect(
      args.some(
        (args) =>
          args.includes("status") ||
          args.includes("merge-base") ||
          args.includes("symbolic-ref"),
      ),
    ).toBe(false);
    expect(
      args.every(
        (args) =>
          args.includes("core.fsmonitor=false") &&
          args.includes("protocol.ext.allow=never"),
      ),
    ).toBe(true);
  });
  it("rejects unrelated remotes and non-root contexts rather than fetching a guessed source", async () => {
    const root = await scratch();
    await mkdir(join(root, ".silvermoon"));
    await writeFile(
      join(root, ".silvermoon", "config.yaml"),
      "version: 2\nprimaryRepository: example/project\nprimaryBranch: main\n",
    );
    command.mockImplementation((_file, args) =>
      Promise.resolve({
        stdout: args.includes("--show-toplevel")
          ? root
          : args.at(-1) === "remote"
            ? "origin"
            : "https://github.com/unrelated/project.git",
        stderr: "",
      }),
    );
    await expect(remoteTip(root)).rejects.toThrow(/No configured remote/);
    command.mockResolvedValue({ stdout: join(root, "other"), stderr: "" });
    await expect(remoteTip(root)).rejects.toThrow(/repository root/);
  });
});
