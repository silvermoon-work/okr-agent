import { expect, it, vi } from "vitest";
import { Type } from "@sinclair/typebox";
import { runTask, type TaskContext } from "@silvermoon-work/task-sdk";
import {
  createCheckCallback,
  runCheck,
  defineChecker,
  type CheckContext,
  type CheckerResult,
  type CheckOutputOptions,
} from "../src/index.js";
import { createCheckContract, problemCodes } from "../src/contracts.js";

vi.mock("@silvermoon-work/task-sdk", () => ({ runTask: vi.fn() }));
const Input = Type.Object({ text: Type.String() });
const Code = Type.Union([Type.Literal("mismatch"), Type.Literal("missing")]);
const contract = createCheckContract(Input, Code);
function context() {
  const link = vi.fn().mockResolvedValue(undefined);
  const resolve = vi.fn().mockReturnValue({ path: "/resources/references" });
  const value = {
    signal: new AbortController().signal,
    log: vi.fn(),
    progress: vi.fn(),
    bundle: { root: { resolve } },
    space: vi.fn(),
    invokeTask: vi.fn(),
    output: { link },
    messages: {},
    futureCapability: true,
  };
  return {
    value: value as unknown as TaskContext,
    link,
    resolve,
    log: value.log,
    space: value.space,
    invokeTask: value.invokeTask,
  };
}
const pass = () => Promise.resolve({ pass: true, children: [] } as const);

it("registers a real worker callback with an ordinary root and restricted context", async () => {
  const host = context();
  const check = vi.fn(pass);
  runCheck(
    contract,
    {
      root: "ordinary",
      registry: (context: CheckContext) => {
        expect(Object.keys(context).sort()).toEqual([
          "bundle",
          "invokeTask",
          "log",
          "progress",
          "signal",
          "space",
        ]);
        expect("output" in context).toBe(false);
        return { ordinary: defineChecker({ target: Input, check }) };
      },
    },
    { assets: true },
  );
  const registered = vi.mocked(runTask).mock.calls.at(-1)?.[0];
  expect(registered).toBeDefined();
  expect(await registered?.({ text: "hello" }, host.value)).toMatchObject({
    protocol: "check-report/v2",
    pass: true,
    documentation: "references/check.md",
  });
  expect(check).toHaveBeenCalledWith(
    { text: "hello" },
    expect.any(AbortSignal),
  );
  expect(host.link.mock.calls.map((call: unknown[]) => call[0])).toEqual([
    "references",
    "assets",
  ]);
});
it("rejects invalid asset options before registering", () => {
  vi.mocked(runTask).mockClear();
  const invalid: CheckOutputOptions = {
    // @ts-expect-error Runtime callers can provide invalid options.
    assets: "true",
  };
  expect(() => {
    runCheck(
      contract,
      {
        root: "text",
        registry: { text: defineChecker({ target: Input, check: pass }) },
      },
      invalid,
    );
  }).toThrow("assets option must be a boolean");
  expect(runTask).not.toHaveBeenCalled();
});
it.each([false, true])(
  "links output references/assets on normal completion: fail=%s",
  async (fail) => {
    const host = context();
    const output = { assets: true };
    const callback = createCheckCallback(
      contract,
      {
        root: "text",
        registry: {
          text: defineChecker({
            target: Input,
            check: async (): Promise<CheckerResult<never, "missing">> => {
              output.assets = false;
              await Promise.resolve();
              return fail
                ? {
                    pass: false,
                    problems: [
                      { code: "missing", brief: "Restore the standard." },
                    ],
                  }
                : { pass: true, children: [] };
            },
          }),
        },
      },
      output,
    );
    const result = await callback({ text: "x" }, host.value);
    expect(result.pass).toBe(!fail);
    expect(host.link.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "references",
      "assets",
    ]);
    if (!result.pass)
      expect(result.problems[0]).toMatchObject({
        code: "missing",
        documentation: "references/problems/missing.md",
        source: { kind: "local", checker: "text" },
      });
  },
);
it.each(["unknown", "blank", "throw", "cancel", "docs", "assets"] as const)(
  "keeps %s as an execution failure",
  async (mode) => {
    const host = context();
    const abort = new AbortController();
    host.value = { ...host.value, signal: abort.signal };
    if (mode === "docs")
      host.link.mockRejectedValue(new Error("docs unavailable"));
    if (mode === "assets")
      host.link
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("assets unavailable"));
    const callback = createCheckCallback(
      contract,
      {
        root: "text",
        registry: {
          text: defineChecker({
            target: Input,
            check: async (): Promise<CheckerResult<never>> => {
              await Promise.resolve();
              if (mode === "throw") throw new Error("Cannot finish.");
              if (mode === "cancel") abort.abort();
              return {
                pass: false,
                problems: [
                  {
                    code: mode === "unknown" ? "unknown" : "missing",
                    brief: mode === "blank" ? " " : "A real finding.",
                  },
                ],
              };
            },
          }),
        },
      },
      { assets: true },
    );
    await expect(callback({ text: "x" }, host.value)).rejects.toThrow();
    if (mode !== "docs" && mode !== "assets")
      expect(host.link).not.toHaveBeenCalled();
  },
);
it("forwards only authorized context methods and freezes input before factory binding", async () => {
  const host = context();
  await createCheckCallback(contract, {
    root: "text",
    registry: async (check: CheckContext, input: { text: string }) => {
      expect(Object.isFrozen(input)).toBe(true);
      await check.log({ level: "info", message: "checking" });
      await check.progress({
        stage: "execution",
        message: "checking",
        percent: 100,
      });
      check.space("cid");
      await check.invokeTask({
        key: "child",
        bundle: check.bundle.root.resolve("resources/child"),
        input,
        timeoutMs: 1000,
      });
      return { text: defineChecker({ target: Input, check: pass }) };
    },
  })({ text: "x" }, host.value);
  expect(host.log).toHaveBeenCalled();
  expect(host.space).toHaveBeenCalledWith("cid");
  expect(host.invokeTask).toHaveBeenCalled();
});
it("rejects invalid Task input and oversized report bodies before linking output", async () => {
  const host = context();
  const callback = createCheckCallback(contract, {
    root: "text",
    registry: {
      text: defineChecker({
        target: Input,
        check: async (): Promise<CheckerResult<never>> => {
          await Promise.resolve();
          return {
            pass: false,
            problems: [{ code: "missing", brief: "x".repeat(65_536) }],
          };
        },
      }),
    },
  });
  await expect(callback({ text: "x" }, host.value)).rejects.toThrow(
    "byte budget",
  );
  expect(host.link).not.toHaveBeenCalled();
  // @ts-expect-error Runtime schema still checks JavaScript input.
  await expect(callback({ text: 1 }, host.value)).rejects.toThrow("input");
});
it("rejects open, duplicate and unsafe problem code schemas", () => {
  expect(problemCodes(Code)).toEqual(["mismatch", "missing"]);
  for (const invalid of [
    Type.String(),
    Type.Number(),
    Type.Literal("../escape"),
    Type.Literal("CON"),
    Type.Union([Type.Literal("a"), Type.Literal("a")]),
  ])
    expect(() => problemCodes(invalid)).toThrow();
});
