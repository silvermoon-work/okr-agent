import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { inspect } from "../src/inspect.js";
import { publicMetadata } from "../src/metadata.js";
import type { NodeFacts } from "../src/metadata.js";
import { fixture, npmFixture, put, testEvidence } from "./fixture.js";
import { canonicalTransport, requestUrl } from "./metadata-http-fixture.js";

it.each(["application", "npm", "normalized-format"] as const)(
  "can pass %s through the canonical-v1 parser with mocked fresh HTTP, not live local requests",
  async (kind) => {
    const root = resolve("dist", `.production-metadata-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(canonicalTransport());
    try {
      if (kind === "npm") await npmFixture(root);
      else await fixture(root);
      if (kind === "normalized-format")
        await put(
          root,
          "scripts/format-check.mjs",
          Buffer.from((await testEvidence()).scripts["format-check"]!)
            .toString("utf8")
            .replace(/\n/g, "\r\n"),
        );
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
        fetcher.mock.calls.some(([url]) =>
          requestUrl(url).startsWith("https://registry.npmjs.org/"),
        ),
      ).toBe(true);
      expect(
        fetcher.mock.calls.some(([url]) =>
          requestUrl(url).startsWith("https://api.github.com/"),
        ),
      ).toBe(true);
      expect(
        fetcher.mock.calls.some(([url]) =>
          /npmx\.dev|cloud\.tencent\.com/.test(requestUrl(url)),
        ),
      ).toBe(false);
    } finally {
      fetcher.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it.each([
  "supported",
  "eol",
  "missing-release",
  "supported-with-prereleases",
  "chosen-prerelease",
  "malformed-history",
] as const)(
  "uses fresh official index and lifecycle facts: %s",
  async (kind) => {
    const root = resolve("dist", `.production-lifecycle-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const node: Partial<NodeFacts> =
      kind === "eol"
        ? { schedule: { v24: { lts: "2025-01-01", end: "2026-01-01" } } }
        : kind === "missing-release"
          ? { releases: [{ version: "v22.15.0", lts: "Jod" }] }
          : kind === "supported-with-prereleases" ||
              kind === "chosen-prerelease"
            ? {
                releases: [
                  { version: "v24.11.0", lts: "Krypton" },
                  { version: "v27.0.0-alpha.0.1.0", lts: false },
                  { version: "v27.0.0-alpha.0.0.0", lts: false },
                ],
              }
            : kind === "malformed-history"
              ? { releases: [{ version: "v27.bad-alpha", lts: false }] }
              : {};
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(canonicalTransport(undefined, node));
    try {
      await fixture(root);
      if (kind === "chosen-prerelease")
        await put(root, ".node-version", "27.0.0-alpha.0.1.0");
      const signal = new AbortController().signal;
      const problems: { code: string; brief: string }[] = [];
      await inspect(
        { projectDirectory: root },
        signal,
        (code, brief) => problems.push({ code, brief }),
        { ...(await testEvidence()), metadata: publicMetadata(signal) },
      );
      if (kind === "supported" || kind === "supported-with-prereleases")
        expect(problems).toEqual([]);
      else if (kind === "eol" || kind === "chosen-prerelease")
        expect(problems).toContainEqual(
          expect.objectContaining({ code: "environment-mismatch" }),
        );
      else
        expect(problems).toContainEqual(
          expect.objectContaining({
            code: "environment-unconfirmed",
            brief: expect.stringContaining(
              kind === "malformed-history"
                ? "历史发行记录缺项"
                : "官方发行列表不能确认",
            ) as unknown,
          }),
        );
    } finally {
      fetcher.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  },
);
