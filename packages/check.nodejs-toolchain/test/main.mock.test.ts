import { expect, it, vi } from "vitest";
import type { ProblemReporter } from "@silvermoon-work/check-task-sdk";
import contract, { type Input, type ProblemCode } from "../src/contract.js";

const mocks = vi.hoisted(() => ({
  runCheck:
    vi.fn<
      (
        contract: unknown,
        callback: (
          input: Input,
          context: { signal: AbortSignal },
          report: ProblemReporter<ProblemCode>,
        ) => Promise<void>,
      ) => void
    >(),
  inspect: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
vi.mock("@silvermoon-work/check-task-sdk", () => ({
  runCheck: mocks.runCheck,
}));
vi.mock("../src/inspect.js", () => ({ inspect: mocks.inspect }));

it("registers the contract and delegates input, cancellation and reporting without swallowing faults", async () => {
  await import("../src/main.js");
  expect(mocks.runCheck).toHaveBeenCalledExactlyOnceWith(
    contract,
    expect.any(Function),
  );
  const callback = mocks.runCheck.mock.calls[0]![1];
  const input: Input = {
    context: {
      projectDirectory: "unused-by-mocked-inspect",
      executionEnvironment: { path: [] },
    },
    requirements: { tools: { node: {} } },
  };
  const signal = new AbortController().signal;
  const report = vi.fn<ProblemReporter<ProblemCode>>();
  mocks.inspect.mockResolvedValueOnce(undefined);
  await expect(callback(input, { signal }, report)).resolves.toBeUndefined();
  expect(mocks.inspect).toHaveBeenCalledExactlyOnceWith(input, signal, report);
  const fault = new Error("inspection fault");
  mocks.inspect.mockRejectedValueOnce(fault);
  await expect(callback(input, { signal }, report)).rejects.toBe(fault);
});
