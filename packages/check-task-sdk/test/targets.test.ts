import { describe, expect, it, vi } from "vitest";
import { Type } from "@sinclair/typebox";
import {
  createTargetCheckers,
  type Target,
  type TargetCheckerRegistry,
  type TargetChecker,
  type RootTargetChecker,
  type TargetResult,
} from "../src/index.js";

const schemas = {
  $root: Type.Object({ text: Type.String() }, { additionalProperties: false }),
  branch: Type.Object({ name: Type.String() }, { additionalProperties: false }),
  leaf: Type.Object({ name: Type.String() }, { additionalProperties: false }),
};
type Result = TargetResult<typeof schemas, "missing">;
const passed = (...targets: Target<typeof schemas>[]): Result => ({
  pass: true,
  targets,
});
const failed: Result = {
  pass: false,
  problems: [{ code: "missing", brief: "A missing fact." }],
};
const signal = () => new AbortController().signal;

describe("TargetChecker DFS", () => {
  it("delivers the complete type-correlated target and original selector to root and child checkers", async () => {
    const parameters = { text: "root" };
    const child: Target<typeof schemas> = {
      type: "leaf",
      selector: { name: "child" },
    };
    const rootChecker: RootTargetChecker<typeof schemas, "missing"> = (
      target,
    ) => {
      expect(target).toEqual({ type: "$root", selector: parameters });
      expect(target.selector).toBe(parameters);
      const rootType: "$root" = target.type;
      expect(rootType).toBe("$root");
      return passed(child);
    };
    const leafChecker: TargetChecker<typeof schemas, "missing", "leaf"> = (
      target,
    ) => {
      expect(target).toBe(child);
      const leafType: "leaf" = target.type;
      expect(leafType).toBe("leaf");
      expect(target.selector.name).toBe("child");
      return passed();
    };
    const registry: TargetCheckerRegistry<typeof schemas, "missing"> = {
      $root: rootChecker,
      branch: () => passed(),
      leaf: leafChecker,
    };
    await createTargetCheckers(schemas, registry)(
      parameters,
      signal(),
      vi.fn(),
    );
  });
  it("preserves root parameters, serial DFS, pruning, sibling order and per-invocation state", async () => {
    const calls: string[] = [];
    const report = vi.fn();
    const run = createTargetCheckers<typeof schemas, "missing">(schemas, {
      $root: async ({ selector: input }) => {
        calls.push(input.text);
        await Promise.resolve();
        return passed(
          { type: "branch", selector: { name: "good" } },
          { type: "branch", selector: { name: "failed" } },
          { type: "leaf", selector: { name: "sibling" } },
        );
      },
      branch: async ({ selector: { name } }) => {
        calls.push(name);
        await Promise.resolve();
        return name === "failed"
          ? failed
          : passed(
              { type: "leaf", selector: { name: "child" } },
              { type: "branch", selector: { name: "failed" } },
            );
      },
      leaf: async ({ selector: { name } }) => {
        calls.push(name);
        await Promise.resolve();
        return passed();
      },
    });
    await run({ text: "root" }, signal(), report);
    expect(calls).toEqual([
      "root",
      "good",
      "child",
      "failed",
      "failed",
      "sibling",
    ]);
    expect(report).toHaveBeenCalledTimes(2);
    calls.length = 0;
    await run({ text: "next" }, signal(), vi.fn());
    expect(calls[0]).toBe("next");
    expect(calls).toHaveLength(6);
  });

  it("does not invoke descendants when the root fails", async () => {
    const leaf = vi.fn(() => passed());
    const report = vi.fn();
    await createTargetCheckers<typeof schemas, "missing">(schemas, {
      $root: () => failed,
      branch: leaf,
      leaf,
    })({ text: "root" }, signal(), report);
    expect(leaf).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith("missing", "A missing fact.");
  });

  const invalid: unknown[] = [
    undefined,
    [],
    {},
    { pass: "true", targets: [] },
    { pass: true },
    { pass: true, targets: {} },
    { pass: true, targets: [], problems: [] },
    { pass: false, problems: [] },
    { pass: false, problems: {} },
    { pass: false, problems: [null] },
    { pass: false, problems: [{ code: "", brief: "x" }] },
    { pass: false, problems: [{ code: "missing", brief: " " }] },
    { pass: false, problems: [{ code: "missing", brief: "x", extra: true }] },
    { pass: true, targets: [null] },
    { pass: true, targets: [{ type: "unknown", selector: {} }] },
    { pass: true, targets: [{ type: "toString", selector: {} }] },
    { pass: true, targets: [{ type: "leaf", selector: "text" }] },
    { pass: true, targets: [{ type: "leaf", selector: { name: 1 } }] },
    { pass: true, targets: [{ type: 1, selector: {} }] },
    { pass: true, targets: [{ type: "leaf", selector: {}, extra: true }] },
  ];
  it.each(invalid.map((value, index) => [index, value]))(
    "rejects invalid result/target %s before invoking any child",
    async (_index, value) => {
      const child = vi.fn(() => passed());
      const registry = {
        $root: () => value,
        branch: child,
        leaf: child,
      } as unknown as TargetCheckerRegistry<typeof schemas, "missing">;
      await expect(
        createTargetCheckers(schemas, registry)(
          { text: "x" },
          signal(),
          vi.fn(),
        ),
      ).rejects.toThrow();
      expect(child).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid root parameters and incomplete registration", async () => {
    const registry = {
      $root: () => passed(),
      branch: () => passed(),
      leaf: () => passed(),
    };
    const run = createTargetCheckers(schemas, registry);
    // @ts-expect-error Root parameters derive from the root selector schema.
    await expect(run({ text: 1 }, signal(), vi.fn())).rejects.toThrow(
      "selector",
    );
    expect(() =>
      // @ts-expect-error Every target type requires a registered checker.
      createTargetCheckers(schemas, { $root: () => passed() }),
    ).toThrow("registry");
    expect(() =>
      createTargetCheckers(
        {} as typeof schemas,
        {} as TargetCheckerRegistry<typeof schemas, "missing">,
      ),
    ).toThrow("$root");
    expect(() =>
      createTargetCheckers(schemas, {
        ...registry,
        leaf: null,
      } as unknown as TargetCheckerRegistry<typeof schemas, "missing">),
    ).toThrow("registry");
    const target: Target<typeof schemas> = {
      type: "leaf",
      // @ts-expect-error Targets correlate their selector with their registered type.
      selector: { text: "x" },
    };
    expect(target.type).toBe("leaf");
  });

  it("propagates checker, reporter and cancellation faults without continuing siblings", async () => {
    const child = vi.fn(() => passed());
    const failure = new Error("I/O or cleanup failed");
    const registry = {
      $root: () => {
        throw failure;
      },
      branch: child,
      leaf: child,
    };
    await expect(
      createTargetCheckers(schemas, registry)({ text: "x" }, signal(), vi.fn()),
    ).rejects.toBe(failure);
    const reporterFailure = new Error("Protocol failure");
    await expect(
      createTargetCheckers<typeof schemas, "missing">(schemas, {
        ...registry,
        $root: () => failed,
      })({ text: "x" }, signal(), () => {
        throw reporterFailure;
      }),
    ).rejects.toBe(reporterFailure);
    const controller = new AbortController();
    const run = createTargetCheckers(schemas, {
      ...registry,
      $root: async () => {
        await Promise.resolve();
        controller.abort(failure);
        return passed({ type: "leaf", selector: { name: "never" } });
      },
    });
    await expect(run({ text: "x" }, controller.signal, vi.fn())).rejects.toBe(
      failure,
    );
    expect(child).not.toHaveBeenCalled();
    await expect(run({ text: "x" }, controller.signal, vi.fn())).rejects.toBe(
      failure,
    );
  });
});
