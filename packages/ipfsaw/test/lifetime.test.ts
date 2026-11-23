import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { importRendererCar } from "../src/bundle.js";
import { fixtureDirectory, rendererFixture } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("real CLI with controlled local content/configuration", () => {
  it.each(["cid", "car", "alias"] as const)(
    "views JSONL using a real %s selector and awaits HTTP/Store teardown on SIGTERM",
    async (kind) => {
      const directory = await fixtureDirectory();
      const renderer = await rendererFixture();
      const content = join(directory.directory, "content");
      const store = new IpfsStore({ backend: "local", dataDir: content });
      try {
        await importRendererCar(store, renderer.car);
      } finally {
        await store.close();
        await renderer.store.close();
      }
      const contentConfig = join(directory.directory, "task-content.json");
      await writeFile(
        contentConfig,
        JSON.stringify({ backend: "local", dataDir: content }),
      );
      await writeFile(
        join(directory.directory, "config.json"),
        JSON.stringify({
          version: 1,
          openBrowser: false,
          aliases: { example: { cid: renderer.cid } },
        }),
      );
      const carPath = join(directory.directory, "viewer.car");
      await writeFile(carPath, renderer.car);
      const document = join(directory.directory, "doc.jsonl");
      await writeFile(document, '{"id":2,"title":"controlled"}\n{"id":1}\n');
      vi.stubEnv("TASK_CONTENT_CONFIG", contentConfig);
      let stdout = "",
        stderr = "";
      vi.spyOn(process.stdout, "write").mockImplementation(
        (chunk: string | Uint8Array) => {
          stdout += String(chunk);
          return true;
        },
      );
      vi.spyOn(process.stderr, "write").mockImplementation(
        (chunk: string | Uint8Array) => {
          stderr += String(chunk);
          return true;
        },
      );
      let running: Promise<number> | undefined;
      try {
        running = main([
          "view",
          kind === "cid" ? renderer.cid : kind === "car" ? carPath : "example",
          document,
          "--data-dir",
          directory.directory,
          "--no-open",
        ]);
        await vi.waitFor(() => {
          expect(stdout).toContain('"listening"');
        });
        const result = JSON.parse(stdout) as {
          ok: true;
          data: { url: string; viewerCid: string };
        };
        expect(result.ok).toBe(true);
        expect(result.data.viewerCid).toBe(renderer.cid);
        expect((await fetch(new URL("/", result.data.url))).status).toBe(200);
        expect(result.data.url).toBe(new URL(result.data.url).origin + "/");
        expect(stderr).not.toContain("controlled");
        const response = await fetch(new URL("/events", result.data.url), {
          headers: { "X-IPFSAW-Client": "browser" },
        });
        const reader = response
          .body!.pipeThrough(new TextDecoderStream())
          .getReader();
        try {
          let message = "";
          while (!message.includes("\n\n")) {
            const next = await reader.read();
            if (next.done)
              throw new Error(
                "Preview disconnected before delivering the document.",
              );
            message += next.value;
          }
          const state = JSON.parse(
            message.slice(6, message.indexOf("\n\n")),
          ) as {
            document: { records: unknown[] };
            cid: string;
          };
          expect(state.cid).toBe(renderer.cid);
          expect(state.document).toEqual({
            records: [{ id: 2, title: "controlled" }, { id: 1 }],
          });
        } finally {
          await reader.cancel();
        }
        process.emit("SIGTERM");
        expect(await running).toBe(143);
        expect(stdout.trim().split("\n")).toHaveLength(1);
        await expect(fetch(new URL("/", result.data.url))).rejects.toThrow();
      } finally {
        process.emit("SIGTERM");
        await running;
        await directory.cleanup();
      }
    },
  );
  it("does not let overrides mask invalid shared configuration and never initializes ambient content", async () => {
    const directory = await fixtureDirectory();
    try {
      const path = join(directory.directory, "task-content.json");
      await writeFile(path, '{"backend":"invalid"}');
      vi.stubEnv("TASK_CONTENT_CONFIG", path);
      let stdout = "";
      vi.spyOn(process.stdout, "write").mockImplementation(
        (chunk: string | Uint8Array) => {
          stdout += String(chunk);
          return true;
        },
      );
      vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      expect(
        await main([
          "view",
          "QmYwAPJzv5CZsnAzt8auVTLg8KEq4AaKjY6LYnkJqnwSev",
          join(directory.directory, "doc.json"),
          "--data-dir",
          directory.directory,
          "--content-data-dir",
          join(directory.directory, "content"),
          "--ipfs-gateway",
          "http://127.0.0.1:1",
        ]),
      ).toBe(1);
      expect((JSON.parse(stdout) as { ok: boolean }).ok).toBe(false);
    } finally {
      await directory.cleanup();
    }
  });
});
