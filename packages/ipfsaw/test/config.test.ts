import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  configPath,
  dataDirectory,
  readConfiguration,
  rootCid,
  aliasName,
  viewerLocation,
  writeConfiguration,
} from "../src/configuration.js";
import { fixtureDirectory, rendererFixture } from "./helpers.js";

describe("versioned local configuration", () => {
  it("uses platform config preferences without reading IPFS configuration", () => {
    vi.stubEnv("IPFSAW_DATA_DIR", "controlled-config");
    expect(configPath()).toBe(join(dataDirectory(), "config.json"));
    expect(configPath()).toContain("controlled-config");
    expect(dataDirectory("explicit")).not.toContain("controlled-config");
    for (const path of ["", " ", "bad\0path"])
      expect(() => dataDirectory(path)).toThrow("nonempty");
    vi.stubEnv("IPFSAW_DATA_DIR", "");
    expect(() => dataDirectory()).toThrow("nonempty");
    expect(dataDirectory("explicit")).toContain("explicit");
    delete process.env.IPFSAW_DATA_DIR;
    expect(configPath()).toContain(join(".silvermoon.work", "ipfsaw"));
    if (process.platform === "win32")
      expect(() => dataDirectory("bad?directory")).toThrow("invalid path");
    vi.unstubAllEnvs();
  });
  it("normalizes bare CIDs, not URL/path/foreign codecs", async () => {
    const fixture = await rendererFixture();
    try {
      expect(rootCid(fixture.cid)).toBe(fixture.cid);
      expect(rootCid("QmYwAPJzv5CZsnAzt8auVTLg8KEq4AaKjY6LYnkJqnwSev")).toMatch(
        /^bafy/,
      );
      for (const value of [
        "bad",
        `${fixture.cid}/file.js`,
        `ipfs://${fixture.cid}`,
        "http://example.test",
      ])
        expect(() => rootCid(value)).toThrow("root CID");
    } finally {
      await fixture.store.close();
    }
  });
  it("reads missing as empty, validates existing files and preserves valid settings in atomic writes", async () => {
    const fixture = await fixtureDirectory();
    const renderer = await rendererFixture();
    const path = join(fixture.directory, "nested", "config.json");
    try {
      expect(await readConfiguration(path)).toEqual({
        version: 1,
        aliases: {},
      });
      await writeConfiguration(path, {
        version: 1,
        openBrowser: false,
        aliases: { test: { cid: renderer.cid } },
      });
      const config = await readConfiguration(path);
      config.aliases.second = { cid: renderer.cid };
      await writeConfiguration(path, config);
      expect((await readConfiguration(path)).openBrowser).toBe(false);
      expect(await readdir(join(fixture.directory, "nested"))).toEqual([
        "config.json",
      ]);
      for (const value of [
        "{",
        "null",
        '{"version":2,"aliases":{}}',
        '{"version":1,"aliases":[]}',
        '{"version":1,"aliases":{},"openBrowser":1}',
        '{"version":1,"aliases":{},"ipfs":{}}',
        '{"version":1,"aliases":{"bad":{"cid":"bad"}}}',
        '{"version":1,"aliases":{"urn:x":3}}',
        '{"version":1,"renderers":{}}',
        '{"version":1,"aliases":{"local":{"car":"not-a-path"}}}',
        '{"version":1,"aliases":{"local":{"car":"file.car","cid":"bad"}}}',
      ]) {
        await writeFile(path, value);
        await expect(readConfiguration(path)).rejects.toThrow("Invalid ipfsaw");
        expect(await readFile(path, "utf8")).toBe(value);
      }
      await writeFile(path, "x".repeat(1024 * 1024 + 1));
      await expect(readConfiguration(path)).rejects.toThrow("Cannot read");
      await expect(
        writeConfiguration(path, {
          version: 1,
          aliases: { huge: { car: "x".repeat(1024 * 1024) } },
        }),
      ).rejects.toThrow("1 MiB");
    } finally {
      await renderer.store.close();
      await fixture.cleanup();
    }
  });
  it("leaves old files intact and removes temporary files after write/replace/cancellation failure", async () => {
    const fixture = await fixtureDirectory();
    const path = join(fixture.directory, "config.json");
    const config = { version: 1 as const, aliases: {} };
    try {
      await writeFile(path, "preserve");
      const abort = new AbortController();
      abort.abort();
      await expect(
        writeConfiguration(path, config, abort.signal),
      ).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe("preserve");
      const target = join(fixture.directory, "directory");
      await mkdir(target);
      await expect(writeConfiguration(target, config)).rejects.toThrow();
      expect((await readdir(fixture.directory)).sort()).toEqual([
        "config.json",
        "directory",
      ]);
      await expect(readConfiguration(target)).rejects.toThrow("Cannot read");
    } finally {
      await fixture.cleanup();
    }
  });
  it("distinguishes immutable CIDs, explicit CAR paths and exact aliases without filesystem guessing", async () => {
    const fixture = await fixtureDirectory();
    const renderer = await rendererFixture();
    try {
      expect(viewerLocation(renderer.cid)).toEqual({ cid: renderer.cid });
      expect(viewerLocation("viewer.CAR", fixture.directory)).toEqual({
        car: join(fixture.directory, "viewer.CAR"),
      });
      expect(viewerLocation("./viewer", fixture.directory)).toEqual({
        car: join(fixture.directory, "viewer"),
      });
      expect(viewerLocation("events")).toBeUndefined();
      expect(aliasName("events_v1")).toBe("events_v1");
      for (const name of [
        "",
        "urn:test:1",
        "../viewer",
        "viewer.car",
        renderer.cid,
      ])
        expect(() => aliasName(name)).toThrow();
      for (const selector of [" ", "nul\0path"])
        expect(() => viewerLocation(selector)).toThrow();
      await writeConfiguration(configPath(fixture.directory), {
        version: 1,
        aliases: { local: { car: "./viewer.car" } },
      });
      expect(
        (await readConfiguration(configPath(fixture.directory))).aliases.local,
      ).toEqual({
        car: join(fixture.directory, "viewer.car"),
      });
    } finally {
      await renderer.store.close();
      await fixture.cleanup();
    }
  });
});
