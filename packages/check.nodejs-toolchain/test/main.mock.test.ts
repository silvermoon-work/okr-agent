import { expect, it, vi } from "vitest";
import contract, { type Input } from "../src/legacy/contract.js";

const mocks = vi.hoisted(() => ({
  runCheck: vi.fn<
    (
      contract: unknown,
      options: {
        checkpoints: (
          context: { signal: AbortSignal },
          input: Input,
        ) => unknown;
      },
    ) => void
  >(),
  toolchainCheckpoints: vi.fn<(...args: unknown[]) => unknown>(),
}));
vi.mock("@silvermoon-work/check-task-sdk", () => ({
  runCheck: mocks.runCheck,
}));
vi.mock("../src/legacy/inspect.js", () => ({
  toolchainCheckpoints: mocks.toolchainCheckpoints,
}));

it("registers sequential checkpoints and binds input/signal without swallowing factory faults", async () => {
  await import("../src/legacy/main.js");
  expect(mocks.runCheck).toHaveBeenCalledExactlyOnceWith(contract, {
    checkpoints: expect.any(Function) as unknown,
  });
  const options = mocks.runCheck.mock.calls[0]![1];
  const input: Input = {
    context: {
      projectDirectory: "unused-by-mock",
      executionEnvironment: { path: [] },
    },
    requirements: { tools: { node: {} } },
  };
  const signal = new AbortController().signal;
  const checkpoints: unknown[] = [];
  mocks.toolchainCheckpoints.mockReturnValueOnce(checkpoints);
  expect(options.checkpoints({ signal }, input)).toBe(checkpoints);
  expect(mocks.toolchainCheckpoints).toHaveBeenCalledExactlyOnceWith(
    input,
    signal,
  );
  mocks.toolchainCheckpoints.mockImplementationOnce(() => {
    throw new Error("inspection fault");
  });
  expect(() => options.checkpoints({ signal }, input)).toThrow(
    "inspection fault",
  );
});
