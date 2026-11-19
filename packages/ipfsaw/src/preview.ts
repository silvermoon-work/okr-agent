import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import type { IpfsStore } from "@silvermoon-work/ipfs-store";
import type { Configuration } from "./configuration.js";
import { assetPath, loadRenderer, mime } from "./bundle.js";
import type { RendererBundle } from "./bundle.js";
import { DocumentError, limits, readDocument, record } from "./document.js";
import { frameClient, hostClient } from "./browser.js";
import { loadBrowserTask, TaskInvocation } from "./task.js";
import type { TaskSource } from "./task.js";
import { isTaskBundlePath, TaskError } from "@silvermoon-work/task-protocol";
import { taskHostClient } from "./task-browser.js";
import { previewNavigation } from "./navigation.js";

export type PreviewState =
  | { type: "loading"; revision: number }
  | { type: "error"; revision: number; message: string }
  | {
      type: "task";
      revision: number;
      parameters: unknown;
      cid: string;
      entry: string;
    }
  | {
      type: "document";
      revision: number;
      document: Record<string, unknown>;
      schema: string;
      cid: string;
      manifest: RendererBundle["manifest"];
    };

export interface PreviewOptions {
  path: string;
  configuration: Configuration;
  store: IpfsStore;
  signal: AbortSignal;
  diagnostic(message: string): void;
  pollMs?: number;
  task?: TaskSource;
  onNoClients?: () => void;
}

export async function startPreview(options: PreviewOptions): Promise<{
  url: string;
  schema: string;
  rendererCid: string;
  bundleCid?: string;
  close(): Promise<void>;
}> {
  const lifetime = new AbortController();
  const signal = AbortSignal.any([options.signal, lifetime.signal]);
  const cancelled = () => signal.aborted;
  const nonce = randomBytes(24).toString("base64url");
  const clients = new Set<ServerResponse>();
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const sessions = new Map<
    string,
    { call?: TaskInvocation; blocked?: boolean }
  >();
  const cleanups = new Set<Promise<void>>();
  const cleanupFailures: unknown[] = [];
  const retire = (call: TaskInvocation | undefined) => {
    if (!call) return;
    const cleanup = call.close();
    cleanups.add(cleanup);
    void cleanup
      .catch((error) => {
        cleanupFailures.push(error);
      })
      .finally(() => cleanups.delete(cleanup));
  };
  const task = options.task
    ? await loadBrowserTask(options.store, options.task, signal)
    : undefined;
  let revision = 0;
  let state: PreviewState = { type: "loading", revision };
  let bundle: RendererBundle | undefined;
  let fingerprint = "";
  let observedFile = "";
  let closing: Promise<void> | undefined;
  const publish = (next: PreviewState) => {
    if (task) {
      for (const session of sessions.values()) {
        retire(session.call);
        delete session.call;
        delete session.blocked;
      }
    }
    state = next;
    const event = `data: ${JSON.stringify(next)}\n\n`;
    for (const client of clients) {
      // Slow readers must not accumulate unbounded document revisions.
      if (client.writableLength > limits.document * 2) {
        clients.delete(client);
        client.destroy();
      } else client.write(event);
    }
  };
  const refresh = async (initial: boolean) => {
    signal.throwIfAborted();
    try {
      const file = await stat(options.path, { bigint: true }).catch(() => {
        observedFile = "";
        throw new DocumentError(
          "Cannot read document metadata. Check the file exists and is readable.",
        );
      });
      const identity = [
        file.dev,
        file.ino,
        file.size,
        file.mtimeNs,
        file.ctimeNs,
      ].join(":");
      // Failed revisions retry on a real save/change, never by polling the same content repeatedly.
      if (!initial && identity === observedFile) return;
      observedFile = identity;
      const parsed = await readDocument(options.path, !!task);
      const nextFingerprint = JSON.stringify(parsed.document);
      if (
        !initial &&
        (state.type === "document" || state.type === "task") &&
        nextFingerprint === fingerprint
      )
        return;
      fingerprint = nextFingerprint;
      const current = ++revision;
      publish({ type: "loading", revision: current });
      if (task) {
        const parameters = task.parameters(parsed.document);
        if (
          JSON.stringify((await readDocument(options.path, true)).document) !==
          nextFingerprint
        ) {
          observedFile = "";
          return;
        }
        publish({
          type: "task",
          revision: current,
          parameters,
          cid: task.cid,
          entry: task.resolved.entry,
        });
        options.diagnostic(
          `Document revision ${String(current)} prepared; browser startup is pending.`,
        );
        return;
      }
      const cid = options.configuration.renderers[parsed.schema];
      if (!cid)
        throw new DocumentError(
          "No renderer binding for this schema. Use ipfsaw registry add <schema-uri> <cid> with the selected --data-dir, then restart preview.",
        );
      if (bundle?.cid !== cid) {
        bundle = undefined;
        bundle = await loadRenderer(options.store, cid, signal);
      }
      signal.throwIfAborted();
      if (
        JSON.stringify((await readDocument(options.path)).document) !==
        nextFingerprint
      ) {
        fingerprint = "";
        observedFile = "";
        return;
      }
      if (!record(parsed.document))
        throw new DocumentError("Expected a document object.");
      publish({
        type: "document",
        revision: current,
        document: parsed.document,
        schema: parsed.schema,
        cid: bundle.cid,
        manifest: bundle.manifest,
      });
      options.diagnostic(`Document revision ${String(current)} loaded.`);
    } catch (error) {
      if (signal.aborted) throw error;
      if (initial) throw error;
      // Do not forward parser, filesystem, Store or renderer exception text: it can contain source/secrets.
      const message =
        error instanceof DocumentError
          ? error.message
          : task
            ? "Task parameters could not be validated. Correct the document and save again."
            : "Renderer content could not be loaded or verified. Check the binding and shared Store configuration; save again to retry.";
      if (state.type !== "error" || state.message !== message) {
        publish({ type: "error", revision: ++revision, message });
        options.diagnostic(message);
      }
    }
  };
  try {
    await refresh(true);
  } catch (error) {
    await task?.close();
    throw error;
  }
  const initialMetadata = () => {
    if (state.type === "task")
      return { schema: "", rendererCid: "", bundleCid: state.cid };
    if (state.type !== "document")
      throw new DocumentError(
        "Document changed during startup. Retry when saving is complete.",
      );
    return { schema: state.schema, rendererCid: state.cid };
  };
  let metadata: ReturnType<typeof initialMetadata>;
  try {
    metadata = initialMetadata();
    signal.throwIfAborted();
  } catch (error) {
    await task?.close();
    throw error;
  }
  let origin = "";
  const server = createServer((request, response) => {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=()",
    };
    for (const [key, value] of Object.entries(headers))
      response.setHeader(key, value);
    const refuse = (code: number) => {
      response.writeHead(code);
      response.end();
    };
    if (
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin !== undefined &&
        request.headers.origin !== origin &&
        request.headers.origin !== "null")
    ) {
      refuse(403);
      return;
    }
    // This non-secret header forces foreign browser callers through rejected CORS preflight.
    if (
      (request.url === "/events" || (task && request.url === "/call")) &&
      (request.headers.origin === "null" ||
        request.headers["x-ipfsaw-client"] !== "browser")
    ) {
      refuse(403);
      return;
    }
    if (task && request.method === "POST" && request.url === "/call") {
      void (async () => {
        let length = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          const bytes = Buffer.from(chunk as Uint8Array);
          length += bytes.length;
          if (length > limits.document)
            throw new TaskError("capacity_exceeded", "Request limit exceeded.");
          chunks.push(bytes);
        }
        const input: unknown = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        );
        if (
          !record(input) ||
          typeof input.session !== "string" ||
          input.revision !== revision ||
          state.type !== "task" ||
          typeof input.operation !== "string"
        )
          throw new TaskError(
            "invalid_request",
            "Invalid or obsolete startup request.",
          );
        const session = sessions.get(input.session);
        if (!session)
          throw new TaskError(
            "content_forbidden",
            "No authorized browser session.",
          );
        let value: unknown;
        if (input.operation === "start") {
          if (session.call || session.blocked)
            throw new TaskError(
              "invalid_request",
              "Startup already called or cancelled.",
            );
          session.call = new TaskInvocation(
            task,
            task.parameters(state.parameters),
          );
          value = {
            runId: session.call.id,
            scope: session.call.scope,
            startedAt: session.call.startedAt,
            bundle: task.cid,
          };
        } else {
          const call = session.call;
          if (input.operation === "cancel") {
            value = call ? await call.cancel() : true;
            if (value) session.blocked = true;
          } else if (input.operation === "close") {
            session.blocked = true;
            await call?.close();
            value = null;
          } else if (!call)
            throw new TaskError("run_finished", "No active startup call.");
          else if (input.operation === "complete") {
            value = call.complete(input.payload);
            await call.close();
            if (input.revision === revision && session.call === call)
              options.diagnostic(
                `Browser startup completed for revision ${String(revision)}.`,
              );
          } else if (input.operation === "fail") {
            await call.fail();
            if (input.revision === revision && session.call === call)
              options.diagnostic(
                "Browser startup failed. Check the document and browser Task.",
              );
            value = null;
          } else if (
            input.operation === "cancelContent" &&
            typeof input.requestId === "number"
          ) {
            value = call.cancelContent(input.requestId);
          } else
            value = await call.request({
              operation: input.operation,
              ...(typeof input.id === "number" ? { id: input.id } : {}),
              ...(typeof input.cid === "string" ? { cid: input.cid } : {}),
              ...(typeof input.path === "string" ? { path: input.path } : {}),
            });
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({ ok: true, data: value }, (_key, item: unknown) =>
            item instanceof Uint8Array
              ? { base64: Buffer.from(item).toString("base64") }
              : item,
          ),
        );
      })().catch((error: unknown) => {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            ok: false,
            error: {
              code: error instanceof TaskError ? error.code : "invalid_request",
              message: "Browser Task request failed.",
            },
          }),
        );
      });
      return;
    }
    if (request.method !== "GET") {
      refuse(405);
      return;
    }
    const path = request.url;
    if (path === "/events") {
      if (clients.size >= 8) {
        refuse(429);
        return;
      }
      const sessionId = request.headers["x-ipfsaw-session"];
      if (
        task &&
        (typeof sessionId !== "string" ||
          !/^[a-z0-9-]{36}$/iu.test(sessionId) ||
          sessions.has(sessionId))
      ) {
        refuse(403);
        return;
      }
      if (typeof sessionId === "string") sessions.set(sessionId, {});
      clearTimeout(disconnectTimer);
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`data: ${JSON.stringify(state)}\n\n`);
      clients.add(response);
      response.on("close", () => {
        clients.delete(response);
        if (typeof sessionId === "string") {
          retire(sessions.get(sessionId)?.call);
          sessions.delete(sessionId);
        }
        if (clients.size === 0 && !signal.aborted && options.onNoClients) {
          clearTimeout(disconnectTimer);
          // A reload briefly disconnects the final page before its replacement connects.
          disconnectTimer = setTimeout(() => {
            if (clients.size === 0 && !signal.aborted) options.onNoClients?.();
          }, 3000);
        }
      });
      return;
    }
    if (path?.startsWith("/assets/")) {
      // Only already-verified files of the single current, explicitly selected root.
      const selected = task ?? bundle;
      const prefix = selected ? `/assets/${selected.cid}/` : "";
      let filename: string;
      try {
        const encoded =
          prefix && path.startsWith(prefix) ? path.slice(prefix.length) : "";
        if (/[?#]/u.test(encoded) || /%2f|%5c/iu.test(encoded))
          throw new Error();
        const decoded = decodeURIComponent(encoded);
        if (task) {
          if (!isTaskBundlePath(decoded)) throw new Error();
          filename = decoded;
        } else filename = assetPath(decoded);
      } catch {
        refuse(404);
        return;
      }
      const asset = selected?.files.get(filename);
      if (!asset) {
        refuse(404);
        return;
      }
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      let contentType: string;
      try {
        contentType = mime(filename);
      } catch {
        if (!task) {
          refuse(404);
          return;
        }
        contentType = "application/octet-stream";
      }
      response.writeHead(200, { "Content-Type": contentType });
      response.end(asset);
      return;
    }
    if (task && path === "/task-runtime.js") {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      void readFile(new URL("../dist/task-runtime.js", import.meta.url))
        .then((bytes) => {
          response.writeHead(200, { "Content-Type": "text/javascript" });
          response.end(bytes);
        })
        .catch(() => {
          refuse(500);
        });
      return;
    }
    if (request.headers.origin === "null") {
      refuse(403);
      return;
    }
    if (path === "/") {
      response.setHeader(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      );
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ipfsaw preview</title><style nonce="${nonce}">html,body{height:100%;margin:0;color:#203047;background:#fff;font:14px "Segoe UI",sans-serif}body{display:flex;flex-direction:column}#status{margin:0;padding:10px 18px;border-bottom:1px solid #c6d3e2;background:#eef4fa;overflow-wrap:anywhere;flex-shrink:0}#renderer{flex:1;min-height:0}iframe{display:block;height:100%;width:100%;border:0}[hidden]{display:none!important}</style><p id="status" role="status">Connecting…</p><main id="renderer" hidden></main><script nonce="${nonce}">(${previewNavigation.toString()})();(${(task ? taskHostClient : hostClient).toString()})()</script></html>`,
      );
      return;
    }
    if (path === "/frame") {
      // Check's existing AJV compiler uses Function. This permission never reaches the host realm.
      response.setHeader(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' ${origin}/assets/ ${task ? `${origin}/task-runtime.js` : ""}; style-src 'nonce-${nonce}' ${origin}/assets/; img-src ${origin}/assets/ data:; font-src ${origin}/assets/; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
      );
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        task
          ? `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Browser app</title><style nonce="${nonce}">html,body{height:100%;margin:0}</style><script type="module" nonce="${nonce}">import {taskFrameClient} from '/task-runtime.js';taskFrameClient(${JSON.stringify(origin)});</script></html>`
          : `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renderer</title><style nonce="${nonce}">html,body,#app{height:100%;margin:0}</style><div id="app"></div><script nonce="${nonce}">(${frameClient.toString()})(${JSON.stringify(origin)})</script></html>`,
      );
      return;
    }
    refuse(404);
  });
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      lifetime.abort();
      clearTimeout(disconnectTimer);
      const failures: unknown[] = cleanupFailures;
      try {
        await polling;
      } catch (error) {
        failures.push(error);
      }
      try {
        for (const client of clients) client.destroy();
        clients.clear();
        for (const session of sessions.values()) retire(session.call);
        sessions.clear();
        await Promise.all([...cleanups]);
        await task?.close();
      } catch (error) {
        failures.push(error);
      }
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
          server.closeAllConnections();
        });
      } catch (error) {
        failures.push(error);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      if (failures.length)
        throw new AggregateError(failures, "Preview cleanup failed.");
    })());
  const onAbort = () => {
    lifetime.abort();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  } catch (error) {
    signal.removeEventListener("abort", onAbort);
    lifetime.abort();
    await task?.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not bind loopback preview.");
  origin = `http://127.0.0.1:${String(address.port)}`;
  // Sequential, bounded rereads avoid inode/watch loss on atomic replacement and stale async commits.
  const polling = (async () => {
    while (!cancelled()) {
      try {
        await delay(options.pollMs ?? 150, undefined, { signal });
        await refresh(false);
      } catch (error) {
        if (!cancelled()) throw error;
      }
    }
  })();
  return { url: `${origin}/`, ...metadata, close };
}
