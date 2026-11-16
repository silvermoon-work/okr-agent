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
  it("uses the public configured Store, emits once, and awaits HTTP/Store teardown on SIGTERM", async () => {
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
        renderers: { "urn:fixture:1": renderer.cid },
      }),
    );
    const document = join(directory.directory, "doc.json");
    await writeFile(
      document,
      '{"$schema":"urn:fixture:1","title":"controlled"}',
    );
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
        data: { url: string; rendererCid: string };
      };
      expect(result.ok).toBe(true);
      expect(result.data.rendererCid).toBe(renderer.cid);
      expect((await fetch(new URL("/", result.data.url))).status).toBe(200);
      expect(stderr).not.toContain(new URL(result.data.url).hash.slice(1));
      process.emit("SIGTERM");
      expect(await running).toBe(143);
      expect(stdout.trim().split("\n")).toHaveLength(1);
      await expect(fetch(new URL("/", result.data.url))).rejects.toThrow();
    } finally {
      process.emit("SIGTERM");
      await running;
      await directory.cleanup();
    }
  });
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
