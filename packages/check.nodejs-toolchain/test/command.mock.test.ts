import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorCode, execute, stopTree } from "../src/command.js";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}));
vi.mock("node:child_process", () => mocks);

const platformDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "platform",
)!;
const cwd = resolve(".");
const executable = join(cwd, "node.exe");
const signal = () => new AbortController().signal;
let child: EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid?: number;
};
function platform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value, configurable: true });
}
beforeEach(() => {
  vi.clearAllMocks();
  child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 12345,
  });
  mocks.spawn.mockReturnValue(child);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  Object.defineProperty(process, "platform", platformDescriptor);
});

describe("process cleanup without native processes", () => {
  it("only interprets coded Error instances", () => {
    expect(errorCode({ code: "ENOENT" })).toBeUndefined();
    expect(errorCode(new Error("plain"))).toBeUndefined();
    expect(errorCode(Object.assign(new Error(), { code: 126 }))).toBe("126");
  });

  it("kills Unix process groups, tolerates already stopped trees, and propagates permission faults", async () => {
    platform("linux");
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    await stopTree(12345);
    expect(kill).toHaveBeenCalledWith(-12345, "SIGKILL");
    kill.mockImplementationOnce(() => {
      throw Object.assign(new Error(), { code: "ESRCH" });
    });
    await expect(stopTree(12345)).resolves.toBeUndefined();
    const denied = Object.assign(new Error("denied"), { code: "EPERM" });
    kill.mockImplementationOnce(() => {
      throw denied;
    });
    await expect(stopTree(12345)).rejects.toBe(denied);
  });

  it("uses the trusted Windows cleanup executable and reports cleanup failure", async () => {
    platform("win32");
    vi.stubEnv("SystemRoot", cwd);
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const callback = args[3] as (error: Error | null) => void;
      callback(null);
    });
    await stopTree(12345);
    expect(mocks.execFile).toHaveBeenCalledWith(
      join(cwd, "System32", "taskkill.exe"),
      ["/PID", "12345", "/T", "/F"],
      { timeout: 5000, windowsHide: true, env: { SystemRoot: cwd } },
      expect.any(Function),
    );
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      (args[3] as (error: Error) => void)(new Error("secret native details"));
    });
    await expect(stopTree(12345)).rejects.toThrow(
      "Process tree cleanup failed.",
    );
    for (const root of ["", "relative"]) {
      vi.stubEnv("SystemRoot", root);
      await expect(stopTree(12345)).rejects.toThrow("Cannot locate");
    }
  });
});

describe("controlled command lifecycle", () => {
  it("captures stdout, ignores ordinary stderr, and disables unsafe startup behaviors", async () => {
    platform("linux");
    const running = execute(executable, ["--version"], cwd, signal(), {
      AUTHORIZED: "yes",
      COREPACK_ENABLE_NETWORK: "1",
    });
    child.stdout.emit("data", Buffer.from("1."));
    child.stdout.emit("data", Buffer.from("2.3\n"));
    child.stderr.emit("data", Buffer.from("ordinary diagnostic"));
    child.emit("close", 0);
    expect(await running).toEqual({ code: 0, stdout: "1.2.3\n" });
    expect(mocks.spawn).toHaveBeenCalledWith(
      executable,
      ["--version"],
      expect.objectContaining({
        cwd,
        shell: false,
        detached: true,
        windowsVerbatimArguments: false,
        env: expect.objectContaining({
          AUTHORIZED: "yes",
          COREPACK_ENABLE_NETWORK: "0",
          COREPACK_ENABLE_AUTO_PIN: "0",
          COREPACK_ENABLE_PROJECT_SPEC: "0",
          npm_config_ignore_pnpmfile: "true",
          pnpm_config_manage_package_manager_versions: "false",
        }) as unknown,
      }),
    );
  });

  it.each(["EACCES", "ENOEXEC", "EPERM"])(
    "maps %s startup failure to an unusable tool result",
    async (code) => {
      const running = execute(executable, [], cwd, signal(), {});
      child.emit("error", Object.assign(new Error("start"), { code }));
      child.emit("close", null);
      expect(await running).toEqual({ code: 126, stdout: "" });
    },
  );

  it.each([undefined, "ENOENT"])(
    "keeps unexpected startup failure %s as a fault",
    async (code) => {
      const running = execute(executable, [], cwd, signal(), {});
      child.emit("error", Object.assign(new Error("native details"), { code }));
      child.emit("close", null);
      await expect(running).rejects.toThrow("could not be started");
    },
  );

  it("rejects unexplained null exits", async () => {
    const running = execute(executable, [], cwd, signal(), {});
    child.emit("close", null);
    await expect(running).rejects.toThrow("terminated unexpectedly");
  });

  it.each([
    "ERR_PNPM_ENV_REPLACE",
    "Failed to resolve env",
    'Ignored project-level request destination "registry" because environment variables are not expanded',
  ])("marks unsupported interpolation in stderr: %s", async (stderr) => {
    const running = execute(executable, [], cwd, signal(), {});
    child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", 1);
    expect(await running).toEqual({
      code: 1,
      stdout: "",
      unsupportedInterpolation: true,
    });
  });

  it("runs supported Windows shims with literal fixed arguments only", async () => {
    platform("win32");
    vi.stubEnv("SystemRoot", cwd);
    const shim = join(cwd, "pnpm.CMD");
    const running = execute(
      shim,
      ["config", "get", "registry"],
      cwd,
      signal(),
      {},
    );
    child.emit("close", 0);
    await running;
    expect(mocks.spawn).toHaveBeenCalledWith(
      join(cwd, "System32", "cmd.exe"),
      ["/d", "/s", "/c", `""${shim}" config get registry"`],
      expect.objectContaining({
        detached: false,
        windowsVerbatimArguments: true,
      }),
    );
    for (const [path, args] of [
      [join(cwd, "unsafe%name.cmd"), []],
      [shim, ["--unsafe=value"]],
    ] as const)
      await expect(execute(path, args, cwd, signal(), {})).rejects.toThrow(
        "Unsupported Windows shim",
      );
    for (const root of ["", "relative"]) {
      vi.stubEnv("SystemRoot", root);
      await expect(execute(shim, [], cwd, signal(), {})).rejects.toThrow(
        "system directory unavailable",
      );
    }
  });

  it.each(["timeout", "abort", "output"] as const)(
    "awaits %s cleanup and terminates only once",
    async (mode) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      let finish!: () => void;
      const stop = vi.fn(
        () =>
          new Promise<void>((done) => {
            finish = done;
          }),
      );
      const running = execute(
        executable,
        [],
        cwd,
        controller.signal,
        {},
        100,
        stop,
      );
      const expected = expect(running).rejects.toThrow(
        mode === "timeout"
          ? "timed out"
          : mode === "abort"
            ? "cancelled"
            : "output limit",
      );
      if (mode === "timeout") vi.advanceTimersByTime(100);
      else if (mode === "abort") controller.abort();
      else child.stdout.emit("data", Buffer.alloc(262_145));
      child.stderr.emit("data", Buffer.alloc(262_145));
      controller.abort();
      expect(stop).toHaveBeenCalledExactlyOnceWith(12345);
      child.emit("close", null);
      finish();
      await expected;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("handles cancellation during spawn and missing pid without unsafe cleanup", async () => {
    const controller = new AbortController();
    delete child.pid;
    mocks.spawn.mockImplementationOnce(() => {
      controller.abort();
      return child;
    });
    const stop = vi.fn(() => Promise.resolve());
    const running = execute(
      executable,
      [],
      cwd,
      controller.signal,
      {},
      100,
      stop,
    );
    child.emit("close", null);
    await expect(running).rejects.toThrow("cancelled");
    expect(stop).not.toHaveBeenCalled();
  });

  it("reports cleanup rejection immediately even when no close event arrives", async () => {
    const controller = new AbortController();
    const stop = vi.fn(() => Promise.reject(new Error("cleanup details")));
    const running = execute(
      executable,
      [],
      cwd,
      controller.signal,
      {},
      100,
      stop,
    );
    const expected = expect(running).rejects.toThrow(
      "Tool process tree cleanup failed.",
    );
    controller.abort();
    await expected;
    child.emit("close", null);
  });
});
