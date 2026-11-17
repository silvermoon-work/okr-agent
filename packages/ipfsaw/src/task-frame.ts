import { decodePayload, encodeReferences } from "@silvermoon-work/ipfs-payload";
import { CID } from "multiformats/cid";
import type { TaskCallback, TaskContext } from "@silvermoon-work/task-sdk";

type ModuleLoader = (url: string) => Promise<{ default?: TaskCallback }>;

/** Runs in the app's own browser realm. No Node SDK or DOM fields in TaskContext. */
export function taskFrameClient(
  hostOrigin: string,
  load: ModuleLoader = (url) =>
    import(/* @vite-ignore */ url) as Promise<{ default?: TaskCallback }>,
): void {
  const protocol = "ipfsaw-task/v1";
  let connected = false;
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const input = event.data as Record<string, unknown> | null;
    if (
      connected ||
      event.source !== parent ||
      event.origin !== hostOrigin ||
      input?.protocol !== protocol ||
      input.type !== "connect" ||
      !event.ports[0]
    )
      return;
    connected = true;
    const port = event.ports[0];
    let revision = 0;
    let invoked = false;
    let finished = false;
    const controller = new AbortController();
    const pending = new Map<
      number,
      { resolve(value: unknown): void; reject(error: Error): void }
    >();
    let sequence = 0;
    const abortReason = (signal?: AbortSignal): Error => {
      const reason: unknown = signal?.reason ?? controller.signal.reason;
      return reason instanceof Error
        ? reason
        : new DOMException("Startup cancelled.", "AbortError");
    };
    const request = (
      operation: string,
      value: Record<string, unknown> = {},
      signal?: AbortSignal,
    ): Promise<unknown> => {
      if (finished && operation !== "complete")
        return Promise.reject(
          Object.assign(new Error("Startup finished."), {
            code: "run_finished",
          }),
        );
      if (signal?.aborted || controller.signal.aborted)
        return Promise.reject(abortReason(signal));
      if (pending.size >= 8)
        return Promise.reject(new Error("Content capacity exceeded."));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const abort = () => {
          pending.delete(id);
          clean();
          if (signal?.aborted)
            port.postMessage({
              protocol,
              type: "request",
              operation: "cancelContent",
              id: ++sequence,
              requestId: id,
              revision,
            });
          reject(abortReason(signal));
        };
        const clean = () => {
          signal?.removeEventListener("abort", abort);
          controller.signal.removeEventListener("abort", abort);
        };
        signal?.addEventListener("abort", abort, { once: true });
        controller.signal.addEventListener("abort", abort, { once: true });
        pending.set(id, {
          resolve(result) {
            clean();
            resolve(result);
          },
          reject(error) {
            clean();
            reject(error);
          },
        });
        port.postMessage({
          protocol,
          type: "request",
          operation,
          id,
          revision,
          ...value,
        });
      });
    };
    const report = () => {
      port.postMessage({ protocol, type: "error", revision });
    };
    window.addEventListener("error", report);
    window.addEventListener("unhandledrejection", report);
    port.onmessage = (reply: MessageEvent<unknown>) => {
      const message = reply.data as Record<string, unknown> | null;
      if (!message || message.protocol !== protocol) return;
      if (message.type === "reply" && typeof message.id === "number") {
        const call = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          const error = message.error as { code?: string };
          call?.reject(
            Object.assign(new Error("Browser Task capability failed."), {
              code: error.code,
            }),
          );
        } else call?.resolve(message.value);
        return;
      }
      if (message.type === "cancel" && !finished) {
        controller.abort();
        return;
      }
      if (message.type !== "start" || invoked) return;
      invoked = true;
      revision = message.revision as number;
      void (async () => {
        const metadata = (await request("start")) as {
          runId: string;
          scope: string;
          startedAt: string;
          bundle: string;
        };
        const unsupported = (): Promise<never> =>
          Promise.reject(
            Object.assign(new Error("Unsupported browser Task capability."), {
              code: "unsupported_capability",
            }),
          );
        const context: TaskContext = {
          ...metadata,
          signal: controller.signal,
          messages: { [Symbol.asyncIterator]: () => ({ next: unsupported }) },
          async readContent(cid, options) {
            const node = (await request(
              "readContent",
              { cid: cid.toString() },
              options?.signal,
            )) as {
              kind: "file" | "directory";
              bytes: { base64: string };
              entries: {
                name: string;
                kind: "file" | "directory";
                cid: string;
              }[];
            };
            if (node.kind === "file") {
              const bytes = Uint8Array.from(atob(node.bytes.base64), (char) =>
                char.charCodeAt(0),
              );
              return {
                kind: "file",
                content: new ReadableStream({
                  start(c) {
                    c.enqueue(bytes);
                    c.close();
                  },
                }),
              };
            }
            return {
              kind: "directory",
              entries: {
                [Symbol.asyncIterator]() {
                  const iterator = node.entries
                    .map((entry) => ({ ...entry, cid: CID.parse(entry.cid) }))
                    .values();
                  return { next: () => Promise.resolve(iterator.next()) };
                },
              },
            };
          },
          async resolveContent(cid, path, options) {
            return CID.parse(
              (await request(
                "resolveContent",
                { cid: cid.toString(), path },
                options?.signal,
              )) as string,
            );
          },
          putContent: unsupported,
          progress: unsupported,
          log: unsupported,
          invokeTask: unsupported,
        };
        const url = `${hostOrigin}/assets/${encodeURIComponent(message.cid as string)}/${message.entry as string}`;
        const module = await load(url);
        if (typeof module.default !== "function")
          throw new Error(
            "Browser Task must export a default startup callback.",
          );
        controller.signal.throwIfAborted();
        const parameters = decodePayload(message.parameters, undefined, {
          limits: { maxBytes: 1024 * 1024 },
        });
        const result = await module.default(
          parameters as Parameters<TaskCallback>[0],
          context,
        );
        controller.signal.throwIfAborted();
        // The first-party host validates the full result schema before acknowledging completion.
        await request("complete", { payload: encodeReferences(result) });
        finished = true;
        port.postMessage({ protocol, type: "ready", revision });
      })().catch(report);
    };
    port.start();
  });
  parent.postMessage({ protocol, type: "hello" }, hostOrigin);
}
