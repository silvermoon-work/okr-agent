import { describe, expect, it, vi } from "vitest";
import { Type } from "@sinclair/typebox";
import {
  defineChecker,
  executeCheck,
  mergeCheckerRegistries,
  type CheckerResult,
} from "../src/index.js";

const Root = Type.Object(
  { text: Type.String() },
  { additionalProperties: false },
);
const Leaf = Type.Object(
  { name: Type.String() },
  { additionalProperties: false },
);
type Item =
  | { checker: "root"; target: { text: string } }
  | { checker: "branch" | "leaf"; target: { name: string } };
type Result = CheckerResult<Item, "missing">;
const passed = (...children: Item[]): Result => ({ pass: true, children });
const failed: Result = {
  pass: false,
  problems: [{ code: "missing", brief: "A missing fact." }],
};
const signal = () => new AbortController().signal;

describe("registered target validation", () => {
  it("delivers protected target values rather than mutable author aliases", async () => {
    const parameters = { text: "root" };
    const child = { name: "child" };
    const registry = {
      root: defineChecker({
        target: Root,
        check: async (target): Promise<Result> => {
          expect(target).toEqual(parameters);
          expect(target).not.toBe(parameters);
          expect(Object.isFrozen(target)).toBe(true);
          await Promise.resolve();
          return passed({ checker: "leaf", target: child });
        },
      }),
      branch: defineChecker({
        target: Leaf,
        check: () => Promise.resolve(passed()),
      }),
      leaf: defineChecker({
        target: Leaf,
        check: async (target) => {
          expect(target).toEqual(child);
          expect(target).not.toBe(child);
          expect(Object.isFrozen(target)).toBe(true);
          await Promise.resolve();
          return passed();
        },
      }),
    };
    await executeCheck({
      registry,
      root: { checker: "root", target: parameters },
      signal: signal(),
    });
  });
  it("preserves root input, FIFO pruning and independent execution state", async () => {
    const calls: string[] = [];
    const registry = {
      root: defineChecker({
        target: Root,
        check: async ({ text }): Promise<Result> => {
          calls.push(text);
          await Promise.resolve();
          return passed(
            { checker: "branch", target: { name: "good" } },
            { checker: "branch", target: { name: "failed" } },
            { checker: "leaf", target: { name: "sibling" } },
          );
        },
      }),
      branch: defineChecker({
        target: Leaf,
        check: async ({ name }): Promise<Result> => {
          calls.push(name);
          await Promise.resolve();
          return name === "failed"
            ? failed
            : passed(
                { checker: "leaf", target: { name: "child" } },
                { checker: "branch", target: { name: "failed" } },
              );
        },
      }),
      leaf: defineChecker({
        target: Leaf,
        check: async ({ name }) => {
          calls.push(name);
          await Promise.resolve();
          return passed();
        },
      }),
    };
    const report = await executeCheck({
      registry,
      root: { checker: "root", target: { text: "root" } },
      signal: signal(),
      limits: { concurrency: 1 },
    });
    expect(calls).toEqual(["root", "good", "failed", "sibling", "child"]);
    if (report.pass) throw new Error("Expected the failed branch.");
    expect(report.problems).toHaveLength(1);
    calls.length = 0;
    await executeCheck({
      registry,
      root: { checker: "root", target: { text: "next" } },
      signal: signal(),
    });
    expect(calls[0]).toBe("next");
    expect(calls).toHaveLength(5);
  });
  it("does not invoke descendants when root fails", async () => {
    const child = vi.fn(() => Promise.resolve(passed()));
    const registry = {
      root: defineChecker({
        target: Root,
        check: () => Promise.resolve(failed),
      }),
      branch: defineChecker({ target: Leaf, check: child }),
      leaf: defineChecker({ target: Leaf, check: child }),
    };
    const report = await executeCheck({
      registry,
      root: { checker: "root", target: { text: "root" } },
      signal: signal(),
    });
    expect(report.pass).toBe(false);
    expect(child).not.toHaveBeenCalled();
  });
  const invalid: unknown[] = [
    undefined,
    [],
    {},
    { pass: "true", children: [] },
    { pass: true },
    { pass: true, children: {} },
    { pass: true, children: [], problems: [] },
    { pass: false, problems: [] },
    { pass: false, problems: {} },
    { pass: false, problems: [null] },
    { pass: false, problems: [{ code: "", brief: "x" }] },
    { pass: false, problems: [{ code: "missing", brief: " " }] },
    { pass: false, problems: [{ code: "missing", brief: "x", extra: true }] },
    { pass: true, children: [null] },
    { pass: true, children: [{ checker: "unknown", target: {} }] },
    { pass: true, children: [{ checker: "toString", target: {} }] },
    { pass: true, children: [{ checker: "leaf", target: "text" }] },
    { pass: true, children: [{ checker: "leaf", target: { name: 1 } }] },
    { pass: true, children: [{ checker: 1, target: {} }] },
    { pass: true, children: [{ checker: "leaf", target: {}, extra: true }] },
  ];
  it.each(invalid.map((value, index) => [index, value] as const))(
    "rejects malformed result or child %s before child invocation",
    async (_index, value) => {
      const child = vi.fn(() => Promise.resolve(passed()));
      const registry = {
        root: defineChecker({
          target: Root,
          check: vi
            .fn<() => Promise<Result>>()
            .mockResolvedValue(value as never),
        }),
        branch: defineChecker({ target: Leaf, check: child }),
        leaf: defineChecker({ target: Leaf, check: child }),
      };
      await expect(
        executeCheck({
          registry,
          root: { checker: "root", target: { text: "x" } },
          signal: signal(),
        }),
      ).rejects.toThrow();
      expect(child).not.toHaveBeenCalled();
    },
  );
  it("rejects bad roots and duplicate registration", async () => {
    const registry = {
      root: defineChecker({
        target: Root,
        check: () => Promise.resolve({ pass: true, children: [] } as const),
      }),
    };
    await expect(
      executeCheck({
        registry,
        // @ts-expect-error Invalid JavaScript input still receives runtime validation.
        root: { checker: "root", target: { text: 1 } },
        signal: signal(),
      }),
    ).rejects.toThrow("schema");
    await expect(
      executeCheck({
        registry,
        // @ts-expect-error Unknown root is not part of the literal registry.
        root: { checker: "absent", target: {} },
        signal: signal(),
      }),
    ).rejects.toThrow("Unknown");
    // @ts-expect-error Colliding static keys are forbidden, including JavaScript callers.
    expect(() => mergeCheckerRegistries(registry, registry)).toThrow(
      "Duplicate",
    );
  });
  it("propagates faults and cancellation without expanding late results", async () => {
    const failure = new Error("I/O or cleanup failed");
    const registry = {
      root: defineChecker({
        target: Root,
        check: async () => {
          await Promise.resolve();
          throw failure;
        },
      }),
    };
    await expect(
      executeCheck({
        registry,
        root: { checker: "root", target: { text: "x" } },
        signal: signal(),
      }),
    ).rejects.toBe(failure);
    const abort = new AbortController();
    abort.abort(failure);
    await expect(
      executeCheck({
        registry,
        root: { checker: "root", target: { text: "x" } },
        signal: abort.signal,
      }),
    ).rejects.toBe(failure);
  });
});
