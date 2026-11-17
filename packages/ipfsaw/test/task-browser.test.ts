// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { taskHostClient } from "../src/task-browser.js";

const protocol = "ipfsaw-task/v1";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
});
class Port {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  close = vi.fn();
  postMessage = vi.fn<(value: unknown) => void>();
  send(value: unknown) {
    this.onmessage?.({ data: value } as MessageEvent);
  }
}
function host(saved = false) {
  document.body.innerHTML =
    '<p id="status"></p><main id="renderer" hidden></main><button id="cancel"></button><button id="close"></button>';
  if (!saved) history.replaceState(null, "", "/#PRIVATE_CAPABILITY");
  const listeners = new Map<string, EventListenerOrEventListenerObject>();
  vi.spyOn(window, "addEventListener").mockImplementation((name, callback) => {
    listeners.set(name, callback);
  });
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
    start(c) {
      controller = c;
    },
  });
  let cancelled = false;
  let requestError: "business" | "network" | undefined;
  let pending = false;
  const held: ((error: Error) => void)[] = [];
  const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url, init) => {
      if (url === "/events") return new Response(stream);
      if (pending)
        return new Promise((_resolve, reject) => {
          held.push(reject);
        });
      if (requestError === "network") throw new Error("SERVER_SECRET");
      const body = JSON.parse(init!.body as string) as { operation: string };
      return new Response(
        JSON.stringify(
          requestError
            ? {
                ok: false,
                error: {
                  code: "unsupported_capability",
                  message: "SERVER_SECRET",
                },
              }
            : {
                ok: true,
                data:
                  body.operation === "cancel" ? cancelled : { result: true },
              },
        ),
      );
    },
  );
  vi.stubGlobal("fetch", fetch);
  taskHostClient();
  const event = (name: string, value: unknown) => {
    const callback = listeners.get(name);
    if (typeof callback === "function") callback(value as Event);
  };
  const send = async (value: Record<string, unknown>) => {
    controller.enqueue(
      new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const hello = (
    origin = "null",
    source?: MessageEventSource | null,
    data: unknown = { protocol, type: "hello" },
  ) => {
    const iframe = document.querySelector("iframe")!;
    const post = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => {});
    event("message", {
      origin,
      source: source === undefined ? iframe.contentWindow : source,
      data,
    });
    return post;
  };
  return Promise.resolve({
    send,
    hello,
    ports,
    fetch,
    event,
    diagnostic,
    cancel: (value: boolean) => {
      cancelled = value;
    },
    error: (kind: "business" | "network" = "business") => {
      requestError = kind;
    },
    block: () => {
      pending = true;
    },
    rejectPending: () => {
      for (const reject of held.splice(0)) reject(new Error("SERVER_SECRET"));
    },
    end: () => {
      controller.close();
    },
  });
}
const task = (revision = 1) => ({
  type: "task",
  revision,
  cid: "approved",
  entry: "main.mjs",
  parameters: { data: { private: "DOCUMENT_SENTINEL" }, cidPaths: [] },
});
const status = () => document.querySelector("#status")!.textContent;

describe("browser Task session ownership", () => {
  it("shows a real iframe viewport before startup, authenticates the port and distinguishes cancel from close", async () => {
    const h = await host();
    try {
      expect(location.hash).toBe("");
      await h.send({ type: "loading", revision: 1 });
      expect(status()).toContain("Loading");
      await h.send(task());
      const iframe = document.querySelector("iframe")!;
      await h.send(task());
      expect(document.querySelector("iframe")).toBe(iframe);
      expect(document.querySelector<HTMLElement>("#renderer")!.hidden).toBe(
        false,
      );
      expect(iframe.hidden).toBe(false);
      expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
      expect(iframe.src).not.toContain("DOCUMENT_SENTINEL");
      expect(h.hello("https://evil.test")).not.toHaveBeenCalled();
      expect(h.hello("null", null)).not.toHaveBeenCalled();
      expect(
        h.hello("null", undefined, { protocol: "wrong", type: "hello" }),
      ).not.toHaveBeenCalled();
      const handshake = h.hello();
      expect(handshake).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(handshake.mock.calls)).not.toContain(
        "PRIVATE_CAPABILITY",
      );
      const port = h.ports[0]!;
      expect(port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "start", revision: 1 }),
      );
      port.send({
        protocol,
        type: "request",
        operation: "start",
        revision: 1,
        id: 1,
      });
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: "reply", id: 1 }),
        );
      });
      port.send({ protocol, type: "ready", revision: 1 });
      expect(status()).toBe("Started revision 1");
      document.querySelector<HTMLButtonElement>("#cancel")!.click();
      await vi.waitFor(() => {
        expect(
          h.fetch.mock.calls.some(
            ([, init]) =>
              typeof init?.body === "string" && init.body.includes('"cancel"'),
          ),
        ).toBe(true);
      });
      expect(document.querySelector("iframe")).toBe(iframe);
      document.querySelector<HTMLButtonElement>("#close")!.click();
      expect(document.querySelector("iframe")).toBeNull();
      await vi.waitFor(() => {
        expect(status()).toContain("App closed");
      });
      h.event("pagehide", {});
    } finally {
      h.end();
    }
  });
  it("replaces every changed revision and rejects obsolete completions, current errors and invalid updates", async () => {
    const h = await host();
    try {
      await h.send(task());
      h.hello();
      const old = h.ports[0]!;
      await h.send({ type: "loading", revision: 2 });
      expect(document.querySelector("iframe")).toBeNull();
      old.send({ protocol, type: "ready", revision: 1 });
      expect(status()).toContain("Loading");
      await h.send(task(2));
      h.hello();
      const current = h.ports[2]!;
      current.send(null);
      current.send({ protocol: "wrong", type: "ready", revision: 2 });
      current.send({ protocol, type: "ready", revision: 1 });
      h.error();
      current.send({
        protocol,
        type: "request",
        operation: "putContent",
        revision: 2,
        id: 2,
      });
      await vi.waitFor(() => {
        expect(current.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 2,
            error: expect.objectContaining({
              code: "unsupported_capability",
            }) as unknown,
          }),
        );
      });
      current.send({ protocol, type: "ready", revision: 2 });
      current.send({ protocol, type: "error", revision: 2 });
      expect(status()).toContain("after startup");
      await h.send({ type: "task", revision: 1 });
      expect(status()).toContain("after startup");
      await h.send({ type: "error", revision: 3, message: "Correct document" });
      expect(status()).toBe("Correct document");
      await h.send({ type: "error", revision: 4 });
      expect(status()).toBe("Invalid document.");
      await h.send({ type: "task", revision: 5, entry: "worker.cjs" });
      expect(status()).toBe("Invalid host update.");
      await h.send(task(6));
      h.hello();
      h.ports[4]!.send({ protocol, type: "error", revision: 6 });
      expect(status()).toContain("startup failed");
    } finally {
      h.end();
    }
  });
  it("cancels pending startup without waiting for completion and bounds in-flight requests", async () => {
    const h = await host();
    try {
      await h.send(task());
      h.hello();
      h.cancel(true);
      document.querySelector<HTMLButtonElement>("#cancel")!.click();
      await vi.waitFor(() => {
        expect(status()).toBe("Startup cancelled.");
      });
      expect(document.querySelector("iframe")).toBeNull();
      await h.send(task(2));
      h.hello();
      h.block();
      const port = h.ports[2]!;
      for (let id = 0; id < 9; id++)
        port.send({
          protocol,
          type: "request",
          operation: "readContent",
          revision: 2,
          id,
        });
      expect(status()).toContain("capacity");
    } finally {
      h.end();
    }
  });
  it("retains only same-origin history capability and surfaces transport closure", async () => {
    history.replaceState(
      { protocol, origin: location.origin, capability: "HISTORY_CAP" },
      "",
      "/",
    );
    const h = await host(true);
    expect(h.fetch).toHaveBeenCalledWith(
      "/events",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer HISTORY_CAP",
        }) as unknown,
      }),
    );
    h.end();
    await vi.waitFor(() => {
      expect(status()).toContain("connection closed");
    });
  });
  it("reports a rejected cancel without closing an already-started app or claiming cancellation", async () => {
    const h = await host();
    try {
      await h.send(task());
      h.hello();
      h.ports[0]!.send({ protocol, type: "ready", revision: 1 });
      const iframe = document.querySelector("iframe");
      h.error();
      document.querySelector<HTMLButtonElement>("#cancel")!.click();
      await vi.waitFor(() => {
        expect(status()).toContain("cancellation could not be confirmed");
      });
      expect(status()).not.toContain("Startup cancelled");
      expect(document.querySelector("#status")!.getAttribute("role")).toBe(
        "alert",
      );
      expect(document.querySelector("iframe")).toBe(iframe);
      expect(h.diagnostic).toHaveBeenCalled();
      expect(JSON.stringify(h.diagnostic.mock.calls)).not.toMatch(
        /SERVER_SECRET|PRIVATE_CAPABILITY/,
      );
    } finally {
      h.end();
    }
  });
  it("removes the app locally but never claims a rejected host close was confirmed", async () => {
    const h = await host();
    try {
      await h.send(task());
      h.hello();
      h.error("network");
      document.querySelector<HTMLButtonElement>("#close")!.click();
      expect(document.querySelector("iframe")).toBeNull();
      expect(status()).not.toContain("App closed");
      await vi.waitFor(() => {
        expect(status()).toContain("host close could not be confirmed");
      });
      expect(status()).toContain("removed locally");
      expect(document.querySelector("#status")!.getAttribute("role")).toBe(
        "alert",
      );
      expect(h.diagnostic).toHaveBeenCalled();
      expect(JSON.stringify(h.diagnostic.mock.calls)).not.toMatch(
        /SERVER_SECRET|PRIVATE_CAPABILITY/,
      );
    } finally {
      h.end();
    }
  });
  it.each([false, true])(
    "exposes background cleanup uncertainty without losing the primary error or overwriting a newer app: newer=%s",
    async (newer) => {
      const h = await host();
      try {
        await h.send(task());
        h.hello();
        h.block();
        h.ports[0]!.send({ protocol, type: "error", revision: 1 });
        const primary = status();
        expect(primary).toContain("Browser startup failed");
        if (newer) {
          await h.send(task(2));
          h.hello();
        }
        const iframe = document.querySelector("iframe");
        h.rejectPending();
        await vi.waitFor(() => {
          expect(h.diagnostic).toHaveBeenCalled();
        });
        if (newer) {
          expect(status()).toContain("Launching revision 2");
          expect(document.querySelector("iframe")).toBe(iframe);
        } else {
          expect(status()).toContain(primary);
          expect(status()).toContain("Host cleanup could not be confirmed");
          expect(document.querySelector("#status")!.getAttribute("role")).toBe(
            "alert",
          );
        }
        expect(JSON.stringify(h.diagnostic.mock.calls)).not.toMatch(
          /SERVER_SECRET|PRIVATE_CAPABILITY/,
        );
      } finally {
        h.end();
      }
    },
  );
  it.each(["cancelled", "completed", "connection"] as const)(
    "handles startup deadline racing with %s without closing a completed app",
    async (outcome) => {
      const h = await host();
      vi.useFakeTimers();
      try {
        const sending = h.send(task());
        await vi.advanceTimersByTimeAsync(0);
        await sending;
        h.hello();
        const iframe = document.querySelector("iframe");
        if (outcome === "cancelled") h.cancel(true);
        if (outcome === "connection") h.error();
        await vi.advanceTimersByTimeAsync(15000);
        if (outcome === "completed") {
          expect(document.querySelector("iframe")).toBe(iframe);
          h.ports[0]!.send({ protocol, type: "ready", revision: 1 });
          expect(status()).toBe("Started revision 1");
        } else {
          expect(document.querySelector("iframe")).toBeNull();
          expect(status()).toContain(
            outcome === "cancelled" ? "timed out" : "connection failed",
          );
        }
      } finally {
        h.end();
      }
    },
  );
});
