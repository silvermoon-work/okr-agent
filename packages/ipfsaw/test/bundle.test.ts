import { CarWriter } from "@ipld/car";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { describe, expect, it } from "vitest";
import {
  assetPath,
  importRendererCar,
  loadRenderer,
  mime,
  packRenderer,
  validateFiles,
} from "../src/bundle.js";
import { limits } from "../src/document.js";
import {
  rendererFiles,
  rendererFixture,
  fixtureDirectory,
  rawDirectory,
} from "./helpers.js";
import { join } from "node:path";

describe("generic immutable renderer directories", () => {
  it("packs real self-contained UnixFS/CAR, imports through public Store and never executes JS in Node", async () => {
    const fixture = await fixtureDirectory();
    const packed = await packRenderer(
      rendererFiles("throw new Error('must never execute in Node')"),
    );
    const store = new IpfsStore({
      backend: "local",
      dataDir: join(fixture.directory, "content"),
    });
    try {
      const loaded = await importRendererCar(store, packed.car);
      expect(loaded.cid).toBe(packed.cid);
      expect(loaded.manifest.styles).toEqual([]);
      expect(
        new TextDecoder().decode(loaded.files.get("renderer.js")),
      ).toContain("must never execute");
      expect(
        (
          await packRenderer(
            rendererFiles("throw new Error('must never execute in Node')"),
          )
        ).cid,
      ).toBe(packed.cid);
    } finally {
      await store.close();
      await fixture.cleanup();
    }
  });
  it("rejects missing/wrong blocks and respects stricter caller-owned Store budgets", async () => {
    const fixture = await rendererFixture();
    try {
      const strict = fixture.store.scope({ bytes: 1 });
      try {
        await expect(loadRenderer(strict, fixture.cid)).rejects.toThrow();
      } finally {
        await strict.close();
      }
      const empty = IpfsStore.fromClient({
        block: { get: () => Promise.resolve(Buffer.from("not requested CID")) },
      });
      try {
        await expect(loadRenderer(empty, fixture.cid)).rejects.toThrow();
      } finally {
        await empty.close();
      }
      fixture.blocks.clear();
      await expect(loadRenderer(fixture.store, fixture.cid)).rejects.toThrow();
      await expect(
        importRendererCar(
          fixture.store,
          new Uint8Array(limits.renderer * 2 + 1),
        ),
      ).rejects.toThrow("import limit");
      await expect(
        importRendererCar(fixture.store, Buffer.from("not a car")),
      ).rejects.toThrow();
      const { writer, out } = CarWriter.create([]);
      const read = (async () => {
        const parts: Uint8Array[] = [];
        for await (const part of out) parts.push(part);
        return Buffer.concat(parts);
      })();
      await writer.close();
      await expect(
        importRendererCar(fixture.store, await read),
      ).rejects.toThrow("one renderer CAR root");
    } finally {
      await fixture.store.close();
    }
  });
  it("validates safe asset paths, declared MIME and manifest structure", () => {
    expect(assetPath("assets/font.woff2")).toBe("assets/font.woff2");
    expect(mime("font.woff2")).toBe("font/woff2");
    for (const path of [
      "",
      "/a.js",
      "../a.js",
      "a/../b.js",
      "a\\b.js",
      "https://e/a.js",
      "a%2fb.js",
      "a.js?q",
      "a\0.js",
      "a//b.js",
    ])
      expect(() => assetPath(path)).toThrow("unsafe");
    expect(() => mime("a.html")).toThrow("MIME");
    const files = rendererFiles();
    files.delete("ipfsaw.renderer.json");
    expect(() => validateFiles(files)).toThrow("missing");
    for (const manifest of [
      "{",
      JSON.stringify({ protocol: "wrong", entry: "renderer.js", styles: [] }),
      JSON.stringify({
        protocol: "ipfsaw-renderer/v1",
        entry: "renderer.js",
        styles: [],
        extra: true,
      }),
      JSON.stringify({
        protocol: "ipfsaw-renderer/v1",
        entry: "renderer.js",
        styles: [1],
      }),
      JSON.stringify({
        protocol: "ipfsaw-renderer/v1",
        entry: "a.css",
        styles: [],
      }),
      JSON.stringify({
        protocol: "ipfsaw-renderer/v1",
        entry: "renderer.js",
        styles: ["renderer.js"],
      }),
      JSON.stringify({
        protocol: "ipfsaw-renderer/v1",
        entry: "missing.js",
        styles: [],
      }),
    ]) {
      files.set("ipfsaw.renderer.json", Buffer.from(manifest));
      expect(() => validateFiles(files)).toThrow();
    }
    files.set(
      "ipfsaw.renderer.json",
      Buffer.from(
        JSON.stringify({
          protocol: "ipfsaw-renderer/v1",
          entry: "renderer.js",
          styles: ["assets/style.css"],
        }),
      ),
    );
    files.set("assets/style.css", Buffer.from("body{color:navy}"));
    expect(validateFiles(files).styles).toEqual(["assets/style.css"]);
  });
  it("enforces manifest, logical bytes and file count at the threshold and +1", () => {
    const files = rendererFiles();
    const manifest = files.get("ipfsaw.renderer.json")!;
    files.set(
      "ipfsaw.renderer.json",
      Buffer.concat([
        manifest,
        Buffer.alloc(limits.manifest - manifest.length, 32),
      ]),
    );
    expect(validateFiles(files).entry).toBe("renderer.js");
    files.set(
      "ipfsaw.renderer.json",
      Buffer.concat([files.get("ipfsaw.renderer.json")!, Buffer.of(32)]),
    );
    expect(() => validateFiles(files)).toThrow("64 KiB");
    files.set("ipfsaw.renderer.json", manifest);
    const overhead = [...files.values()].reduce(
      (sum, value) => sum + value.length,
      0,
    );
    files.set("large.txt", Buffer.alloc(limits.renderer - overhead));
    expect(validateFiles(files).entry).toBe("renderer.js");
    files.set("large.txt", Buffer.alloc(limits.renderer - overhead + 1));
    expect(() => validateFiles(files)).toThrow("16 MiB");
    files.delete("large.txt");
    for (let index = files.size; index < limits.files; index++)
      files.set(`${String(index)}.js`, Buffer.alloc(0));
    expect(validateFiles(files).styles).toEqual([]);
    files.set("overflow.js", Buffer.alloc(0));
    expect(() => validateFiles(files)).toThrow("2048");
  });
  it("rejects malformed real UnixFS directories, missing manifest/assets and file roots", async () => {
    const invalid = [
      new Map([["renderer.js", Buffer.from("export default {}")]]),
      new Map([
        ["ipfsaw.renderer.json", rendererFiles().get("ipfsaw.renderer.json")!],
      ]),
      new Map([
        ...rendererFiles(),
        ["unexpected.html", Buffer.from("<script>bad</script>")],
      ]),
      new Map([
        ...rendererFiles(),
        ["a/".repeat(102) + "deep.js", Buffer.alloc(0)],
      ]),
    ];
    for (const files of invalid) {
      const fixture = await rawDirectory(files);
      try {
        await expect(
          loadRenderer(fixture.store, fixture.cid),
        ).rejects.toThrow();
      } finally {
        await fixture.store.close();
      }
    }
    const file = await rawDirectory(
      new Map([["renderer.js", Buffer.from("export default {}")]]),
      false,
    );
    try {
      await expect(loadRenderer(file.store, file.cid)).rejects.toThrow(
        "directory",
      );
    } finally {
      await file.store.close();
    }
    const files = rendererFiles();
    const manifest = files.get("ipfsaw.renderer.json")!;
    files.set(
      "ipfsaw.renderer.json",
      Buffer.concat([
        manifest,
        Buffer.alloc(limits.manifest - manifest.length, 32),
      ]),
    );
    const exact = await rawDirectory(files);
    try {
      expect((await loadRenderer(exact.store, exact.cid)).manifest.entry).toBe(
        "renderer.js",
      );
    } finally {
      await exact.store.close();
    }
    files.set(
      "ipfsaw.renderer.json",
      Buffer.concat([files.get("ipfsaw.renderer.json")!, Buffer.of(32)]),
    );
    const oversized = await rawDirectory(files);
    try {
      await expect(
        loadRenderer(oversized.store, oversized.cid),
      ).rejects.toThrow("content limit");
    } finally {
      await oversized.store.close();
    }
  });
  it("refuses CAR imports into a Kubo backend before any remote operation", async () => {
    const remote = new IpfsStore({
      backend: "kubo",
      apiUrl: "http://127.0.0.1:1",
    });
    try {
      await expect(importRendererCar(remote, Buffer.alloc(0))).rejects.toThrow(
        "local Store",
      );
    } finally {
      await remote.close();
    }
  });
});
