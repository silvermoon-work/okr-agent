import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { inspect } from "../src/inspect.js";
import { publicMetadata } from "../src/metadata.js";
import { fixture, npmFixture, manifest, put, testEvidence } from "./fixture.js";
import { npmxTransport } from "./metadata-http-fixture.js";

it.each(["application", "npm", "format-alias"] as const)(
  "can pass %s using the real production metadata parser with complete fresh HTTP evidence",
  async (kind) => {
    const root = resolve("dist", `.production-metadata-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(npmxTransport());
    try {
      if (kind === "npm") await npmFixture(root);
      else await fixture(root);
      if (kind === "format-alias")
        await put(root, "package.json", {
          ...manifest,
          scripts: {
            ...manifest.scripts,
            "format:check": "prettier -c .",
            format: "prettier -w .",
          },
        });
      const signal = new AbortController().signal;
      const problems: string[] = [];
      await inspect(
        { projectDirectory: root },
        signal,
        (code) => {
          problems.push(code);
        },
        { ...(await testEvidence()), metadata: publicMetadata(signal) },
      );
      expect(problems).toEqual([]);
      expect(
        fetcher.mock.calls.some(([url]) => String(url).includes("/timeline/")),
      ).toBe(true);
      expect(
        fetcher.mock.calls.some(([url]) => String(url).includes("/packument/")),
      ).toBe(true);
      expect(
        fetcher.mock.calls.some(([url]) =>
          /registry\.npmjs\.org|cloud\.tencent\.com/.test(String(url)),
        ),
      ).toBe(false);
    } finally {
      fetcher.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  },
);
