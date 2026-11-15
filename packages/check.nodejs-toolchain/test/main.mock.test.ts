import { expect, it, vi } from "vitest";
import contract, { type Input } from "../src/contract.js";

const mocks = vi.hoisted(() => ({
  runCheck: vi.fn<
    (
      contract: unknown,
      options: {
        root: string;
        registry: (context: { signal: AbortSignal }, input: Input) => unknown;
      },
    ) => void
  >(),
  toolchainRegistry: vi.fn<(...args: unknown[]) => unknown>(),
}));
vi.mock("@silvermoon-work/check-task-sdk", () => ({
  runCheck: mocks.runCheck,
}));
vi.mock("../src/inspect.js", () => ({
  toolchainRegistry: mocks.toolchainRegistry,
}));

it("registers the explicit root and binds input/signal without swallowing factory faults", async () => {
  await import("../src/main.js");
  expect(mocks.runCheck).toHaveBeenCalledExactlyOnceWith(contract, {
    root: "toolchain",
    registry: expect.any(Function) as unknown,
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
  const registry = {};
  mocks.toolchainRegistry.mockReturnValueOnce(registry);
  expect(options.registry({ signal }, input)).toBe(registry);
  expect(mocks.toolchainRegistry).toHaveBeenCalledExactlyOnceWith(
    input,
    signal,
  );
  mocks.toolchainRegistry.mockImplementationOnce(() => {
    throw new Error("inspection fault");
  });
  expect(() => options.registry({ signal }, input)).toThrow("inspection fault");
});
