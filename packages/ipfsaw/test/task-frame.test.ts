// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentRef, encodeReferences } from "@silvermoon-work/ipfs-payload";
import type { TaskCallback, TaskContext } from "@silvermoon-work/task-sdk";
import { taskFrameClient } from "../src/task-frame.js";
import startCheck from "../src/check-task.js";
import {
  typescriptProjectSpec,
  validateCheckBundleSpec,
} from "@silvermoon-work/check-bundle-viewer";

const cid = "bafkreigh2akiscaildc4n3xx6fjzfqavpxq3vbjrtx6w6xi2y7xyub5b4q";
const protocol = "ipfsaw-task/v1";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function frame(
  callback: TaskCallback | undefined,
  replyError?: string,
  parameters = encodeReferences({ ref: ContentRef.fromCID(cid) }),
) {
  const callbacks = new Map<string, EventListenerOrEventListenerObject>();
  vi.spyOn(window, "addEventListener").mockImplementation((name, callback) => {
    callbacks.set(name, callback);
  });
  vi.spyOn(parent, "postMessage").mockImplementation(() => {});
  const sent: Record<string, unknown>[] = [];
  let directory = false;
  const port = {
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
    start: vi.fn(),
    postMessage(value: Record<string, unknown>) {
      sent.push(value);
      if (value.type !== "request") return;
      let result: unknown = null;
      if (value.operation === "start")
        result = {
          runId: "run",
          scope: "scope",
          startedAt: "now",
          bundle: cid,
        };
      if (value.operation === "resolveContent") result = cid;
      if (value.operation === "readContent") {
        result = directory
          ? {
              kind: "directory",
              entries: [{ name: "note.txt", kind: "file", cid }],
            }
          : { kind: "file", bytes: { base64: btoa("bundled resource") } };
        directory = true;
      }
      queueMicrotask(() =>
        port.onmessage?.({
          data: {
            protocol,
            type: "reply",
            id: value.id,
            ...(replyError === value.operation
              ? { error: { code: "invalid_payload" } }
              : { value: result }),
          },
        } as MessageEvent),
      );
    },
    send(value: Record<string, unknown>) {
      port.onmessage?.({ data: value } as MessageEvent);
    },
  };
  const load = vi.fn().mockResolvedValue(callback ? { default: callback } : {});
  taskFrameClient("https://host.test", load);
  const callEvent = (name: string, value: unknown) => {
    const listener = callbacks.get(name);
    if (typeof listener === "function") listener(value as Event);
  };
  const connect = (
    origin = "https://host.test",
    source: unknown = parent,
    ports: unknown[] = [port],
  ) => {
    callEvent("message", {
      data: { protocol, type: "connect" },
      origin,
      source,
      ports,
    });
  };
  const start = () => {
    port.send({
      protocol,
      type: "start",
      revision: 1,
      cid,
      entry: "main.mjs",
      parameters,
    });
  };
  return { port, sent, load, connect, start, callEvent };
}

describe("explicit browser callback and genuine context", () => {
  it("uses the private port, public payload conversion and real content methods, then leaves DOM alive after returning", async () => {
    let captured: TaskContext | undefined;
    const harness = frame(async (parameters, context) => {
      captured = context;
      expect(parameters).toHaveProperty("ref", expect.any(ContentRef));
      expect(context).not.toHaveProperty("container");
      expect(context).not.toHaveProperty("assetUrl");
      expect(context).not.toHaveProperty("onClose");
      expect(context.bundle).toBe(cid);
      expect(context.signal.aborted).toBe(false);
      const target = await context.resolveContent(
        context.bundle,
        "resources/note.txt",
      );
      const node = await context.readContent(target);
      expect(node.kind).toBe("file");
      if (node.kind === "file")
        expect(await new Response(node.content).text()).toBe(
          "bundled resource",
        );
      const directory = await context.readContent(target, {
        signal: new AbortController().signal,
      });
      if (directory.kind === "directory") {
        const entries = [];
        for await (const entry of directory.entries) entries.push(entry);
        expect(entries[0]?.cid.toString()).toBe(cid);
      } else throw new Error("expected directory");
      const aborted = AbortSignal.abort(new Error("cancelled"));
      await expect(
        context.readContent(target, { signal: aborted }),
      ).rejects.toThrow("cancelled");
      const operations = [
        context.putContent(new ReadableStream()),
        context.progress({ stage: "execution", message: "x" }),
        context.log({ level: "info", message: "x" }),
        context.invokeTask({
          key: "x",
          bundle: cid,
          parameters: {},
          timeoutMs: 1,
        }),
        context.messages[Symbol.asyncIterator]().next(),
      ];
      for (const promise of operations)
        await expect(promise).rejects.toMatchObject({
          code: "unsupported_capability",
        });
      document.body.innerHTML = "<button>App remains interactive</button>";
      return "started";
    });
    harness.connect("https://foreign.test");
    harness.connect("https://host.test", null);
    harness.connect("https://host.test", parent, []);
    expect(harness.port.start).not.toHaveBeenCalled();
    harness.connect();
    harness.connect();
    harness.start();
    harness.start();
    await vi.waitFor(() => {
      expect(harness.sent.some((message) => message.type === "ready")).toBe(
        true,
      );
    });
    expect(harness.load).toHaveBeenCalledTimes(1);
    expect(harness.load).toHaveBeenCalledWith(
      `https://host.test/assets/${cid}/main.mjs`,
    );
    const complete = harness.sent.find(
      (message) => message.operation === "complete",
    );
    expect(complete?.payload).toEqual({ data: "started", cidPaths: [] });
    harness.port.send({ protocol, type: "cancel" });
    expect(captured?.signal.aborted).toBe(false);
    expect(document.querySelector("button")?.textContent).toContain(
      "interactive",
    );
    await expect(captured?.readContent(cid)).rejects.toMatchObject({
      code: "run_finished",
    });
    harness.callEvent("error", {});
    expect(harness.sent.at(-1)?.type).toBe("error");
  });
  it.each(["missing", "throw", "result"] as const)(
    "reports %s startup failure without forwarding secret details",
    async (kind) => {
      const harness = frame(
        kind === "missing"
          ? undefined
          : () => {
              if (kind === "throw") return Promise.reject(new Error("secret"));
              return Promise.resolve(42);
            },
        kind === "result" ? "complete" : undefined,
      );
      harness.connect();
      harness.start();
      await vi.waitFor(() => {
        expect(harness.sent.some((message) => message.type === "error")).toBe(
          true,
        );
      });
      expect(harness.sent.some((message) => message.type === "ready")).toBe(
        false,
      );
      expect(JSON.stringify(harness.sent)).not.toContain("secret");
      harness.port.send({ protocol: "wrong", type: "cancel" });
      harness.port.send({ protocol, type: "reply", id: 999, value: null });
    },
  );
  it("aborts pending startup work and ignores a late ordinary result", async () => {
    let finish!: () => void;
    let signal: AbortSignal | undefined;
    const harness = frame(async (_parameters, context) => {
      signal = context.signal;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return "late";
    });
    harness.connect();
    harness.start();
    await vi.waitFor(() => {
      expect(finish).toBeTypeOf("function");
    });
    harness.port.send({ protocol, type: "cancel" });
    expect(signal?.aborted).toBe(true);
    finish();
    await vi.waitFor(() => {
      expect(harness.sent.at(-1)?.type).toBe("error");
    });
    expect(
      harness.sent.some((message) => message.operation === "complete"),
    ).toBe(false);
  });
  it("forwards a per-operation AbortSignal cancellation without aborting startup", async () => {
    const h = frame(async (_parameters, context) => {
      const cancellation = new AbortController();
      const reading = context.readContent(cid, { signal: cancellation.signal });
      cancellation.abort("private cancellation reason");
      await expect(reading).rejects.toMatchObject({ name: "AbortError" });
      expect(context.signal.aborted).toBe(false);
      return "still started";
    });
    h.connect();
    h.start();
    await vi.waitFor(() => {
      expect(h.sent.some((message) => message.type === "ready")).toBe(true);
    });
    const original = h.sent.find(
      (message) => message.operation === "readContent",
    );
    const cancellation = h.sent.find(
      (message) => message.operation === "cancelContent",
    );
    expect(cancellation?.requestId).toBe(original?.id);
    expect(JSON.stringify(h.sent)).not.toContain("private cancellation reason");
  });
  it.each(["loaded", "failed", "cancelled"] as const)(
    "runs the real Check author with stylesheet %s and no legacy renderer API",
    async (outcome) => {
      vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
        setTimeout(() => {
          callback(0);
        }, 0),
      );
      vi.stubGlobal("cancelAnimationFrame", clearTimeout);
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: vi.fn(),
      });
      const h = frame(
        async (parameters, context) => {
          const parsed = validateCheckBundleSpec(parameters);
          if (!parsed.valid) throw new Error("invalid test document");
          return startCheck(parsed.spec, context);
        },
        undefined,
        encodeReferences(typescriptProjectSpec),
      );
      h.connect();
      h.start();
      await vi.waitFor(() => {
        expect(document.head.querySelector("link")).not.toBeNull();
      });
      const style = document.head.querySelector("link")!;
      if (outcome === "cancelled") h.port.send({ protocol, type: "cancel" });
      else
        style.dispatchEvent(new Event(outcome === "loaded" ? "load" : "error"));
      await vi.waitFor(() => {
        expect(
          h.sent.some(
            (message) =>
              message.type === (outcome === "loaded" ? "ready" : "error"),
          ),
        ).toBe(true);
      });
      if (outcome === "loaded") {
        expect(document.querySelector(".cbv")).not.toBeNull();
        expect(
          h.sent.find((message) => message.operation === "complete")?.payload,
        ).toEqual({ data: { started: true }, cidPaths: [] });
      } else expect(style.isConnected).toBe(false);
      document.head.replaceChildren();
    },
  );
  it("rejects a shape-valid but cyclic Check graph before mounting UI", async () => {
    const cyclic = structuredClone(typescriptProjectSpec);
    cyclic.checkers[cyclic.root]!.children.push({
      checker: cyclic.root,
      when: "always",
      parameter: "same",
    });
    const h = frame((_parameters, context) => startCheck(cyclic, context));
    h.connect();
    h.start();
    await vi.waitFor(() => {
      expect(h.sent.some((message) => message.type === "error")).toBe(true);
    });
    expect(document.querySelector("#check-definition")).toBeNull();
  });
});
