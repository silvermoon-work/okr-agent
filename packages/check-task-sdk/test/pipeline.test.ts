import { expect, expectTypeOf, it, vi } from "vitest";
import { Type } from "@sinclair/typebox";
import type { TaskContext } from "@silvermoon-work/task-sdk";
import {
  ContentRef,
  encodeChannel,
  compileJsonSchema,
} from "@silvermoon-work/task-protocol";
import {
  createCheckCallback,
  createCheckContract,
  defineCheckpoint,
  executeCheck,
  failed,
  runCheck,
  type CheckpointContext,
  type CheckpointResult,
  type CheckpointDefinition,
} from "../src/index.js";
import { contractCheckpointIds, ruleCodes } from "../src/contracts.js";
import { runTask } from "@silvermoon-work/task-sdk";

vi.mock("@silvermoon-work/task-sdk", () => ({ runTask: vi.fn() }));
const target = Type.Object({ text: Type.String() });
const rule = { code: "mismatch", description: "Text must match." } as const;
const signal = () => new AbortController().signal;
const good = (id = "first") =>
  defineCheckpoint({
    id,
    target,
    description: "Read input.",
    rules: [rule],
    check: () => Promise.resolve({ pass: true, output: undefined }),
  });
const execute = (checkpoints: readonly CheckpointDefinition[]) =>
  executeCheck({ checkpoints, target: { text: "hello" }, signal: signal() });

it("orders checkpoints and preserves arbitrary output and target identities without logging them", async () => {
  const business = { text: "hello", resource: new Map() };
  const output = { resource: business.resource, circular: {} as object };
  output.circular = output;
  const first = defineCheckpoint({
    id: "first",
    target,
    description: "Read resource.",
    rules: [rule],
    check: (input) => {
      expect(input).toBe(business);
      return Promise.resolve({ pass: true, output });
    },
  });
  const second = defineCheckpoint({
    id: "second",
    target,
    description: "Use resource.",
    rules: [rule],
    check: (_input, context) => {
      const observed = context.outputOf(first);
      expectTypeOf(observed).toEqualTypeOf<Readonly<typeof output>>();
      expect(observed).toBe(output);
      expect(observed.resource).toBe(business.resource);
      expect(Object.isFrozen(output)).toBe(false);
      return Promise.resolve(failed([]));
    },
  });
  const log = vi.fn();
  expect(
    await executeCheck({
      checkpoints: [first, second],
      target: business,
      signal: signal(),
      log,
    }),
  ).toEqual({
    pass: true,
    documentation: "references/check.md",
    references: [],
  });
  expect(log.mock.calls).toEqual([
    [{ checkpoint: "first", pass: true }],
    [{ checkpoint: "second", pass: true }],
  ]);
});

it("stops at the first failing checkpoint and retains duplicate rule failures with one reference", async () => {
  const last = vi.fn(() =>
    Promise.resolve({ pass: true, output: undefined } as const),
  );
  const failure = defineCheckpoint({
    id: "versions",
    target,
    description: "Check versions.",
    rules: [rule],
    check: () =>
      Promise.resolve(
        failed([
          { code: "mismatch", brief: "Node version too low." },
          { code: "mismatch", brief: "pnpm version too low." },
        ]),
      ),
  });
  const report = await execute([
    good(),
    failure,
    defineCheckpoint({
      id: "last",
      target,
      description: "Last.",
      rules: [rule],
      check: last,
    }),
  ]);
  expect(report).toEqual({
    pass: false,
    documentation: "references/check.md",
    references: [
      {
        checkpoint: "versions",
        documentation: "references/checkpoints/versions.md",
      },
    ],
    problems: [
      {
        checkpoint: "versions",
        code: "mismatch",
        brief: "Node version too low.",
      },
      {
        checkpoint: "versions",
        code: "mismatch",
        brief: "pnpm version too low.",
      },
    ],
  });
  expect(last).not.toHaveBeenCalled();
});

it("rejects foreign, future, current and previous-run output access", async () => {
  const foreign = good("foreign");
  const future = good("future");
  let retained: CheckpointContext | undefined;
  let runs = 0;
  const current = defineCheckpoint({
    id: "current",
    target,
    description: "Output boundary.",
    rules: [rule],
    check: (
      _input,
      context,
    ): Promise<CheckpointResult<undefined, "mismatch">> => {
      expect(() => {
        context.outputOf(current);
      }).toThrow("not available");
      expect(() => {
        context.outputOf(future);
      }).toThrow("not available");
      expect(() => {
        context.outputOf(foreign);
      }).toThrow("not available");
      if (runs++ === 0) retained = context;
      else
        expect(() => {
          context.outputOf(future);
        }).toThrow("not available");
      return Promise.resolve(failed([]));
    },
  });
  await execute([current, future]);
  expect(() => {
    retained?.outputOf(future);
  }).toThrow("not available");
  await execute([current, future]);
});

it.each(["before", "check", "log"] as const)(
  "propagates cancellation %s without running later steps",
  async (when) => {
    const abort = new AbortController();
    const reason = new Error("cancelled");
    const next = vi.fn(() => Promise.resolve(failed([])));
    if (when === "before") abort.abort(reason);
    const first = defineCheckpoint({
      id: "first",
      target,
      description: "Abort.",
      rules: [rule],
      check: async () => {
        await Promise.resolve();
        if (when === "check") abort.abort(reason);
        return failed([]);
      },
    });
    await expect(
      executeCheck({
        checkpoints: [
          first,
          defineCheckpoint({
            id: "next",
            target,
            description: "Next.",
            rules: [rule],
            check: next,
          }),
        ],
        target: { text: "" },
        signal: abort.signal,
        log: () => {
          abort.abort(reason);
        },
      }),
    ).rejects.toBe(reason);
    expect(next).not.toHaveBeenCalled();
  },
);

it.each([
  null,
  {},
  { pass: true },
  { pass: true, output: {}, children: [] },
  { pass: false, problems: [] },
  { pass: false, problems: [{ code: "foreign", brief: "No." }] },
  { pass: false, problems: [{ code: "mismatch", brief: " " }] },
  {
    pass: false,
    problems: [{ code: "mismatch", brief: "No.", documentation: "leak" }],
  },
])("rejects malformed or undeclared rule results: %j", async (value) => {
  const invalid = defineCheckpoint({
    id: "invalid",
    target,
    description: "Invalid.",
    rules: [rule],
    check: () =>
      Promise.resolve(value as CheckpointResult<undefined, "mismatch">),
  });
  await expect(execute([invalid])).rejects.toThrow();
});

it("rejects invalid definitions, duplicate IDs and invalid targets, and propagates faults", async () => {
  for (const changed of [
    { id: "../bad" },
    { description: " " },
    { rules: [] },
    { rules: [rule, rule] },
    { rules: [{ ...rule, description: "" }] },
    { rules: [{ ...rule, code: "CON" }] },
  ])
    expect(() =>
      defineCheckpoint({
        id: "valid",
        target,
        description: "Valid.",
        rules: [rule],
        check: () => Promise.resolve(failed([])),
        ...changed,
      } as Parameters<typeof defineCheckpoint>[0]),
    ).toThrow();
  await expect(execute([good(), good()])).rejects.toThrow("duplicate");
  await expect(execute([{} as ReturnType<typeof good>])).rejects.toThrow(
    "Invalid",
  );
  await expect(
    executeCheck({ checkpoints: [good()], target: {}, signal: signal() }),
  ).rejects.toThrow("target schema");
  const fault = new Error("disk");
  await expect(
    execute([
      defineCheckpoint({
        id: "fault",
        target,
        description: "Fault.",
        rules: [rule],
        check: () => {
          throw fault;
        },
      }),
    ]),
  ).rejects.toBe(fault);
  const sync = defineCheckpoint({
    id: "sync",
    target,
    description: "Sync.",
    rules: [rule],
    check: (() => failed([])) as unknown as () => Promise<
      CheckpointResult<undefined, "mismatch">
    >,
  });
  await expect(execute([sync])).rejects.toThrow("Promise");
  expect(good().accepts({ text: "yes" })).toBe(true);
});

const cid = "bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
function host() {
  const abort = new AbortController();
  const resolve = vi.fn().mockResolvedValue(ContentRef.fromCID(cid).cid);
  const read = vi
    .fn()
    .mockResolvedValue({ kind: "file", content: new ReadableStream() });
  const log = vi.fn();
  return {
    abort,
    resolve,
    read,
    log,
    context: {
      signal: abort.signal,
      bundle: cid,
      resolveContent: resolve,
      readContent: read,
      log,
      progress: vi.fn(),
      putContent: vi.fn(),
      invokeTask: vi.fn(),
    } as unknown as TaskContext,
  };
}
const contract = createCheckContract(target, Type.Literal("mismatch"), [
  "first",
  "second",
]);

it.each([false, true])(
  "maps task/checkpoint documents to exact ContentRef cidPaths, failure=%s",
  async (failure) => {
    const context = host();
    const callback = createCheckCallback(contract, {
      checkpoints: (capabilities, input) => {
        expect(input).toEqual({ text: "hello" });
        expect(Object.keys(capabilities).sort()).toEqual([
          "bundle",
          "invokeTask",
          "log",
          "progress",
          "putContent",
          "readContent",
          "resolveContent",
          "signal",
        ]);
        return [
          defineCheckpoint({
            id: "first",
            target,
            description: "Check.",
            rules: [rule],
            check: () =>
              Promise.resolve(
                failure
                  ? failed([{ code: "mismatch", brief: "Mismatch." }])
                  : failed([]),
              ),
          }),
        ];
      },
    });
    const result = await callback({ text: "hello" }, context.context);
    expect(result.pass).toBe(!failure);
    expect(
      context.resolve.mock.calls.map((call) => call[1] as unknown),
    ).toEqual([
      "resources/references/check.md",
      ...(failure ? ["resources/references/checkpoints/first.md"] : []),
    ]);
    const payload = encodeChannel(
      compileJsonSchema(JSON.parse(JSON.stringify(contract.result)) as unknown)
        .schema,
      result,
    );
    expect(payload.cidPaths).toEqual(
      failure
        ? ['$["documentation"]', '$["references"][*]["documentation"]']
        : ['$["documentation"]'],
    );
    expect(result.references).toHaveLength(failure ? 1 : 0);
    runCheck(contract, { checkpoints: [good()] });
    expect(runTask).toHaveBeenCalled();
  },
);

it("checks contract membership before execution, target schemas and output resource kinds", async () => {
  expect(() =>
    createCheckCallback(
      contract,
      { checkpoints: [] },
      { assets: "yes" as unknown as boolean },
    ),
  ).toThrow("boolean");
  await expect(
    createCheckCallback(contract, { checkpoints: [good("foreign")] })(
      { text: "" },
      host().context,
    ),
  ).rejects.toThrow("Undeclared");
  const otherRule = defineCheckpoint({
    id: "first",
    target,
    description: "Foreign.",
    rules: [{ code: "foreign", description: "No." }],
    check: () => Promise.resolve(failed([])),
  });
  await expect(
    createCheckCallback(contract, { checkpoints: [otherRule] })(
      { text: "" },
      host().context,
    ),
  ).rejects.toThrow("Undeclared");
  await expect(
    createCheckCallback(contract, { checkpoints: [] })(
      { text: 1 } as unknown as { text: string },
      host().context,
    ),
  ).rejects.toThrow("input");
  const wrong = host();
  wrong.read.mockResolvedValue({ kind: "directory" });
  await expect(
    createCheckCallback(contract, { checkpoints: [] })(
      { text: "" },
      wrong.context,
    ),
  ).rejects.toThrow("not a file");
  const assets = host();
  await expect(
    createCheckCallback(
      contract,
      { checkpoints: [] },
      { assets: true },
    )({ text: "" }, assets.context),
  ).rejects.toThrow("not a directory");
  assets.read
    .mockResolvedValueOnce({ kind: "file" })
    .mockResolvedValueOnce({ kind: "directory" });
  const result = await createCheckCallback(
    contract,
    { checkpoints: [] },
    { assets: true },
  )({ text: "" }, assets.context);
  expect(result.assets).toEqual(ContentRef.fromCID(cid));
  const cancelled = host();
  await expect(
    createCheckCallback(contract, {
      checkpoints: () => {
        cancelled.abort.abort();
        return Promise.resolve([]);
      },
    })({ text: "" }, cancelled.context),
  ).rejects.toThrow();
});

it("rejects invalid or duplicate contract IDs/codes and exposes only new shared schemas", () => {
  for (const ids of [["first", "first"], ["../bad"], ["nul"], ["Bad"]])
    expect(() =>
      createCheckContract(target, Type.Literal("mismatch"), ids),
    ).toThrow();
  for (const schema of [
    Type.String(),
    Type.Literal("Bad"),
    Type.Literal("con"),
    Type.Union([Type.Literal("same"), Type.Literal("same")]),
  ])
    expect(() => ruleCodes(schema)).toThrow();
  expect(() => contractCheckpointIds(Type.String())).toThrow();
  expect(contractCheckpointIds(Type.Never())).toEqual([]);
  expect(
    contractCheckpointIds(
      Type.Union([Type.Literal("first"), Type.Literal("second")]),
    ),
  ).toEqual(["first", "second"]);
  expect(Object.keys(contract.schemas).sort()).toEqual([
    "check-checkpoint-id",
    "check-rule-code",
  ]);
});
