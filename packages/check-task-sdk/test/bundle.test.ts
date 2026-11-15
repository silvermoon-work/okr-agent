import { expect, it, vi } from "vitest";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  checkerFromBundle,
  createCheckContract,
  defineChecker,
  executeCheck,
  validateCheckReport,
  type CheckerResult,
} from "../src/index.js";
import { documentPath, exactCid } from "../src/report.js";

const cid = "bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const input = Type.Object(
  { text: Type.String() },
  { additionalProperties: false },
);
const contract = createCheckContract(input, Type.Literal("child-code"));
async function childReport(pass: boolean) {
  const registry = {
    child: defineChecker({
      target: input,
      check: async (): Promise<CheckerResult<never>> => {
        await Promise.resolve();
        return pass
          ? { pass: true, children: [] }
          : {
              pass: false,
              problems: [{ code: "child-code", brief: "Child finding." }],
            };
      },
    }),
  };
  return executeCheck({
    registry,
    root: { checker: "child", target: { text: "x" } },
    signal: new AbortController().signal,
  });
}
it.each([false, true])(
  "adapts a complete child report as one leaf, preserving provenance: %s",
  async (pass) => {
    const child = await childReport(pass);
    const execute = vi.fn().mockResolvedValue({ cid, result: child });
    const registry = {
      imported: checkerFromBundle({
        bundleCid: cid,
        contract,
        port: { execute },
      }),
    };
    const report = await executeCheck({
      registry,
      root: { checker: "imported", target: { text: "x" } },
      signal: new AbortController().signal,
      problemCodes: ["parent-code"],
    });
    expect(report.nodes).toHaveLength(1);
    expect(report.edges).toEqual([]);
    expect(report.pass).toBe(pass);
    expect(execute).toHaveBeenCalledWith({
      bundleCid: cid,
      input: { text: "x" },
      signal: expect.any(AbortSignal) as unknown,
    });
    if (!report.pass)
      expect(report.problems[0]).toMatchObject({
        code: "child-code",
        documentation: "references/problems/child-code.md",
        source: {
          kind: "output",
          bundleCid: cid,
          outputCid: cid,
          checker: "child",
          nodeKey: child.root,
        },
      });
    expect(validateCheckReport(report)).toEqual(report);
    const parentContract = createCheckContract(
      input,
      Type.Literal("parent-code"),
    );
    expect(Value.Check(parentContract.result, report)).toBe(true);
    if (!report.pass)
      expect(
        Value.Check(
          parentContract.schemas["check-problem"],
          report.problems[0],
        ),
      ).toBe(true);
    const nestedRegistry = {
      nested: checkerFromBundle({
        bundleCid: cid,
        contract,
        port: { execute: () => Promise.resolve({ cid, result: report }) },
      }),
    };
    const nested = await executeCheck({
      registry: nestedRegistry,
      root: { checker: "nested", target: { text: "x" } },
      signal: new AbortController().signal,
    });
    if (!nested.pass && !report.pass)
      expect(nested.problems[0].source).toEqual(report.problems[0].source);
  },
);
it("rejects raw invokeTask contexts and invalid exact references", () => {
  expect(() =>
    checkerFromBundle({
      bundleCid: cid,
      contract,
      // @ts-expect-error Raw Worker capabilities cannot satisfy the execution port.
      port: { invokeTask: vi.fn() },
    }),
  ).toThrow("execution port");
  for (const value of [null, "", "not-a-cid", `${cid}/child`])
    expect(() => exactCid(value)).toThrow();
  for (const value of [
    undefined,
    "",
    "/absolute",
    "a//b",
    "../a",
    "a/./b",
    "a\\b",
    "x:y",
    "a\nb",
  ])
    expect(documentPath(value)).toBe(false);
});
it.each([
  { pass: true, documentation: "references/check.md" },
  null,
  { cid: "invalid", result: {} },
  { result: {} },
])("rejects missing envelopes and legacy/arbitrary JSON %#", async (value) => {
  const registry = {
    child: checkerFromBundle({
      bundleCid: cid,
      contract,
      port: {
        execute: vi.fn().mockResolvedValue(value),
      },
    }),
  };
  await expect(
    executeCheck({
      registry,
      root: { checker: "child", target: { text: "x" } },
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow();
});
it("rejects undeclared child codes instead of absorbing them into parent docs", async () => {
  const report = await childReport(false);
  const registry = {
    child: checkerFromBundle({
      bundleCid: cid,
      contract: createCheckContract(input, Type.Literal("other-code")),
      port: { execute: () => Promise.resolve({ cid, result: report }) },
    }),
  };
  await expect(
    executeCheck({
      registry,
      root: { checker: "child", target: { text: "x" } },
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("undeclared");
});
it("preserves malformed report structure, identity, provenance and graph faults", async () => {
  const valid = await childReport(false);
  const mutations: ((value: Record<string, unknown>) => void)[] = [
    (v) => {
      v.protocol = "other";
    },
    (v) => {
      v.documentation = "../escape";
    },
    (v) => {
      v.root = "absent";
    },
    (v) => {
      v.nodes = [];
    },
    (v) => {
      v.edges = [{}];
    },
    (v) => {
      v.problems = [];
    },
    (v) => {
      v.problems = [null];
    },
    (v) => {
      v.pass = true;
    },
    (v) => {
      v.extra = true;
    },
    (v) => {
      v.nodes = [...valid.nodes, ...valid.nodes];
    },
    (v) => {
      v.nodes = [{ ...valid.nodes[0], key: "false" }];
    },
    (v) => {
      v.nodes = [{ ...valid.nodes[0], pass: true }];
    },
    (v) => {
      if (!valid.pass)
        v.problems = [{ ...valid.problems[0], nodeKey: "absent" }];
    },
    (v) => {
      if (!valid.pass) v.problems = [{ ...valid.problems[0], brief: " " }];
    },
    (v) => {
      if (!valid.pass)
        v.problems = [{ ...valid.problems[0], documentation: "other.md" }];
    },
    (v) => {
      if (!valid.pass)
        v.problems = [
          {
            ...valid.problems[0],
            source: { kind: "local", checker: "other", nodeKey: valid.root },
          },
        ];
    },
    (v) => {
      if (!valid.pass)
        v.problems = [{ ...valid.problems[0], source: { kind: "output" } }];
    },
    (v) => {
      v.edges = [{ from: valid.root, to: valid.root }];
    },
  ];
  for (const mutate of mutations) {
    const value: Record<string, unknown> = { ...valid };
    mutate(value);
    expect(() => validateCheckReport(value)).toThrow();
  }
});
