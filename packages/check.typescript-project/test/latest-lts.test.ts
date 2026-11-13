import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { inspect } from "../src/inspect.js";
import { publicMetadata, type NodeFacts } from "../src/metadata.js";
import { fixture, put, testEvidence } from "./fixture.js";
import { canonicalTransport, requestUrl } from "./metadata-http-fixture.js";

it.each([
  "latest",
  "older-patch",
  "older-lts",
  "expired-index",
  "conflicting-index",
  "conflicting-schedule",
  "index-unavailable",
] as const)(
  "selects only the highest supported official stable LTS with fresh evidence: %s",
  async (kind) => {
    const root = resolve("dist", `.latest-lts-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    const node: Partial<NodeFacts> = {
      releases: [
        { version: "v27.0.0", lts: false },
        { version: "v24.11.1", lts: "Krypton" },
        { version: "v24.11.0", lts: "Krypton" },
        { version: "v22.15.0", lts: "Jod" },
      ],
    };
    if (kind === "conflicting-index")
      node.releases!.push({ version: "v24.11.1", lts: false });
    if (kind === "conflicting-schedule")
      node.schedule = {
        v24: { lts: "2100-01-01", end: "2101-01-01" },
        v22: { lts: "2024-10-29", end: "2027-04-30" },
      };
    const transport = canonicalTransport(undefined, node);
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        if (requestUrl(input) === "https://nodejs.org/dist/index.json") {
          if (kind === "index-unavailable")
            throw new TypeError("index unavailable");
          const response = await transport(input);
          if (kind === "expired-index") response.headers.set("age", "3601");
          return response;
        }
        return transport(input);
      });
    try {
      await fixture(root);
      const selected =
        kind === "older-patch"
          ? "24.11.0"
          : kind === "older-lts"
            ? "22.15.0"
            : "24.11.1";
      await put(root, ".node-version", selected);
      const signal = new AbortController().signal;
      const problems: { code: string; brief: string }[] = [];
      await inspect(
        { projectDirectory: root },
        signal,
        (code, brief) => {
          problems.push({ code, brief });
        },
        { ...(await testEvidence()), metadata: publicMetadata(signal) },
      );
      if (kind === "latest") expect(problems).toEqual([]);
      else if (kind === "older-patch" || kind === "older-lts") {
        expect(problems).toEqual([
          expect.objectContaining({ code: "environment-mismatch" }),
        ]);
        expect(problems[0]?.brief).toContain(`.node-version 观察 ${selected}`);
        expect(problems[0]?.brief).toContain("发行 24.11.1");
      } else {
        expect(problems).toEqual([
          expect.objectContaining({ code: "environment-unconfirmed" }),
        ]);
        expect(problems[0]?.brief).toContain(
          "https://nodejs.org/dist/index.json",
        );
      }
    } finally {
      fetcher.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  },
);
it("preserves cancellation during latest-LTS retrieval as an execution fault", async () => {
  const root = resolve("dist", `.latest-cancel-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const controller = new AbortController();
  const reason = new Error("cancel latest LTS");
  const transport = canonicalTransport();
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    if (requestUrl(input) === "https://nodejs.org/dist/index.json") {
      controller.abort(reason);
      return Promise.reject(reason);
    }
    return transport(input);
  });
  try {
    await fixture(root);
    await expect(
      inspect({ projectDirectory: root }, controller.signal, () => undefined, {
        ...(await testEvidence()),
        metadata: publicMetadata(controller.signal),
      }),
    ).rejects.toBe(reason);
  } finally {
    fetcher.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
