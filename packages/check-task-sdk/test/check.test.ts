import { describe, expect, it, vi } from "vitest";
import { Type, type Static } from "@sinclair/typebox";
import type { TaskContext } from "@silvermoon-work/task-sdk";
import {
  createCheckCallback,
  type CheckContext,
  type ProblemReporter,
} from "../src/index.js";
import { createCheckContract, problemCodes } from "../src/contracts.js";

const Input = Type.Object({ text: Type.String() });
const Code = Type.Union([Type.Literal("mismatch"), Type.Literal("missing")]);
const contract = createCheckContract(Input, Code);

function context() {
  const link = vi.fn().mockResolvedValue(undefined);
  const resolve = vi.fn().mockReturnValue({ path: "/resources/references" });
  const signal = new AbortController().signal;
  const value = {
    signal,
    log: vi.fn(),
    progress: vi.fn(),
    bundle: {
      root: {
        resolve,
      },
    },
    space: vi.fn(),
    invokeTask: vi.fn(),
    output: { link },
    messages: {},
    futureCapability: true,
  };
  return {
    value: value as unknown as TaskContext,
    link,
    log: value.log,
    space: value.space,
    invokeTask: value.invokeTask,
    resolve,
  };
}

describe("Check callbacks", () => {
  it.each([false, true])(
    "links standard assets on normal completion (reported problem: %s)",
    async (nonpassing) => {
      const host = context();
      const options = { assets: true };
      const callback = createCheckCallback(
        contract,
        async (_input, _check, report) => {
          options.assets = false;
          if (nonpassing) report("mismatch", "Restore the standard asset.");
          await Promise.resolve();
        },
        options,
      );
      const result = await callback({ text: "hello" }, host.value);
      expect(result.pass).toBe(!nonpassing);
      expect(host.link.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        "references",
        "assets",
      ]);
      expect(host.resolve).toHaveBeenCalledWith("resources/assets");
    },
  );

  it("keeps an asset link failure a Run fault even after reporting a problem", async () => {
    const host = context();
    host.link
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Standard assets unavailable."));
    const callback = createCheckCallback(
      contract,
      async (_input, check, report) => {
        expect("output" in check).toBe(false);
        report("missing", "A real problem.");
        await Promise.resolve();
      },
      { assets: true },
    );
    await expect(callback({ text: "hello" }, host.value)).rejects.toThrow(
      "Standard assets unavailable.",
    );
  });

  it("infers input/codes, explicitly restricts capabilities and links documentation on pass", async () => {
    const host = context();
    const callback = createCheckCallback(
      contract,
      async (input, check, report) => {
        expect(input.text).toBe("hello");
        expect(Object.keys(check).sort()).toEqual([
          "bundle",
          "invokeTask",
          "log",
          "progress",
          "signal",
          "space",
        ]);
        if (input.text === "typecheck-only") {
          // @ts-expect-error input derives from TypeBox
          void input.noSuchProperty;
          // @ts-expect-error codes derive from TypeBox
          report("undeclared", "bad");
          // @ts-expect-error output is not an author capability
          void check.output;
        }
        await Promise.resolve();
      },
    );
    expect(await callback({ text: "hello" }, host.value)).toEqual({
      pass: true,
      documentation: "references/check.md",
    });
    expect(host.link).toHaveBeenCalledWith("references", {
      path: "/resources/references",
    });
  });

  it("collects only code/brief/docs and closes the reporter without mutable aliases", async () => {
    const host = context();
    let late!: ProblemReporter<Static<typeof Code>>;
    const result = await createCheckCallback(
      contract,
      async (_input, _context, report) => {
        late = report;
        report("mismatch", "The supplied text differs.");
        await Promise.resolve();
      },
    )({ text: "wrong" }, host.value);
    expect(result).toEqual({
      pass: false,
      documentation: "references/check.md",
      problems: [
        {
          code: "mismatch",
          brief: "The supplied text differs.",
          documentation: "references/problems/mismatch.md",
        },
      ],
    });
    expect(() => {
      late("missing", "late");
    }).toThrow("closed");
    if (!result.pass) {
      expect(result.problems).toHaveLength(1);
      expect(Object.isFrozen(result.problems[0])).toBe(true);
      expect(Object.isFrozen(result.problems)).toBe(true);
    }
  });

  it.each(["unknown", "blank", "throw", "cancel", "docs"])(
    "preserves %s as execution failure, even after reporting",
    async (mode) => {
      const host = context();
      const abort = new AbortController();
      if (mode === "cancel")
        host.value = { ...host.value, signal: abort.signal };
      if (mode === "docs")
        host.link.mockRejectedValue(new Error("docs unavailable"));
      const callback = createCheckCallback(
        contract,
        async (_input, _context, report) => {
          report("missing", "A real problem.");
          if (mode === "throw") throw new Error("Cannot finish.");
          if (mode === "cancel") abort.abort();
          if (mode === "unknown" || mode === "blank") {
            try {
              report(
                mode === "unknown" ? ("unknown" as "missing") : "missing",
                mode === "blank" ? " \n " : "bad",
              );
            } catch {
              /* Invalid reporting cannot be swallowed into a normal result. */
            }
          }
          await Promise.resolve();
        },
      );
      await expect(callback({ text: "x" }, host.value)).rejects.toThrow();
      if (mode !== "docs") expect(host.link).not.toHaveBeenCalled();
    },
  );

  it("forwards the allowed operations rather than the raw context", async () => {
    const host = context();
    await createCheckCallback(contract, async (_input, check: CheckContext) => {
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
        input: {},
        timeoutMs: 1000,
      });
    })({ text: "x" }, host.value);
    expect(host.log).toHaveBeenCalled();
    expect(host.space).toHaveBeenCalledWith("cid");
    expect(host.invokeTask).toHaveBeenCalledWith({
      key: "child",
      bundle: host.value.bundle.root.resolve("resources/child"),
      input: {},
      timeoutMs: 1000,
    });
  });
});

it("rejects open, duplicate and unsafe code schemas", () => {
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
