// @vitest-environment jsdom
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { frameClient, hostClient } from "../src/browser.js";

const protocol = "ipfsaw-browser/v1";
class Port {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn<(value: unknown) => void>();
  close = vi.fn<() => void>();
  start = vi.fn<() => void>();
  send(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}
function listeners() {
  const callbacks = new Map<string, EventListenerOrEventListenerObject>();
  vi.spyOn(window, "addEventListener").mockImplementation((name, callback) => {
    callbacks.set(name, callback);
  });
  return {
    call(name: string, value: unknown) {
      const callback = callbacks.get(name);
      if (typeof callback !== "function")
        throw new Error("Missing browser event callback.");
      callback(value as Event);
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.replaceChildren();
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
});

describe("private host/opaque-frame communication", () => {
  function host(reload = false) {
    document.body.innerHTML = '<p id="status"></p><main id="renderer"></main>';
    if (!reload) history.replaceState(null, "", "/#CAPABILITY");
    const callbacks = listeners();
    const ports: Port[] = [];
    vi.stubGlobal(
      "MessageChannel",
      class {
        port1 = new Port();
        port2 = new Port();
        constructor() {
          ports.push(this.port1, this.port2);
        }
      },
    );
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const fetch = vi.fn().mockResolvedValue(new Response(stream));
    vi.stubGlobal("fetch", fetch);
    hostClient();
    const send = async (value: unknown) => {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`),
      );
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    };
    const hello = (
      data: unknown = { protocol, type: "hello" },
      origin = "null",
      source?: MessageEventSource | null,
    ) => {
      const frame = document.querySelector<HTMLIFrameElement>(
        "iframe:not([hidden])",
      )!;
      const post = vi
        .spyOn(frame.contentWindow!, "postMessage")
        .mockImplementation(() => {});
      callbacks.call("message", {
        data,
        origin,
        source: source === undefined ? frame.contentWindow : source,
      });
      return post;
    };
    return Promise.resolve({
      send,
      hello,
      ports,
      fetch,
      callbacks,
      close() {
        controller.close();
      },
    });
  }
  const state = (revision: number, cid = "approved-cid") => ({
    type: "document",
    revision,
    cid,
    schema: "urn:fixture:1",
    document: { title: "current" },
    manifest: {
      protocol: "ipfsaw-renderer/v1",
      entry: "renderer.js",
      styles: [],
    },
  });
  it("retains origin-bound capability in this history entry across reload, never renderer messages", async () => {
    const first = await host();
    expect(location.hash).toBe("");
    first.close();
    await Promise.resolve();
    const reloaded = await host(true);
    try {
      expect(reloaded.fetch).toHaveBeenCalledWith(
        "/events",
        expect.objectContaining({
          headers: { Authorization: "Bearer CAPABILITY" },
        }),
      );
      await reloaded.send(state(1));
      const connect = reloaded.hello();
      expect(JSON.stringify(connect.mock.calls)).not.toContain("CAPABILITY");
      expect(
        JSON.stringify(reloaded.ports[0]!.postMessage.mock.calls),
      ).not.toContain("CAPABILITY");
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    } finally {
      reloaded.close();
    }
  });
  it("does not reuse history capability from another origin or invalid state", async () => {
    for (const saved of [
      { protocol, origin: "https://another.test", capability: "FOREIGN" },
      { protocol, origin: location.origin, capability: 123 },
      { protocol: "wrong", origin: location.origin, capability: "FOREIGN" },
    ]) {
      history.replaceState(saved, "", "/");
      const preview = await host(true);
      expect(preview.fetch).toHaveBeenCalledWith(
        "/events",
        expect.objectContaining({ headers: { Authorization: "Bearer " } }),
      );
      preview.close();
      await Promise.resolve();
    }
  });
  it("uses capability only for first-party fetch, authenticates handshake source/origin and ignores stale/wrong replies", async () => {
    const preview = await host();
    try {
      expect(location.hash).toBe("");
      expect(preview.fetch).toHaveBeenCalledWith(
        "/events",
        expect.objectContaining({
          headers: { Authorization: "Bearer CAPABILITY" },
        }),
      );
      await preview.send({ type: "loading", revision: 1 });
      await preview.send(state(1));
      const frame = document.querySelector("iframe")!;
      expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
      preview.hello({ protocol: "wrong", type: "hello" });
      preview.hello({ protocol, type: "hello" }, "https://evil.test");
      preview.hello({ protocol, type: "hello" }, "null", null);
      preview.hello(null);
      expect(preview.ports).toHaveLength(0);
      const post = preview.hello();
      expect(post).toHaveBeenCalledWith(
        { protocol, type: "connect" },
        "*",
        expect.any(Array),
      );
      expect(JSON.stringify(post.mock.calls)).not.toContain("CAPABILITY");
      const port = preview.ports[0]!;
      expect(port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "mount", revision: 1 }),
      );
      port.send(null);
      port.send({ protocol: "wrong", type: "ready", revision: 1 });
      port.send({ protocol, type: "ready", revision: 0 });
      port.send({ protocol, type: "unknown", revision: 1 });
      expect(document.querySelector("main")!.hidden).toBe(true);
      port.send({ protocol, type: "ready", revision: 1 });
      expect(document.querySelector("main")!.hidden).toBe(false);
      await preview.send(state(0));
      expect(document.querySelector("#status")!.textContent).toBe("Revision 1");
      await preview.send({ type: "loading", revision: 2 });
      await preview.send(state(2));
      expect(document.querySelector("iframe")).toBe(frame);
      expect(port.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "update", revision: 2 }),
      );
      port.send({ protocol, type: "ready", revision: 2 });
      await preview.send(state(3, "other-cid"));
      expect(document.querySelector("iframe:not([hidden])")).not.toBe(frame);
      port.send({ protocol, type: "disposed", revision: 3 });
      expect(port.close).toHaveBeenCalled();
      preview.callbacks.call("pagehide", {});
      expect(document.querySelector("iframe")).toBeNull();
    } finally {
      preview.close();
    }
  });
  it("replaces in-flight contexts, clears stale content on errors and reports communication timeout", async () => {
    const preview = await host();
    try {
      await preview.send(state(1));
      preview.hello();
      await preview.send({ type: "loading", revision: 2 });
      expect(document.querySelector("iframe:not([hidden])")).toBeNull();
      await preview.send(state(2));
      preview.hello();
      preview.ports[2]!.send({ protocol, type: "error", revision: 2 });
      expect(document.querySelector("#status")!.textContent).toContain(
        "Renderer failed",
      );
      await preview.send({
        type: "error",
        revision: 3,
        message: "Correct YAML syntax.",
      });
      expect(document.querySelector("#status")!.textContent).toBe(
        "Correct YAML syntax.",
      );
      await preview.send({ type: "error", revision: 4 });
      expect(document.querySelector("#status")!.textContent).toContain(
        "could not be loaded",
      );
      await preview.send({ ...state(5), schema: 3 });
      expect(document.querySelector("#status")!.textContent).toBe(
        "Invalid host update.",
      );
      await preview.send({ revision: "wrong" });
      vi.useFakeTimers();
      const sending = preview.send(state(6));
      await vi.advanceTimersByTimeAsync(0);
      await sending;
      await vi.advanceTimersByTimeAsync(15001);
      expect(document.querySelector("#status")!.textContent).toContain(
        "did not respond",
      );
    } finally {
      preview.close();
    }
  });
  it("reports closed/failed transport rather than leaving current-looking stale output", async () => {
    document.body.innerHTML = '<p id="status"></p><main id="renderer"></main>';
    listeners();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    hostClient();
    await vi.waitFor(() => {
      expect(document.querySelector("#status")!.textContent).toContain(
        "connection closed",
      );
    });
    vi.mocked(fetch).mockRejectedValue(new Error("network"));
    hostClient();
    await vi.waitFor(() => {
      expect(document.querySelector("main")!.hidden).toBe(true);
    });
  });

  function frame() {
    document.body.innerHTML = '<main id="app"></main>';
    const callbacks = listeners();
    const post = vi.spyOn(parent, "postMessage").mockImplementation(() => {});
    const port = new Port();
    // Controlled fixture modules only; production HTTP imports run in the iframe, not Node.
    const origin = pathToFileURL(resolve("test", "fixtures")).href;
    frameClient(origin);
    const connect = (
      data: unknown = { protocol, type: "connect" },
      source: unknown = parent,
      eventOrigin = origin,
      ports: unknown[] = [port],
    ) => {
      callbacks.call("message", { data, source, origin: eventOrigin, ports });
    };
    return { connect, port, post, origin, callbacks };
  }
  const message = (
    revision: number,
    type = "mount",
    extra: Record<string, unknown> = {},
  ) => ({
    protocol,
    type,
    revision,
    cid: "fixture",
    schema: "urn:fixture:1",
    document: { title: "fixture" },
    manifest: { entry: "renderer.js", styles: [] },
    ...extra,
  });
  it("requires a parent/private-port handshake and invokes the browser ABI serially with revision filtering", async () => {
    const preview = frame();
    expect(preview.post).toHaveBeenCalledWith(
      { protocol, type: "hello" },
      preview.origin,
    );
    preview.connect(null);
    preview.connect({ protocol: "wrong", type: "connect" });
    preview.connect(undefined, null);
    preview.connect(undefined, parent, "wrong");
    preview.connect(undefined, parent, preview.origin, []);
    expect(preview.port.start).not.toHaveBeenCalled();
    preview.connect();
    preview.connect();
    expect(preview.port.start).toHaveBeenCalledOnce();
    preview.port.send(null);
    preview.port.send({ protocol: "wrong", revision: 1, type: "mount" });
    preview.port.send({ protocol, revision: "x", type: "mount" });
    preview.port.send(message(0, "unknown"));
    preview.port.send(message(1));
    await vi.waitFor(() => {
      expect(preview.port.postMessage).toHaveBeenCalledWith({
        protocol,
        type: "ready",
        revision: 1,
      });
    });
    expect(document.querySelector("#app")!.textContent).toBe("fixture:1");
    preview.port.send(message(0, "update"));
    preview.port.send(message(2, "update", { document: { title: "new" } }));
    await vi.waitFor(() => {
      expect(document.querySelector("#app")!.textContent).toBe("new:2");
    });
    preview.port.send(message(3, "update", { document: { fail: true } }));
    await vi.waitFor(() => {
      expect(preview.port.postMessage).toHaveBeenCalledWith({
        protocol,
        type: "error",
        revision: 3,
      });
    });
    preview.port.send(message(4, "dispose"));
    await vi.waitFor(() => {
      expect(preview.port.close).toHaveBeenCalled();
    });
    expect(document.querySelector("#app")!.textContent).toBe("");
  });
  it("reports missing/invalid ESM, malformed updates and update-before-mount as renderer errors", async () => {
    const preview = frame();
    preview.connect();
    const cases = [
      message(1, "update"),
      message(2, "mount", { schema: 1 }),
      message(3, "mount", { manifest: null }),
      message(4, "mount", { manifest: { entry: "missing.js", styles: [] } }),
      message(5, "mount", { manifest: { entry: "bad.js", styles: [] } }),
      message(6, "mount", { document: { fail: true } }),
    ];
    for (const value of cases) {
      preview.port.send(value);
      await vi.waitFor(() => {
        expect(preview.port.postMessage).toHaveBeenCalledWith({
          protocol,
          type: "error",
          revision: value.revision,
        });
      });
    }
  });
  it("waits for styles, surfaces missing CSS and drops obsolete queued revisions", async () => {
    const preview = frame();
    preview.connect();
    preview.port.send(
      message(1, "mount", {
        manifest: { entry: "renderer.js", styles: ["style.css"] },
      }),
    );
    await vi.waitFor(() => {
      expect(document.querySelector("link")).not.toBeNull();
    });
    document.querySelector("link")!.dispatchEvent(new Event("error"));
    await vi.waitFor(() => {
      expect(preview.port.postMessage).toHaveBeenCalledWith({
        protocol,
        type: "error",
        revision: 1,
      });
    });
    document.head.replaceChildren();
    preview.port.send(
      message(2, "mount", {
        manifest: { entry: "renderer.js", styles: ["style.css"] },
      }),
    );
    await vi.waitFor(() => {
      expect(document.querySelector("link")).not.toBeNull();
    });
    preview.port.send(message(3, "update"));
    preview.port.send(message(4, "update", { document: { title: "latest" } }));
    document.querySelector("link")!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => {
      expect(preview.port.postMessage).toHaveBeenCalledWith({
        protocol,
        type: "ready",
        revision: 4,
      });
    });
    expect(preview.port.postMessage).not.toHaveBeenCalledWith({
      protocol,
      type: "ready",
      revision: 2,
    });
    expect(preview.port.postMessage).not.toHaveBeenCalledWith({
      protocol,
      type: "ready",
      revision: 3,
    });
  });
  it("reports uncaught asynchronous browser/rendering failures after ready, without exposing error details", async () => {
    const preview = frame();
    preview.callbacks.call("error", {});
    expect(preview.port.postMessage).not.toHaveBeenCalled();
    preview.connect();
    preview.port.send(message(1));
    await vi.waitFor(() => {
      expect(preview.port.postMessage).toHaveBeenCalledWith({
        protocol,
        type: "ready",
        revision: 1,
      });
    });
    preview.callbacks.call("error", { message: "private document data" });
    expect(preview.port.postMessage).toHaveBeenLastCalledWith({
      protocol,
      type: "error",
      revision: 1,
    });
    preview.callbacks.call("unhandledrejection", {
      reason: "private document data",
    });
    expect(JSON.stringify(preview.port.postMessage.mock.calls)).not.toContain(
      "private document data",
    );
  });
});
