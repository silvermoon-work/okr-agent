import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scratch } from "./fixtures.js";

const command = vi.hoisted(() =>
  vi.fn<
    (
      file: string,
      args: string[],
      options: { cwd: string; env: NodeJS.ProcessEnv },
    ) => Promise<{ stdout: string; stderr: string }>
  >(),
);
vi.mock("node:child_process", () => ({
  execFile: Object.assign(() => undefined, {
    [Symbol.for("nodejs.util.promisify.custom")]: command,
  }),
}));
import { git, remoteTip } from "../src/repository.js";
import { withGitContext } from "../src/git-context.js";
afterEach(() => {
  command.mockReset();
  vi.unstubAllEnvs();
});

describe("remote-only snapshot selection", () => {
  it("isolates concurrent host Git contexts and excludes executable or credential environment injection", async () => {
    command.mockImplementation(() =>
      Promise.resolve({ stdout: "", stderr: "" }),
    );
    vi.stubEnv("NODE_OPTIONS", "--require untrusted.js");
    vi.stubEnv("GIT_SSH_COMMAND", "untrusted");
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GITHUB_TOKEN", "fixture-not-a-token");
    const first = {
      path: process.cwd(),
      userHome: process.cwd(),
      sshAuthSock: join(process.cwd(), "agent"),
    };
    const second = {
      path: join(process.cwd(), "other"),
      userHome: join(process.cwd(), "other"),
    };
    await Promise.all(
      [first, second].map((environment) =>
        withGitContext(environment, async () => {
          await Promise.resolve();
          await git("/fixture", ["status"]);
        }),
      ),
    );
    for (const [index, context] of [first, second].entries()) {
      const env = command.mock.calls[index]?.[2].env;
      expect(env).toMatchObject({
        PATH: context.path,
        HOME: context.userHome,
        USERPROFILE: context.userHome,
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
      });
      for (const key of [
        "NODE_OPTIONS",
        "GIT_SSH_COMMAND",
        "GIT_CONFIG_COUNT",
        "GITHUB_TOKEN",
      ])
        expect(env).not.toHaveProperty(key);
    }
    expect(command.mock.calls[0]?.[2].env.SSH_AUTH_SOCK).toBe(
      first.sshAuthSock,
    );
    expect(command.mock.calls[1]?.[2].env).not.toHaveProperty("SSH_AUTH_SOCK");
    for (const context of [
      { ...first, userHome: "relative" },
      { ...first, path: "" },
      { ...first, path: "/a\n/b" },
      { ...first, sshAuthSock: "relative" },
    ])
      expect(() => withGitContext(context, () => Promise.resolve())).toThrow(
        /Git requires/,
      );
  });
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
