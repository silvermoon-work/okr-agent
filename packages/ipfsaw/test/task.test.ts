import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTaskBundle } from "@silvermoon-work/task-builder";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { memoryTree } from "@silvermoon-work/task-builder/tree";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { ContentRef, encodeReferences } from "@silvermoon-work/ipfs-payload";
import { ContentRefSchema } from "@silvermoon-work/task-protocol";
import { parseTaskDocument } from "../src/document.js";
import { loadBrowserTask, TaskInvocation } from "../src/task.js";
import { startPreview } from "../src/preview.js";
import { fixtureDirectory, rendererFixture } from "./helpers.js";

export async function taskFixture(
  script = "export default async (parameters) => parameters.text;",
  result: unknown = { type: "string" },
  runtime: { type: "browser" } | { type: "node"; minVersion: string } = {
    type: "browser",
  },
) {
  const tree = await buildTaskBundle(
    memoryTree(
      new Map([
        ["main.js", Buffer.from(script)],
        ["note.txt", Buffer.from("actual bundled resource")],
      ]),
    ),
    {
      name: "browser acceptance",
      runtime,
      source: {
        entry: "main.js",
        mode: "explicit",
        contract: {
          parameters: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
            additionalProperties: false,
          },
          result,
          message: false,
        },
      },
      include: [{ from: "note.txt", to: "resources/" }],
    },
  );
  const encoded = await encodeTaskBundleCar(tree);
  try {
    return {
      cid: encoded.cid,
      car: new Uint8Array(await new Response(encoded.stream).arrayBuffer()),
    };
  } finally {
    await encoded.close();
  }
}

describe("real standard browser Task", () => {
  it("parses raw document values without imposing the legacy schema selector", () => {
    expect(parseTaskDocument(Buffer.from("text: hello"), ".yaml")).toEqual({
      text: "hello",
    });
    expect(parseTaskDocument(Buffer.from("[1,true,null]"), ".json")).toEqual([
      1,
      true,
      null,
    ]);
    expect(() =>
      parseTaskDocument(Buffer.from("a: &a [*a]"), ".yaml"),
    ).toThrow();
  });
  it("loads an actual explicit ESM Builder CAR and the identical CID without executing it in Node", async () => {
    const fixture = await taskFixture(
      "throw new Error('must not execute in Node'); export default async () => 'ok';",
    );
    const shared = IpfsStore.fromClient({
      block: {
        get: () => {
          throw new Error("network forbidden");
        },
      },
    });
    const car = await loadBrowserTask(shared, { car: fixture.car });
    const cid = await loadBrowserTask(car.store, { cid: fixture.cid });
    try {
      expect(car.cid).toBe(cid.cid);
      expect(car.resolved.runtime).toEqual({ type: "browser" });
      expect(car.resolved.entry).toBe("main.mjs");
      expect(car.files.get("resources/note.txt")).toEqual(
        Buffer.from("actual bundled resource"),
      );
      expect(cid.files).toEqual(car.files);
      const narrow = car.store.scope({ bytes: 8 });
      try {
        await expect(
          loadBrowserTask(narrow, { cid: fixture.cid }),
        ).rejects.toThrow();
        await expect(
          loadBrowserTask(narrow, { car: fixture.car }),
        ).rejects.toThrow();
      } finally {
        await narrow.close();
      }
      expect(() => car.parameters({ text: 3 })).toThrow();
      expect(car.parameters({ text: "hello" }).data).toEqual({ text: "hello" });
    } finally {
      await cid.close();
      await car.close();
      await shared.close();
    }
  });
  it("validates results at a single commit point and separates completed launch cancellation from app close", async () => {
    const fixture = await taskFixture();
    const shared = IpfsStore.fromClient({
      block: {
        get: () => {
          throw new Error("offline");
        },
      },
    });
    const task = await loadBrowserTask(shared, { car: fixture.car });
    const call = new TaskInvocation(task, task.parameters({ text: "hello" }));
    try {
      expect(() => call.complete(encodeReferences(3))).toThrow();
      expect(() => call.complete({ data: () => {}, cidPaths: [] })).toThrow();
      expect(call.state).toBe("starting");
      expect(call.complete(encodeReferences("started")).data).toBe("started");
      expect(call.state).toBe("completed");
      expect(await call.cancel()).toBe(false);
      expect(call.signal.aborted).toBe(false);
      await call.close();
      await call.close();
      expect(call.state).toBe("completed");
      expect(call.signal.aborted).toBe(false);
      await expect(
        call.request({ operation: "readContent", cid: task.cid }),
      ).rejects.toMatchObject({ code: "run_finished" });
    } finally {
      await call.close();
      await task.close();
      await shared.close();
    }
  });
  it("provides scoped real content reads/resolution and explicit unsupported failures", async () => {
    const fixture = await taskFixture();
    const shared = IpfsStore.fromClient({
      block: {
        get: () => {
          throw new Error("offline");
        },
      },
    });
    const task = await loadBrowserTask(shared, { car: fixture.car });
    const call = new TaskInvocation(task, task.parameters({ text: "hello" }));
    try {
      const cid = (await call.request({
        operation: "resolveContent",
        cid: task.cid,
        path: "resources/note.txt",
      })) as string;
      const node = (await call.request({ operation: "readContent", cid })) as {
        kind: string;
        bytes: Uint8Array;
      };
      expect(node.kind).toBe("file");
      expect(new TextDecoder().decode(node.bytes)).toBe(
        "actual bundled resource",
      );
      const directory = (await call.request({
        operation: "readContent",
        cid: task.cid,
      })) as { kind: string; entries: unknown[] };
      expect(directory.kind).toBe("directory");
      expect(directory.entries.length).toBeGreaterThan(0);
      await expect(
        call.request({
          operation: "resolveContent",
          cid: task.cid,
          path: "../secret",
        }),
      ).rejects.toThrow();
      await expect(
        call.request({
          operation: "readContent",
          cid: ContentRef.fromCID(cid).cid.toString().replace(/.$/u, "a"),
        }),
      ).rejects.toThrow();
      await expect(
        call.request({ operation: "putContent" }),
      ).rejects.toMatchObject({ code: "unsupported_capability" });
      expect(await call.cancel()).toBe(true);
      expect(call.signal.aborted).toBe(true);
      expect(() => call.complete(encodeReferences("late"))).toThrow();
    } finally {
      await call.close();
      await task.close();
      await shared.close();
    }
  });
  it("rejects node bundles, incomplete CAR and corrupted blocks without falling back to legacy renderers", async () => {
    const node = await taskFixture(undefined, undefined, {
      type: "node",
      minVersion: "22.15.0",
    });
    const good = await taskFixture();
    const legacy = await rendererFixture();
    const shared = IpfsStore.fromClient({
      block: {
        get: () => {
          throw new Error("offline");
        },
      },
    });
    try {
      await expect(
        loadBrowserTask(shared, { car: node.car }),
      ).rejects.toMatchObject({ code: "unsupported_runtime" });
      await expect(
        loadBrowserTask(shared, { car: legacy.car }),
      ).rejects.toThrow();
      await expect(
        loadBrowserTask(shared, { car: good.car.slice(0, -20) }),
      ).rejects.toThrow();
      const corrupt = good.car.slice();
      corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1;
      await expect(loadBrowserTask(shared, { car: corrupt })).rejects.toThrow();
      await expect(
        loadBrowserTask(shared, { cid: good.cid }),
      ).rejects.toThrow();
      await expect(
        loadBrowserTask(shared, { car: good.car }, AbortSignal.abort()),
      ).rejects.toThrow();
    } finally {
      await legacy.store.close();
      await shared.close();
    }
  });
  it("preserves imported child DAG identities in the real parent CAR and scopes result references", async () => {
    const childFixture = await taskFixture();
    const shared = IpfsStore.fromClient({
      block: {
        get: () => {
          throw new Error("offline");
        },
      },
    });
    const child = await loadBrowserTask(shared, { car: childFixture.car });
    const tree = await buildTaskBundle(
      memoryTree(
        new Map([["main.js", Buffer.from("export default async () => null;")]]),
      ),
      {
        name: "browser parent",
        runtime: { type: "browser" },
        source: {
          entry: "main.js",
          contract: {
            parameters: { type: "object" },
            result: ContentRefSchema(),
            message: false,
          },
        },
        imports: { "resources/tasks/child": child.cid },
        content: child.store,
      },
    );
    const encoded = await encodeTaskBundleCar(tree);
    const car = new Uint8Array(
      await new Response(encoded.stream).arrayBuffer(),
    );
    await encoded.close();
    await child.close();
    const task = await loadBrowserTask(shared, { car });
    const call = new TaskInvocation(task, task.parameters({}));
    try {
      const imported = await call.request({
        operation: "resolveContent",
        cid: task.cid,
        path: "resources/tasks/child",
      });
      expect(imported).toBe(childFixture.cid);
      expect(() =>
        call.complete(
          encodeReferences(
            ContentRef.fromCID(
              "bafkreigh2akiscaildc4n3xx6fjzfqavpxq3vbjrtx6w6xi2y7xyub5b4q",
            ),
          ),
        ),
      ).toThrow("unapproved");
      const resource = (await call.request({
        operation: "resolveContent",
        cid: childFixture.cid,
        path: "resources/note.txt",
      })) as string;
      const read = (await call.request({
        operation: "readContent",
        cid: resource,
      })) as { bytes: Uint8Array };
      expect(new TextDecoder().decode(read.bytes)).toBe(
        "actual bundled resource",
      );
      expect(
        call.complete(encodeReferences(ContentRef.fromCID(resource))).cidPaths,
      ).toEqual(["$"]);
    } finally {
      await call.close();
      await task.close();
      await shared.close();
    }
  });
  it("cancels individual content operations without cancelling startup and bounds parallel reads", async () => {
    const fixture = await taskFixture();
    const shared = IpfsStore.fromClient({
      block: {
        get: () => {
          throw new Error("offline");
        },
      },
    });
    const task = await loadBrowserTask(shared, { car: fixture.car });
    const scoped = task.store.scope();
    const scope = vi.spyOn(task.store, "scope").mockReturnValue(scoped);
    const signals: AbortSignal[] = [];
    vi.spyOn(scoped, "readContent").mockImplementation((_cid, options) => {
      const signal = options!.signal!;
      signals.push(signal);
      return Promise.resolve({
        kind: "file",
        content: new ReadableStream<Uint8Array>({
          start(controller) {
            signal.addEventListener(
              "abort",
              () => {
                controller.error(new DOMException("cancelled", "AbortError"));
              },
              { once: true },
            );
          },
        }),
      });
    });
    const call = new TaskInvocation(task, task.parameters({ text: "hello" }));
    try {
      const pending = Array.from({ length: 8 }, (_value, index) =>
        call
          .request({ operation: "readContent", cid: task.cid, id: index })
          .catch((error: unknown) => error),
      );
      await vi.waitFor(() => {
        expect(signals).toHaveLength(8);
      });
      await expect(
        call.request({ operation: "readContent", cid: task.cid, id: 8 }),
      ).rejects.toMatchObject({ code: "capacity_exceeded" });
      expect(call.cancelContent(0)).toBe(true);
      expect(await pending[0]).toBeInstanceOf(Error);
      expect(call.signal.aborted).toBe(false);
      expect(call.cancelContent(999)).toBe(false);
      await expect(
        call.request({ operation: "readContent", cid: task.cid, id: 1 }),
      ).rejects.toMatchObject({ code: "invalid_request" });
      await expect(
        call.request({
          operation: "resolveContent",
          cid: task.cid,
          path: "resources/note.txt",
          id: 9,
        }),
      ).resolves.toBeTypeOf("string");
      await call.cancel();
      expect(
        (await Promise.all(pending)).every((value) => value instanceof Error),
      ).toBe(true);
    } finally {
      scope.mockRestore();
      await call.close();
      await task.close();
      await shared.close();
    }
  });
  it("serves authenticated Task startup and updates separately from HTTP listening, cancellation and app close", async () => {
    const fixture = await taskFixture();
    const directory = await fixtureDirectory();
    const path = join(directory.directory, "raw.yaml");
    const shared = IpfsStore.fromClient({
      block: {
        get: () => {
          throw new Error("offline");
        },
      },
    });
    const abort = new AbortController();
    await writeFile(path, "text: first");
    const logs: string[] = [];
    const preview = await startPreview({
      path,
      store: shared,
      configuration: { version: 1, renderers: {} },
      task: { car: fixture.car },
      signal: abort.signal,
      diagnostic: (message) => {
        logs.push(message);
      },
      pollMs: 10,
    });
    const url = new URL(preview.url);
    const token = url.hash.slice(1);
    const session = randomUUID();
    const response = await fetch(new URL("/events", url), {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-IPFSAW-Session": session,
      },
    });
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = "";
    const next = async () => {
      for (;;) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary !== -1) {
          const value = JSON.parse(buffer.slice(6, boundary)) as {
            type: string;
            revision: number;
            parameters?: { data: unknown };
          };
          buffer = buffer.slice(boundary + 2);
          return value;
        }
        buffer += (await reader.read()).value ?? "";
      }
    };
    const post = async (
      operation: string,
      revision: number,
      extra: Record<string, unknown> = {},
    ) => {
      const result = await fetch(new URL("/call", url), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ operation, session, revision, ...extra }),
      });
      return result.json() as Promise<{
        ok: boolean;
        data: unknown;
        error?: { code: string };
      }>;
    };
    try {
      expect(preview.bundleCid).toBe(fixture.cid);
      expect(logs.join(" ")).not.toContain("startup completed");
      expect(
        (await fetch(new URL("/call", url), { method: "POST" })).status,
      ).toBe(403);
      expect(
        (
          await fetch(new URL("/events", url), {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(new URL("/call", url), {
            method: "POST",
            headers: { Origin: "null", Authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(403);
      expect((await fetch(new URL("/task-runtime.js", url))).status).toBe(200);
      expect(
        (
          await fetch(new URL("/task-runtime.js", url), {
            headers: { Origin: "null" },
          })
        ).status,
      ).toBe(200);
      const page = await (await fetch(url.origin)).text();
      expect(page).not.toContain("first");
      expect(page).not.toContain(token);
      expect(page).toContain("Cancel startup");
      const frame = await fetch(new URL("/frame", url));
      expect(frame.headers.get("content-security-policy")).toContain(
        "style-src 'nonce-",
      );
      const frameHtml = await frame.text();
      expect(frameHtml).toContain('type="module"');
      expect(frameHtml).not.toContain('id="app"');
      expect(
        (await fetch(new URL(`/assets/${fixture.cid}/main.mjs`, url))).status,
      ).toBe(200);
      expect(
        (await fetch(new URL(`/assets/${fixture.cid}/task.yaml`, url))).status,
      ).toBe(200);
      expect(
        (await fetch(new URL("/assets/foreign/main.mjs", url))).status,
      ).toBe(404);
      const first = await next();
      expect(first.type).toBe("task");
      expect(first.parameters?.data).toEqual({ text: "first" });
      expect((await post("start", first.revision)).ok).toBe(true);
      expect((await post("start", first.revision)).ok).toBe(false);
      expect(
        (await post("cancelContent", first.revision, { requestId: 999 })).data,
      ).toBe(false);
      const resolved = await post("resolveContent", first.revision, {
        cid: fixture.cid,
        path: "resources/note.txt",
      });
      expect(resolved.ok).toBe(true);
      const content = await post("readContent", first.revision, {
        cid: resolved.data,
      });
      expect(content.data).toMatchObject({
        kind: "file",
        bytes: {
          base64: Buffer.from("actual bundled resource").toString("base64"),
        },
      });
      expect((await post("putContent", first.revision)).error?.code).toBe(
        "unsupported_capability",
      );
      expect(
        (
          await post("complete", first.revision, {
            payload: encodeReferences(23),
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await post("complete", first.revision, {
            payload: encodeReferences("started"),
          })
        ).ok,
      ).toBe(true);
      expect((await post("cancel", first.revision)).data).toBe(false);
      expect(logs.join(" ")).toContain("startup completed");
      expect((await post("close", first.revision)).ok).toBe(true);
      expect((await post("close", first.revision)).ok).toBe(true);
      await writeFile(path, "text: second");
      expect((await next()).type).toBe("loading");
      const second = await next();
      expect(second.parameters?.data).toEqual({ text: "second" });
      expect((await post("start", first.revision)).ok).toBe(false);
      expect((await post("cancel", second.revision)).data).toBe(true);
      expect((await post("start", second.revision)).ok).toBe(false);
      await writeFile(path, "text: 3");
      expect((await next()).type).toBe("loading");
      expect((await next()).type).toBe("error");
      const stable = logs.length;
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(logs).toHaveLength(stable);
      await rm(path);
      expect((await next()).type).toBe("error");
      const replacement = join(directory.directory, "replacement.yaml");
      await writeFile(replacement, "text: recovered");
      await rename(replacement, path);
      expect((await next()).type).toBe("loading");
      const recovered = await next();
      expect(recovered.parameters?.data).toEqual({ text: "recovered" });
      expect((await post("start", recovered.revision)).ok).toBe(true);
      expect((await post("fail", recovered.revision)).ok).toBe(true);
      expect(
        (await post("readContent", recovered.revision, { cid: fixture.cid }))
          .error?.code,
      ).toBe("run_finished");
      await vi.waitFor(() => {
        expect(logs.join(" ")).toContain("startup failed");
      });
    } finally {
      await reader.cancel();
      abort.abort();
      await preview.close();
      await preview.close();
      await shared.close();
      await directory.cleanup();
    }
    await expect(fetch(url.origin)).rejects.toThrow();
  });
});
