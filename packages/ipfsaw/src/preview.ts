import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import type { IpfsStore } from "@silvermoon-work/ipfs-store";
import type { Configuration } from "./configuration.js";
import { assetPath, loadRenderer, mime } from "./bundle.js";
import type { RendererBundle } from "./bundle.js";
import { DocumentError, limits, readDocument } from "./document.js";
import { frameClient, hostClient } from "./browser.js";

export type PreviewState =
  | { type: "loading"; revision: number }
  | { type: "error"; revision: number; message: string }
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
}

export async function startPreview(options: PreviewOptions): Promise<{
  url: string;
  schema: string;
  rendererCid: string;
  close(): Promise<void>;
}> {
  const lifetime = new AbortController();
  const signal = AbortSignal.any([options.signal, lifetime.signal]);
  const cancelled = () => signal.aborted;
  const token = randomBytes(32).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const clients = new Set<ServerResponse>();
  let revision = 0;
  let state: PreviewState = { type: "loading", revision };
  let bundle: RendererBundle | undefined;
  let fingerprint = "";
  let observedFile = "";
  let closing: Promise<void> | undefined;
  const publish = (next: PreviewState) => {
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
      const parsed = await readDocument(options.path);
      const nextFingerprint = JSON.stringify(parsed.document);
      if (
        !initial &&
        state.type === "document" &&
        nextFingerprint === fingerprint
      )
        return;
      fingerprint = nextFingerprint;
      const current = ++revision;
      publish({ type: "loading", revision: current });
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
      publish({
        type: "document",
        revision: current,
        ...parsed,
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
          : "Renderer content could not be loaded or verified. Check the binding and shared Store configuration; save again to retry.";
      if (state.type !== "error" || state.message !== message) {
        publish({ type: "error", revision: ++revision, message });
        options.diagnostic(message);
      }
    }
  };
  await refresh(true);
  const initialMetadata = () => {
    if (state.type !== "document")
      throw new DocumentError(
        "Document changed during startup. Retry when saving is complete.",
      );
    return { schema: state.schema, rendererCid: state.cid };
  };
  const metadata = initialMetadata();
  signal.throwIfAborted();
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
    if (request.method !== "GET") {
      refuse(405);
      return;
    }
    const path = request.url;
    if (path === "/events") {
      if (
        request.headers.origin === "null" ||
        request.headers.authorization !== `Bearer ${token}`
      ) {
        refuse(403);
        return;
      }
      if (clients.size >= 8) {
        refuse(429);
        return;
      }
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`data: ${JSON.stringify(state)}\n\n`);
      clients.add(response);
      response.on("close", () => {
        clients.delete(response);
      });
      return;
    }
    if (path?.startsWith("/assets/")) {
      // Only already-verified files of the single current, explicitly selected root.
      const prefix = bundle ? `/assets/${bundle.cid}/` : "";
      let filename: string;
      try {
        const encoded =
          prefix && path.startsWith(prefix) ? path.slice(prefix.length) : "";
        if (/[?#]/u.test(encoded) || /%2f|%5c/iu.test(encoded))
          throw new Error();
        filename = assetPath(decodeURIComponent(encoded));
      } catch {
        refuse(404);
        return;
      }
      const asset = bundle?.files.get(filename);
      if (!asset) {
        refuse(404);
        return;
      }
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      response.writeHead(200, { "Content-Type": mime(filename) });
      response.end(asset);
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
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ipfsaw preview</title><style nonce="${nonce}">html,body{height:100%;margin:0;color:#203047;background:#fff;font:14px "Segoe UI",sans-serif}body{display:flex;flex-direction:column}header{padding:10px 18px;border-bottom:1px solid #c6d3e2;background:#eef4fa;display:flex;gap:24px;align-items:center}h1{font-size:16px;margin:0}#status{margin:0;overflow-wrap:anywhere}#renderer{flex:1;min-height:0}iframe{height:100%;width:100%;border:0}[hidden]{display:none!important}</style><header><h1>ipfsaw</h1><p id="status" role="status">Connecting…</p></header><main id="renderer" hidden></main><script nonce="${nonce}">(${hostClient.toString()})()</script></html>`,
      );
      return;
    }
    if (path === "/frame") {
      // Check's existing AJV compiler uses Function. This permission never reaches the host realm.
      response.setHeader(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' ${origin}/assets/; style-src ${origin}/assets/; img-src ${origin}/assets/ data:; font-src ${origin}/assets/; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
      );
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renderer</title><div id="app"></div><script nonce="${nonce}">(${frameClient.toString()})(${JSON.stringify(origin)})</script></html>`,
      );
      return;
    }
    refuse(404);
  });
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      lifetime.abort();
      const failures: unknown[] = [];
      try {
        await polling;
      } catch (error) {
        failures.push(error);
      }
      try {
        for (const client of clients) client.destroy();
        clients.clear();
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
  return { url: `${origin}/#${token}`, ...metadata, close };
}
