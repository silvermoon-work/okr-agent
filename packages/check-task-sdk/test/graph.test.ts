import { expect, it, vi } from "vitest";
import { Type } from "@sinclair/typebox";
import {
  defineChecker,
  executeCheck,
  type CheckerResult,
  type ReportNode,
} from "../src/legacy.js";
import { canonicalSnapshot } from "../src/canonical.js";
import { executeCheckInput } from "../src/graph.js";

const target = Type.Object(
  { id: Type.String() },
  { additionalProperties: false },
);
const controller = () => new AbortController();
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
it("deduplicates insertion-order variants but not different names, with zero calls on pre-abort", async () => {
  const schema = Type.Object({
    a: Type.Number(),
    b: Type.Array(Type.Object({ x: Type.Number(), y: Type.Number() })),
  });
  const left = { a: 1, b: [{ x: 2, y: 3 }] };
  const right = { b: [{ y: 3, x: 2 }], a: 1 };
  const first = vi.fn(() =>
    Promise.resolve({ pass: true, children: [] } as const),
  );
  const second = vi.fn(() =>
    Promise.resolve({ pass: true, children: [] } as const),
  );
  const root = vi.fn(() =>
    Promise.resolve({
      pass: true,
      children: [
        { checker: "one", target: left },
        { checker: "one", target: right },
        { checker: "two", target: right },
      ],
    } as const),
  );
  const registry = {
    root: defineChecker({ target: Type.Object({}), check: root }),
    one: defineChecker({ target: schema, check: first }),
    two: defineChecker({ target: schema, check: second }),
  };
  const abort = controller();
  abort.abort(new Error("pre-cancelled"));
  await expect(
    executeCheck({
      registry,
      root: { checker: "root", target: {} },
      signal: abort.signal,
    }),
  ).rejects.toThrow("pre-cancelled");
  expect(root).not.toHaveBeenCalled();
  const records: ReportNode[] = [];
  const report = await executeCheck({
    registry,
    root: { checker: "root", target: {} },
    signal: controller().signal,
    log: (node) => {
      records.push(node);
    },
  });
  expect(root).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(report).toEqual({ pass: true, documentation: "references/check.md" });
  expect(records).toHaveLength(3);
  expect(records.filter((node) => node.parent === undefined)).toHaveLength(1);
  expect(
    records.slice(1).every((node) => node.parent === records[0]?.key),
  ).toBe(true);
});
it("deduplicates shared nodes and cycles, logging one discovery parent and independent problems", async () => {
  const calls: string[] = [];
  const records: ReportNode[] = [];
  const registry = {
    ordinary: defineChecker({
      target,
      check: async ({
        id,
      }): Promise<
        CheckerResult<{ checker: "ordinary"; target: { id: string } }>
      > => {
        calls.push(id);
        await Promise.resolve();
        if (id === "root")
          return {
            pass: true,
            children: [
              { checker: "ordinary", target: { id: "a" } },
              { checker: "ordinary", target: { id: "b" } },
            ],
          };
        if (id === "a" || id === "b")
          return {
            pass: true,
            children: [
              { checker: "ordinary", target: { id: "shared" } },
              { checker: "ordinary", target: { id: "root" } },
            ],
          };
        return {
          pass: false,
          problems: [{ code: "bad", brief: "shared failure" }],
        };
      },
    }),
  };
  const report = await executeCheck({
    registry,
    root: { checker: "ordinary", target: { id: "root" } },
    signal: controller().signal,
    log: (node) => {
      records.push(node);
    },
  });
  expect(calls).toEqual(["root", "a", "b", "shared"]);
  expect(records).toHaveLength(4);
  expect(records.find((node) => node.item.target.id === "shared")?.parent).toBe(
    records.find((node) => node.item.target.id === "a")?.key,
  );
  expect(
    records.find((node) => node.item.target.id === "root"),
  ).not.toHaveProperty("parent");
  expect(report.pass).toBe(false);
  if (!report.pass) expect(report.problems).toHaveLength(1);
});

it("runs a ready descendant without a level barrier and awaits cleanup on cancellation", async () => {
  const slow = deferred();
  const started = deferred();
  const cleaned = deferred();
  const abort = controller();
  const calls: string[] = [];
  const registry = {
    graph: defineChecker({
      target,
      check: async (
        { id },
        signal,
      ): Promise<
        CheckerResult<{ checker: "graph"; target: { id: string } }>
      > => {
        calls.push(id);
        if (id === "root")
          return {
            pass: true,
            children: ["slow", "fast"].map((id) => ({
              checker: "graph",
              target: { id },
            })),
          };
        if (id === "slow") {
          await new Promise<void>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                resolve();
              },
              { once: true },
            );
          });
          await slow.promise;
          cleaned.resolve();
          return {
            pass: true,
            children: [{ checker: "graph", target: { id: "late" } }],
          };
        }
        if (id === "fast")
          return {
            pass: true,
            children: [{ checker: "graph", target: { id: "descendant" } }],
          };
        started.resolve();
        return { pass: true, children: [] };
      },
    }),
  };
  const execution = executeCheck({
    registry,
    root: { checker: "graph", target: { id: "root" } },
    signal: abort.signal,
    limits: { concurrency: 2 },
  });
  const settled = vi.fn();
  const observed = execution.then(settled, settled);
  await started.promise;
  expect(calls).toEqual(["root", "slow", "fast", "descendant"]);
  abort.abort(new Error("cancel"));
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  slow.resolve();
  await observed;
  await cleaned.promise;
  await expect(execution).rejects.toThrow("cancel");
  expect(calls).not.toContain("late");
});

it("snapshots canonical values without executing descriptors", () => {
  expect(canonicalSnapshot({ b: [1, -0], a: "e\u0301" }).encoded).toBe(
    canonicalSnapshot({ a: "e\u0301", b: [1, 0] }).encoded,
  );
  const getter = vi.fn();
  for (const value of [
    {
      get a() {
        getter();
        return 1;
      },
    },
    { a: undefined },
    { a: Infinity },
    Object.create({}),
    { a: new Date() },
    { a: Object.assign(new Array<unknown>(2), { 1: 1 }) },
    new Proxy({}, {}),
    Object.defineProperty({}, "hidden", { value: 1 }),
  ])
    expect(() => canonicalSnapshot(value)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});

it("deduplicates children while queued, running and completed", async () => {
  const entered = deferred();
  const release = deferred();
  const done = deferred();
  const count = vi.fn();
  const records: ReportNode[] = [];
  const registry = {
    graph: defineChecker({
      target,
      check: async ({
        id,
      }): Promise<
        CheckerResult<{ checker: "graph"; target: { id: string } }>
      > => {
        if (id === "root")
          return {
            pass: true,
            children: ["first", "queued", "running", "completed"].map((id) => ({
              checker: "graph",
              target: { id },
            })),
          };
        if (id === "shared") {
          count();
          entered.resolve();
          await release.promise;
          done.resolve();
          return { pass: false, problems: [{ code: "same", brief: "once" }] };
        }
        if (id === "running") await entered.promise;
        if (id === "completed") await done.promise;
        return {
          pass: true,
          children: [
            { checker: "graph", target: { id: "shared" } },
            { checker: "graph", target: { id: "shared" } },
          ],
        };
      },
    }),
  };
  const pending = executeCheck({
    registry,
    root: { checker: "graph", target: { id: "root" } },
    signal: controller().signal,
    log: (node) => {
      records.push(node);
    },
  });
  await entered.promise;
  release.resolve();
  const report = await pending;
  expect(count).toHaveBeenCalledTimes(1);
  expect(
    records.filter((node) => node.item.target.id === "shared"),
  ).toHaveLength(1);
  if (report.pass) throw new Error("Expected shared failure.");
  expect(report.problems).toHaveLength(1);
});

it("isolates target and registry mutation after registration", async () => {
  const waiting = deferred();
  const release = deferred();
  const raw = { id: "queued" };
  const observed: string[] = [];
  const records: ReportNode[] = [];
  const registry = {
    root: defineChecker({
      target,
      check: () =>
        Promise.resolve({
          pass: true,
          children: [
            { checker: "child", target: { id: "block" } },
            { checker: "child", target: raw },
          ],
        } as const),
    }),
    child: defineChecker({
      target,
      check: async ({ id }) => {
        if (id === "block") {
          waiting.resolve();
          await release.promise;
        }
        observed.push(id);
        return { pass: true, children: [] } as const;
      },
    }),
  };
  const pending = executeCheck({
    registry,
    root: { checker: "root", target: { id: "root" } },
    signal: controller().signal,
    limits: { concurrency: 1 },
    log: (node) => {
      records.push(node);
    },
  });
  await waiting.promise;
  raw.id = "changed";
  registry.child = defineChecker({
    target,
    check: async () => {
      await Promise.resolve();
      throw new Error("must not be rebound");
    },
  });
  release.resolve();
  const report = await pending;
  expect(observed).toEqual(["block", "queued"]);
  expect(Object.isFrozen(report)).toBe(true);
  expect(records.some((node) => node.item.target.id === "queued")).toBe(true);
});

it("returns identical stable reports for reversed completion order without code dedup", async () => {
  const run = async (first: "a" | "b") => {
    const other = deferred();
    const registry = {
      graph: defineChecker({
        target,
        check: async ({
          id,
        }): Promise<
          CheckerResult<{ checker: "graph"; target: { id: string } }>
        > => {
          if (id === "root")
            return {
              pass: true,
              children: [
                { checker: "graph", target: { id: "b" } },
                { checker: "graph", target: { id: "a" } },
              ],
            };
          if (id === first) other.resolve();
          else await other.promise;
          return {
            pass: false,
            problems: [{ code: "same", brief: "independent" }],
          };
        },
      }),
    };
    return executeCheck({
      registry,
      root: { checker: "graph", target: { id: "root" } },
      signal: controller().signal,
    });
  };
  const first = await run("a");
  expect(first).toEqual(await run("b"));
  if (first.pass) throw new Error("Expected both findings.");
  expect(first.problems).toHaveLength(2);
  expect(first.problems[0].nodeKey).not.toBe(first.problems[1]!.nodeKey);
});

it("collects real cleanup failures and waits before propagating the initiating fault", async () => {
  const entered = deferred();
  const cleanup = deferred();
  const failure = new Error("initiating fault");
  const cleanupFailure = new Error("cleanup fault");
  const calls: string[] = [];
  const registry = {
    graph: defineChecker({
      target,
      check: async (
        { id },
        signal,
      ): Promise<
        CheckerResult<{ checker: "graph"; target: { id: string } }>
      > => {
        calls.push(id);
        if (id === "root")
          return {
            pass: true,
            children: ["slow", "fault", "never"].map((id) => ({
              checker: "graph",
              target: { id },
            })),
          };
        if (id === "fault") {
          await entered.promise;
          throw failure;
        }
        entered.resolve();
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            { once: true },
          );
        });
        await cleanup.promise;
        throw cleanupFailure;
      },
    }),
  };
  const pending = executeCheck({
    registry,
    root: { checker: "graph", target: { id: "root" } },
    signal: controller().signal,
    limits: { concurrency: 2 },
  });
  const settled = vi.fn();
  const observed = pending.catch((error: unknown) => {
    settled();
    return error;
  });
  await entered.promise;
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  cleanup.resolve();
  const error = await observed;
  expect(error).toBeInstanceOf(AggregateError);
  if (!(error instanceof AggregateError))
    throw new Error("Expected all errors.");
  expect(error.errors).toEqual([failure, cleanupFailure]);
  expect(error.cause).toBe(failure);
  expect(calls).toEqual(["root", "slow", "fault"]);
});

it.each([
  ["nodes", 1],
  ["children", 1],
  ["encodingBytes", 5],
  ["targetBytes", 3],
  ["depth", 1],
  ["values", 1],
  ["resultBytes", 2],
  ["problems", 1],
] as const)(
  "enforces finite %s budgets without a success report",
  async (limit, value) => {
    const schema = Type.Object({ nested: Type.Object({ id: Type.String() }) });
    const registry = {
      graph: defineChecker({
        target: schema,
        check: async ({
          nested,
        }): Promise<
          CheckerResult<{
            checker: "graph";
            target: { nested: { id: string } };
          }>
        > => {
          await Promise.resolve();
          return nested.id === "root"
            ? {
                pass: true,
                children: ["a", "b"].map((id) => ({
                  checker: "graph",
                  target: { nested: { id } },
                })),
              }
            : {
                pass: false,
                problems: [
                  { code: "bad", brief: "one" },
                  { code: "bad", brief: "two" },
                ],
              };
        },
      }),
    };
    await expect(
      executeCheck({
        registry,
        root: { checker: "graph", target: { nested: { id: "root" } } },
        signal: controller().signal,
        limits: { [limit]: value },
      }),
    ).rejects.toThrow("budget");
  },
);
it("yields immediate expansion chains so wall time cancellation can stop dispatch", async () => {
  let calls = 0;
  const registry = {
    chain: defineChecker({
      target: Type.Object({ n: Type.Number() }),
      check: async ({ n }) => {
        calls++;
        await Promise.resolve();
        return {
          pass: true,
          children: [{ checker: "chain", target: { n: n + 1 } }],
        } as const;
      },
    }),
  };
  await expect(
    executeCheck({
      registry,
      root: { checker: "chain", target: { n: 0 } },
      signal: controller().signal,
      limits: { timeoutMs: 1 },
    }),
  ).rejects.toThrow("time budget");
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThanOrEqual(68);
});
it.each([0, -1, NaN, Infinity, 1.5, 65])(
  "rejects invalid concurrency %s",
  async (concurrency) => {
    const registry = {
      root: defineChecker({
        target,
        check: () => Promise.resolve({ pass: true, children: [] } as const),
      }),
    };
    await expect(
      executeCheck({
        registry,
        root: { checker: "root", target: { id: "root" } },
        signal: controller().signal,
        limits: { concurrency },
      }),
    ).rejects.toThrow("limit");
  },
);
it("rejects nondefinitions, invalid registration names and executable descriptors", async () => {
  const root = defineChecker({
    target,
    check: () => Promise.resolve({ pass: true, children: [] } as const),
  });
  const getters = vi.fn(() => root);
  for (const registry of [
    null,
    new Proxy({}, {}),
    { "bad name": root },
    { root: {} },
    Object.defineProperty({}, "root", { get: getters, enumerable: true }),
    { [Symbol("root")]: root },
  ])
    await expect(
      executeCheckInput({
        registry: registry as never,
        root: { checker: "root", target: { id: "x" } },
        signal: controller().signal,
      }),
    ).rejects.toThrow();
  expect(getters).not.toHaveBeenCalled();
  const synchronous = defineChecker({
    target,
    // @ts-expect-error Invalid JavaScript implementation is rejected at invocation.
    check: () => ({ pass: true, children: [] }),
  });
  await expect(
    executeCheckInput({
      registry: { root: synchronous },
      root: { checker: "root", target: { id: "x" } },
      signal: controller().signal,
    }),
  ).rejects.toThrow("Promise");
  expect(() => root.invoke({ id: 1 }, controller().signal)).toThrow();
});
