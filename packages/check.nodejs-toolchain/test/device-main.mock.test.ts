import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runTask:
    vi.fn<
      (
        callback: (
          input: unknown,
          context: { signal: AbortSignal },
        ) => Promise<unknown>,
      ) => void
    >(),
  callback: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  checkpoints: vi.fn<(...args: unknown[]) => unknown[]>(),
}));
vi.mock("@silvermoon-work/task-sdk", () => ({ runTask: mocks.runTask }));
vi.mock("@silvermoon-work/check-task-sdk", () => ({
  createCheckCallback: () => mocks.callback,
}));
vi.mock("../src/inspect.js", () => ({
  toolchainCheckpoints: mocks.checkpoints,
}));
vi.mock("../src/device.js", () => ({
  withDevice: (
    _signal: AbortSignal,
    action: (device: unknown) => Promise<unknown>,
  ) => action("owned-device"),
}));

it("registers the device callback without business context and preserves failures", async () => {
  await import("../src/main.js");
  expect(mocks.runTask).toHaveBeenCalledOnce();
  const run = mocks.runTask.mock.calls[0]![0];
  const context = { signal: new AbortController().signal };
  mocks.callback.mockResolvedValueOnce("result");
  mocks.checkpoints.mockReturnValue([]);
  expect(await run({}, context)).toBe("result");
  expect(mocks.checkpoints).toHaveBeenCalledExactlyOnceWith(
    {},
    context.signal,
    "owned-device",
  );
  await expect(run({ context: {} }, context)).rejects.toThrow("Invalid");
  mocks.callback.mockRejectedValueOnce(new Error("execution failure"));
  await expect(run({}, context)).rejects.toThrow("execution failure");
});
