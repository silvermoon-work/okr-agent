import { get } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { startPreview } from "../src/preview.js";
import type { PreviewState } from "../src/preview.js";
import { fixtureDirectory, rendererFixture } from "./helpers.js";

async function events(url: string) {
  const parsed = new URL(url);
  const abort = new AbortController();
  const response = await fetch(new URL("/events", parsed), {
    headers: { Authorization: `Bearer ${parsed.hash.slice(1)}` },
    signal: abort.signal,
  });
  const reader = response
    .body!.pipeThrough(new TextDecoderStream())
    .getReader();
  let buffer = "";
  const next = async (): Promise<PreviewState> => {
    for (;;) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        return JSON.parse(event.slice(6)) as PreviewState;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("Closed event stream.");
      buffer += value;
    }
  };
  const until = async (
    type: PreviewState["type"],
    minimum = 0,
  ): Promise<PreviewState> => {
    for (let count = 0; count < 30; count++) {
      const state = await next();
      if (state.type === type && state.revision >= minimum) return state;
    }
    throw new Error("Expected event did not arrive.");
  };
  return {
    next,
    until,
    close: () => {
      abort.abort();
    },
  };
}

describe("loopback preview, authorization, watching and owned lifetime", () => {
  it("serves only approved assets and authorized revisions with strict HTTP boundaries", async () => {
    const directory = await fixtureDirectory();
    const renderer = await rendererFixture(
      undefined,
      new Map([["assets/字体.woff2", Buffer.from("controlled-font-bytes")]]),
    );
    const path = join(directory.directory, "doc.json");
    const abort = new AbortController();
    await writeFile(
      path,
      JSON.stringify({ $schema: "urn:one:1", title: "private-body" }),
    );
    const preview = await startPreview({
      path,
      configuration: { version: 1, renderers: { "urn:one:1": renderer.cid } },
      store: renderer.store,
      signal: abort.signal,
      diagnostic: () => {},
      pollMs: 10,
    });
    const origin = new URL(preview.url).origin;
    const stream = await events(preview.url);
    try {
      expect((await stream.next()).type).toBe("document");
      const home = await fetch(origin);
      expect(home.status).toBe(200);
      expect(home.headers.get("content-security-policy")).toContain(
        "frame-ancestors 'none'",
      );
      expect(home.headers.get("content-security-policy")).not.toContain(
        "unsafe-eval",
      );
      expect(await home.text()).not.toContain("private-body");
      const frameCsp = (await fetch(origin + "/frame")).headers.get(
        "content-security-policy",
      );
      expect(frameCsp).toContain("connect-src 'none'");
      expect(frameCsp).toContain("'unsafe-eval'");
      expect((await fetch(origin + "/events")).status).toBe(403);
      expect(
        (
          await fetch(origin + "/events", {
            headers: { Authorization: "Bearer wrong" },
          })
        ).status,
      ).toBe(403);
      for (const originHeader of ["https://evil.test", "null"]) {
        expect(
          (
            await fetch(origin + "/events", {
              headers: {
                Origin: originHeader,
                Authorization: `Bearer ${new URL(preview.url).hash.slice(1)}`,
              },
            })
          ).status,
        ).toBe(403);
      }
      expect(
        (await fetch(origin, { headers: { Origin: "null" } })).status,
      ).toBe(403);
      expect(
        (await fetch(origin, { headers: { Origin: "https://evil.test" } }))
          .status,
      ).toBe(403);
      expect((await fetch(origin, { method: "POST" })).status).toBe(405);
      expect((await fetch(origin + "/unknown")).status).toBe(404);
      for (const suffix of [
        "/",
        "/missing.js",
        "/%2e%2e/config.json",
        "/renderer.js?x=1",
      ])
        expect(
          (await fetch(origin + `/assets/${renderer.cid}${suffix}`)).status,
        ).toBe(404);
      expect(
        (await fetch(origin + "/assets/another-cid/renderer.js")).status,
      ).toBe(404);
      const asset = await fetch(
        origin + `/assets/${renderer.cid}/renderer.js`,
        { headers: { Origin: "null" } },
      );
      expect(asset.status).toBe(200);
      expect(asset.headers.get("access-control-allow-origin")).toBe("*");
      expect(asset.headers.get("content-type")).toBe("text/javascript");
      expect(await asset.text()).toContain("export default");
      const font = await fetch(
        origin +
          `/assets/${renderer.cid}/assets/${encodeURIComponent("字体.woff2")}`,
        { headers: { Origin: "null" } },
      );
      expect(font.headers.get("content-type")).toBe("font/woff2");
      expect(await font.text()).toBe("controlled-font-bytes");
      expect(
        (
          await fetch(
            origin +
              `/assets/${renderer.cid}/assets%2f${encodeURIComponent("字体.woff2")}`,
          )
        ).status,
      ).toBe(404);
      const hostStatus = await new Promise<number>((resolve) => {
        const request = get(
          origin,
          { headers: { Host: "evil.test" } },
          (response) => {
            response.resume();
            resolve(response.statusCode!);
          },
        );
        request.on("error", () => {
          resolve(0);
        });
      });
      expect(hostStatus).toBe(403);
    } finally {
      stream.close();
      abort.abort();
      await preview.close();
      await preview.close();
      await renderer.store.close();
      await directory.cleanup();
    }
    await expect(fetch(origin)).rejects.toThrow();
  });
  it("survives save/atomic replace/missing/invalid and schema changes using the startup snapshot", async () => {
    const directory = await fixtureDirectory();
    const one = await rendererFixture();
    const two = await rendererFixture(
      "export default {mount(){document.body.textContent='two'},update(){},dispose(){}}",
    );
    for (const [cid, bytes] of two.blocks) one.blocks.set(cid, bytes);
    const path = join(directory.directory, "doc.yaml");
    const write = (title: string, schema = "urn:one:1") =>
      writeFile(path, `$schema: ${schema}\ntitle: ${title}\n`);
    const diagnostic = vi.fn<(message: string) => void>();
    await write("first");
    const abort = new AbortController();
    const configuration = {
      version: 1 as const,
      renderers: { "urn:one:1": one.cid, "urn:two:1": two.cid },
    };
    const preview = await startPreview({
      path,
      configuration,
      store: one.store,
      signal: abort.signal,
      diagnostic,
      pollMs: 10,
    });
    const stream = await events(preview.url);
    try {
      expect((await stream.next()).revision).toBe(1);
      await write("second");
      const second = await stream.until("document", 2);
      expect(second.type === "document" && second.document.title).toBe(
        "second",
      );
      const replacement = join(directory.directory, "replacement");
      await writeFile(replacement, "$schema: urn:one:1\ntitle: replaced\n");
      await rename(replacement, path);
      const replaced = await stream.until("document", second.revision + 1);
      expect(replaced.type === "document" && replaced.document.title).toBe(
        "replaced",
      );
      await writeFile(path, "$schema: urn:one:1\nprivate-token-never-log: [");
      const error = await stream.until("error", replaced.revision + 1);
      expect(error.type === "error" && error.message).toMatch(/YAML/);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(
        "private-token",
      );
      await write("recovered");
      await stream.until("document", error.revision + 1);
      await rm(path);
      const missing = await stream.until("error");
      expect(missing.type === "error" && missing.message).toContain(
        "Cannot read",
      );
      await write("new schema", "urn:two:1");
      const changed = await stream.until("document", missing.revision + 1);
      expect(changed.type === "document" && changed.cid).toBe(two.cid);
      await write("unmapped", "urn:missing:1");
      const unmapped = await stream.until("error", changed.revision + 1);
      expect(unmapped.type === "error" && unmapped.message).toContain(
        "registry add",
      );
      await Promise.all([write("fast1"), write("fast2")]);
      await write("last");
      const last = await stream.until("document", unmapped.revision + 1);
      expect(last.type === "document" && last.document.title).toBe("last");
    } finally {
      stream.close();
      abort.abort();
      await preview.close();
      await one.store.close();
      await two.store.close();
      await directory.cleanup();
    }
  });
  it("fails startup honestly and aborts in-flight content reads without closing caller Store", async () => {
    const directory = await fixtureDirectory();
    const renderer = await rendererFixture();
    const path = join(directory.directory, "doc.json");
    const base = {
      path,
      configuration: { version: 1 as const, renderers: {} },
      store: renderer.store,
      signal: new AbortController().signal,
      diagnostic: () => {},
    };
    try {
      await expect(startPreview(base)).rejects.toThrow("Cannot read");
      await writeFile(path, '{"$schema":"urn:missing:1"}');
      await expect(startPreview(base)).rejects.toThrow("No renderer");
      const abort = new AbortController();
      abort.abort();
      await expect(
        startPreview({ ...base, signal: abort.signal }),
      ).rejects.toThrow();
      // Caller-owned Store still works after startup failures.
      expect((await renderer.store.read(renderer.cid)).type).toBe("directory");
    } finally {
      await renderer.store.close();
      await directory.cleanup();
    }
  });
  it("bounds authorized SSE connections and supports a near-limit document update without disconnecting", async () => {
    const directory = await fixtureDirectory();
    const renderer = await rendererFixture();
    const path = join(directory.directory, "doc.json");
    const write = (title: string) =>
      writeFile(path, JSON.stringify({ $schema: "urn:fixture:1", title }));
    await write("first");
    const abort = new AbortController();
    const preview = await startPreview({
      path,
      configuration: {
        version: 1,
        renderers: { "urn:fixture:1": renderer.cid },
      },
      store: renderer.store,
      signal: abort.signal,
      diagnostic: () => {},
      pollMs: 10,
    });
    const clients: Awaited<ReturnType<typeof events>>[] = [];
    try {
      for (let index = 0; index < 8; index++)
        clients.push(await events(preview.url));
      const parsed = new URL(preview.url);
      expect(
        (
          await fetch(new URL("/events", parsed), {
            headers: { Authorization: `Bearer ${parsed.hash.slice(1)}` },
          })
        ).status,
      ).toBe(429);
      for (const client of clients) await client.next();
      const title = "x".repeat(1024 * 1000);
      await write(title);
      const large = await clients[0]!.until("document", 2);
      expect(large.type === "document" && large.document.title).toBe(title);
    } finally {
      for (const client of clients) client.close();
      abort.abort();
      await preview.close();
      await renderer.store.close();
      await directory.cleanup();
    }
  });
  it("does not commit an older document after asynchronous bundle loading finishes", async () => {
    const directory = await fixtureDirectory();
    const one = await rendererFixture();
    const two = await rendererFixture(
      "export default {mount(){},update(){},dispose(){/*second*/}}",
    );
    for (const [cid, bytes] of two.blocks) one.blocks.set(cid, bytes);
    const path = join(directory.directory, "doc.json");
    const write = (title: string, schema = "urn:one:1") =>
      writeFile(path, JSON.stringify({ $schema: schema, title }));
    await write("first");
    const abort = new AbortController();
    const preview = await startPreview({
      path,
      configuration: {
        version: 1,
        renderers: { "urn:one:1": one.cid, "urn:two:1": two.cid },
      },
      store: one.store,
      signal: abort.signal,
      diagnostic: () => {},
      pollMs: 10,
    });
    const stream = await events(preview.url);
    try {
      await stream.next();
      const original = one.store.scope.bind(one.store);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let waiting = false;
      vi.spyOn(one.store, "scope").mockImplementation((limits) => {
        const reader = original(limits);
        const prepare = reader.prepare.bind(reader);
        reader.prepare = async (...args) => {
          waiting = true;
          await gate;
          return prepare(...args);
        };
        return reader;
      });
      await write("obsolete", "urn:two:1");
      await vi.waitFor(() => {
        expect(waiting).toBe(true);
      });
      await write("latest", "urn:two:1");
      release();
      const current = await stream.until("document", 2);
      expect(current.type === "document" && current.document.title).toBe(
        "latest",
      );
    } finally {
      stream.close();
      abort.abort();
      await preview.close();
      await one.store.close();
      await two.store.close();
      await directory.cleanup();
    }
  });
  it("awaits in-flight content cancellation even when the backend rejects with an ordinary Error, and still closes HTTP", async () => {
    const directory = await fixtureDirectory();
    const renderer = await rendererFixture();
    const path = join(directory.directory, "doc.json");
    const write = (schema: string) =>
      writeFile(path, JSON.stringify({ $schema: schema }));
    await write("urn:one:1");
    const abort = new AbortController();
    const preview = await startPreview({
      path,
      configuration: {
        version: 1,
        renderers: {
          "urn:one:1": renderer.cid,
          "urn:two:1":
            "bafybeicnnadrvyiqs3tedkt2nnnp3euon4ox5xfnaszg762ztj4qrchw3u",
        },
      },
      store: renderer.store,
      signal: abort.signal,
      diagnostic: () => {},
      pollMs: 10,
    });
    const origin = new URL(preview.url).origin;
    const stream = await events(preview.url);
    try {
      await stream.next();
      const original = renderer.store.scope.bind(renderer.store);
      let waiting = false,
        cancelled = false;
      vi.spyOn(renderer.store, "scope").mockImplementation((limits) => {
        const reader = original(limits);
        reader.prepare = (_root, options) =>
          new Promise((_resolve, reject) => {
            waiting = true;
            options!.signal!.addEventListener(
              "abort",
              () => {
                cancelled = true;
                reject(new Error("Backend cancelled"));
              },
              { once: true },
            );
          });
        return reader;
      });
      await write("urn:two:1");
      await vi.waitFor(() => {
        expect(waiting).toBe(true);
      });
      abort.abort();
      await expect(preview.close()).resolves.toBeUndefined();
      expect(cancelled).toBe(true);
      await expect(fetch(origin)).rejects.toThrow();
      expect((await renderer.store.read(renderer.cid)).type).toBe("directory");
    } finally {
      stream.close();
      abort.abort();
      await preview.close();
      await renderer.store.close();
      await directory.cleanup();
      vi.restoreAllMocks();
    }
  });
  it("keeps unchanged failed inputs stable without repeated Store reads, then retries a real save and recovers", async () => {
    const directory = await fixtureDirectory();
    const one = await rendererFixture();
    const two = await rendererFixture(
      "export default {mount(){},update(){},dispose(){/* initially unavailable */}}",
    );
    const path = join(directory.directory, "doc.json");
    const content = (schema: string) =>
      JSON.stringify({ $schema: schema, title: "controlled" });
    const write = (schema: string) => writeFile(path, content(schema));
    await write("urn:one:1");
    const abort = new AbortController();
    const diagnostic = vi.fn<(message: string) => void>();
    const preview = await startPreview({
      path,
      configuration: {
        version: 1,
        renderers: { "urn:one:1": one.cid, "urn:missing:1": two.cid },
      },
      store: one.store,
      signal: abort.signal,
      diagnostic,
      pollMs: 10,
    });
    const stream = await events(preview.url);
    const scopes = vi.spyOn(one.store, "scope");
    const snapshot = async () => {
      const current = await events(preview.url);
      try {
        return await current.next();
      } finally {
        current.close();
      }
    };
    try {
      await stream.next();
      diagnostic.mockClear();
      await write("urn:unmapped:1");
      const unmapped = await stream.until("error", 2);
      await delay(80);
      expect(await snapshot()).toEqual(unmapped);
      expect(diagnostic).toHaveBeenCalledOnce();
      expect(scopes).not.toHaveBeenCalled();

      diagnostic.mockClear();
      await write("urn:missing:1");
      const missing = await stream.until("error", unmapped.revision + 1);
      await delay(80);
      expect(await snapshot()).toEqual(missing);
      expect(diagnostic).toHaveBeenCalledOnce();
      expect(scopes).toHaveBeenCalledOnce();

      for (const [cid, bytes] of two.blocks) one.blocks.set(cid, bytes);
      await delay(50);
      expect(await snapshot()).toEqual(missing);
      expect(scopes).toHaveBeenCalledOnce();
      const replacement = join(directory.directory, "saved.json");
      await writeFile(replacement, content("urn:missing:1"));
      await rename(replacement, path);
      const recovered = await stream.until("document", missing.revision + 1);
      expect(recovered.type === "document" && recovered.cid).toBe(two.cid);
      expect(scopes).toHaveBeenCalledTimes(2);

      diagnostic.mockClear();
      await write("not-a-uri");
      const malformed = await stream.until("error", recovered.revision + 1);
      expect(malformed.type === "error" && malformed.message).toContain(
        "Schema must be a complete",
      );
      await delay(60);
      expect(await snapshot()).toEqual(malformed);
      expect(diagnostic).toHaveBeenCalledOnce();
      expect(scopes).toHaveBeenCalledTimes(2);
      await write("urn:one:1");
      const corrected = await stream.until("document", malformed.revision + 1);
      expect(corrected.type === "document" && corrected.cid).toBe(one.cid);
    } finally {
      stream.close();
      abort.abort();
      await preview.close();
      await one.store.close();
      await two.store.close();
      await directory.cleanup();
      vi.restoreAllMocks();
    }
  });
});
