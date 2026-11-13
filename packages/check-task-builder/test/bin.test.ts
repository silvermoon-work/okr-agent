import { afterEach, expect, it, vi } from "vitest";
import { runCheckBuilderCli } from "../src/cli.js";

vi.mock("../src/cli.js", () => ({ runCheckBuilderCli: vi.fn() }));

const exitCode = process.exitCode;
afterEach(() => {
  process.exitCode = exitCode;
  vi.restoreAllMocks();
  vi.resetModules();
});

it.each(["SIGINT", "SIGTERM"] as const)(
  "forwards %s cancellation and removes its handlers",
  async (signal) => {
    const before = process.listeners(signal);
    vi.mocked(runCheckBuilderCli).mockImplementation(async (argv, options) => {
      expect(argv).toEqual(process.argv.slice(2));
      expect(options?.signal?.aborted).toBe(false);
      const handler = process
        .listeners(signal)
        .find((fn) => !before.includes(fn));
      expect(handler).toBeDefined();
      handler?.(signal);
      expect(options?.signal?.aborted).toBe(true);
      await Promise.resolve();
      return options?.signalExitCode?.() ?? 1;
    });
    await import("../src/bin.js");
    expect(process.exitCode).toBe(signal === "SIGINT" ? 130 : 143);
    expect(process.listeners(signal)).toEqual(before);
  },
);

it("removes both handlers if CLI execution rejects", async () => {
  const interrupt = process.listeners("SIGINT");
  const terminate = process.listeners("SIGTERM");
  vi.mocked(runCheckBuilderCli).mockRejectedValue(new Error("output failed"));
  await expect(import("../src/bin.js")).rejects.toThrow("output failed");
  expect(process.listeners("SIGINT")).toEqual(interrupt);
  expect(process.listeners("SIGTERM")).toEqual(terminate);
});
