import { expect, it, vi } from "vitest";
import { Type, type Static } from "@sinclair/typebox";
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
import { ContentRef } from "@silvermoon-work/task-protocol";

vi.mock("@silvermoon-work/task-sdk", () => ({ runTask: vi.fn() }));
const Input = Type.Object({ text: Type.String() });
const Code = Type.Union([Type.Literal("mismatch"), Type.Literal("missing")]);
const contract = createCheckContract(Input, Code);
const cid = "bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const documentation = ContentRef.fromCID(cid);
function context() {
  const resolve = vi
    .fn<TaskContext["resolveContent"]>()
    .mockResolvedValue(documentation.cid);
  const read = vi.fn<TaskContext["readContent"]>().mockResolvedValue({
    kind: "file",
    content: new ReadableStream<Uint8Array>(),
  });
  const value = {
    signal: new AbortController().signal,
    log: vi.fn<TaskContext["log"]>(),
    progress: vi.fn(),
    bundle: cid,
    readContent: read,
    resolveContent: resolve,
    putContent: vi.fn(),
    invokeTask: vi.fn(),
    messages: {},
    futureCapability: true,
  };
  return {
    value: value as unknown as TaskContext,
    read,
    resolve,
    log: value.log,
    put: value.putContent,
    invokeTask: value.invokeTask,
  };
}
const pass = () => Promise.resolve({ pass: true, children: [] } as const);

it("registers a real worker callback with an ordinary root and restricted context", async () => {
  const host = context();
  const check = vi.fn(pass);
  runCheck(contract, {
    root: "ordinary",
    registry: (context: CheckContext) => {
      expect(Object.keys(context).sort()).toEqual([
        "bundle",
        "invokeTask",
        "log",
        "progress",
        "putContent",
        "readContent",
        "resolveContent",
        "signal",
      ]);
      expect("output" in context).toBe(false);
      return { ordinary: defineChecker({ target: Input, check }) };
    },
  });
  const registered = vi.mocked(runTask).mock.calls.at(-1)?.[0];
  expect(registered).toBeDefined();
  expect(await registered?.({ text: "hello" }, host.value)).toEqual({
    pass: true,
    documentation,
  });
  expect(check).toHaveBeenCalledWith(
    { text: "hello" },
    expect.any(AbortSignal),
  );
  expect(host.log).toHaveBeenCalledWith({
    level: "info",
    message: JSON.stringify({
      key: '["ordinary",{"text":"hello"}]',
      item: { checker: "ordinary", target: { text: "hello" } },
      pass: true,
    }),
  });
  expect(host.resolve).toHaveBeenCalledWith(
    cid,
    "resources/references/check.md",
    { signal: host.value.signal },
  );
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
    host.read.mockImplementation((value) =>
      Promise.resolve(
        value.toString() === cid
          ? { kind: "directory", entries: new ReadableStream() }
          : { kind: "file", content: new ReadableStream() },
      ),
    );
    host.resolve.mockImplementation((_cid, path) =>
      Promise.resolve(
        ContentRef.fromCID(
          path === "resources/assets"
            ? cid
            : "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ).cid,
      ),
    );
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
    expect(host.resolve.mock.calls.map((call) => call[1])).toContain(
      "resources/assets",
    );
    if (!result.pass)
      expect(result.problems[0]).toMatchObject({
        code: "missing",
        documentation: ContentRef.fromCID(
          "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
        source: { kind: "local", checker: "text" },
      });
  },
);
it.each([
  "unknown",
  "blank",
  "throw",
  "cancel",
  "docs",
  "assets",
  "logs",
] as const)("keeps %s as an execution failure", async (mode) => {
  const host = context();
  const abort = new AbortController();
  host.value = { ...host.value, signal: abort.signal };
  if (mode === "docs")
    host.resolve.mockRejectedValue(new Error("docs unavailable"));
  if (mode === "logs")
    host.log.mockRejectedValue(new Error("logs unavailable"));
  if (mode === "assets")
    host.resolve
      .mockResolvedValueOnce(documentation.cid)
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
    expect(host.resolve).not.toHaveBeenCalled();
});
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
      await check.putContent(new ReadableStream<Uint8Array>());
      await check.invokeTask({
        key: "child",
        bundle: check.bundle,
        path: "resources/child",
        parameters: input,
        timeoutMs: 1000,
      });
      return { text: defineChecker({ target: Input, check: pass }) };
    },
  })({ text: "x" }, host.value);
  expect(host.log).toHaveBeenCalled();
  expect(host.put).toHaveBeenCalled();
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
    "byte capacity",
  );
  expect(host.resolve).toHaveBeenCalled();
  // @ts-expect-error Runtime schema still checks JavaScript input.
  await expect(callback({ text: 1 }, host.value)).rejects.toThrow("input");
});
it("keeps large successful traversals out of the bounded Task result", async () => {
  const host = context();
  const callback = createCheckCallback(contract, {
    root: "text",
    registry: {
      text: defineChecker({
        target: Input,
        check: async (
          target,
        ): Promise<
          CheckerResult<{
            checker: "text";
            target: Static<typeof Input>;
          }>
        > => {
          await Promise.resolve();
          return {
            pass: true,
            children:
              target.text === "root"
                ? Array.from({ length: 300 }, (_, index) => ({
                    checker: "text",
                    target: { text: `${index}:${"x".repeat(128)}` },
                  }))
                : [],
          };
        },
      }),
    },
  });
  expect(await callback({ text: "root" }, host.value)).toEqual({
    pass: true,
    documentation,
  });
  expect(host.log).toHaveBeenCalledTimes(301);
  const rootLog = host.log.mock.calls[0]?.[0];
  const childLog = host.log.mock.calls[1]?.[0];
  if (!rootLog || !childLog) throw new Error("Expected root and child logs.");
  const rootNode: unknown = JSON.parse(rootLog.message);
  const childNode: unknown = JSON.parse(childLog.message);
  expect(rootNode).not.toHaveProperty("parent");
  expect(childNode).toHaveProperty("parent", '["text",{"text":"root"}]');
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
