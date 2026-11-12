import { afterEach, expect, it, vi } from "vitest";
import { fresh, publicMetadata } from "../src/metadata.js";
import { metadataResponse, npmxTransport } from "./metadata-http-fixture.js";

afterEach(() => vi.restoreAllMocks());
const selection = { current: "6.0.3", series: "6.x" };
it("has a usable authoritative production path using complete stable timeline and exact full manifests, not slim versions or global latest", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(
    npmxTransport({
      typescript: [
        { version: "7.0.0" },
        { version: "6.1.0", engines: { node: ">=22" } },
        { version: "6.0.3", peerDependencies: { eslint: "^10" } },
      ],
    }),
  );
  const provider = publicMetadata(new AbortController().signal);
  const [observed, cached] = await Promise.all([
    provider.package("typescript", selection),
    provider.package("typescript", selection),
  ]);
  expect(cached).toBe(observed);
  expect(observed.authoritative).toBe(true);
  const facts = fresh(observed);
  expect(facts.versions).toEqual(["7.0.0", "6.1.0", "6.0.3"]);
  expect(Object.keys(facts.releases).sort()).toEqual(["6.0.3", "6.1.0"]);
  expect(facts.releases["6.0.3"]?.peerDependencies).toEqual({ eslint: "^10" });
  expect(facts.releases["6.1.0"]?.engines).toEqual({ node: ">=22" });
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(
    fetcher.mock.calls.every(
      ([url, options]) =>
        String(url).startsWith("https://npmx.dev/api/registry/") &&
        options?.redirect === "error",
    ),
  ).toBe(true);
  expect(String(fetcher.mock.calls[0]?.[0])).toContain(
    "offset=0&limit=100&sort=semver&stable-only=true",
  );
  expect(() =>
    provider.package("https://evil.invalid/private", selection),
  ).toThrow();
});
it("fetches complete multi-page candidates even when slim manifests expose only recent versions", async () => {
  const transport = npmxTransport({
    typescript: Array.from({ length: 101 }, (_, index) => ({
      version: `6.0.${index}`,
    })),
  });
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(transport);
  const evidence = await publicMetadata(new AbortController().signal).package(
    "typescript",
    { current: "6.0.0", series: "6.x" },
  );
  expect(fresh(evidence).versions).toHaveLength(101);
  expect(fresh(evidence).releases["6.0.100"]).toEqual({ version: "6.0.100" });
  expect(
    fetcher.mock.calls.filter(([url]) => String(url).includes("offset=100")),
  ).toHaveLength(2);
});
it.each([
  "duplicate",
  "changed-total",
  "changed-second-sweep",
  "oversize",
  "missing-manifest",
  "revision-conflict",
] as const)(
  "fails unconfirmed for incomplete/inconsistent API evidence: %s",
  async (failure) => {
    const transport = npmxTransport({
      typescript: [{ version: "6.1.0" }, { version: "6.0.3" }],
    });
    let timelineCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const response = await transport(input);
      const value = (await response.json()) as Record<string, unknown>;
      const url = String(input);
      if (url.includes("/timeline/")) {
        timelineCalls++;
        if (failure === "duplicate")
          value.versions = [
            { version: "6.0.3", time: "2026-01-01" },
            { version: "6.0.3", time: "2026-01-01" },
          ];
        if (failure === "oversize") value.total = 4001;
        if (failure === "changed-total" && timelineCalls === 2) value.total = 3;
        if (failure === "changed-second-sweep" && timelineCalls === 2)
          value.versions = [
            { version: "6.1.0", time: "2026-01-02" },
            { version: "6.0.3", time: "2026-01-01" },
          ];
      } else {
        if (failure === "missing-manifest") delete value.requestedVersion;
        if (failure === "revision-conflict" && url.includes("version=6.1.0"))
          value._rev = "2-different";
      }
      return metadataResponse(value);
    });
    await expect(
      publicMetadata(new AbortController().signal).package(
        "typescript",
        selection,
      ),
    ).rejects.toThrow();
  },
);
it("never falls back to a mirror, official npm, slim snapshot or stale cache after source errors", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(metadataResponse({ total: 0, offset: 0, versions: [] }));
  await expect(
    publicMetadata(new AbortController().signal).package(
      "typescript",
      selection,
    ),
  ).rejects.toThrow("不完整");
  fetcher.mockResolvedValue(metadataResponse({}, { age: "301" }));
  await expect(
    publicMetadata(new AbortController().signal).package(
      "typescript",
      selection,
    ),
  ).rejects.toThrow("新鲜度");
  fetcher.mockResolvedValue(metadataResponse({}, { "x-nitro-cache": "STALE" }));
  await expect(
    publicMetadata(new AbortController().signal).package(
      "typescript",
      selection,
    ),
  ).rejects.toThrow("陈旧");
  expect(
    fetcher.mock.calls.every(([url]) =>
      String(url).startsWith("https://npmx.dev/"),
    ),
  ).toBe(true);
  expect(() =>
    fresh({
      data: {},
      source: "https://fixture.invalid",
      observedAt: Date.now() - 3_600_001,
      authoritative: true,
    }),
  ).toThrow("过期");
});
it("preserves cancellation rather than converting it to unconfirmed network evidence", async () => {
  const controller = new AbortController();
  const cancelled = new Error("cancelled");
  controller.abort(cancelled);
  await expect(
    publicMetadata(controller.signal).package("typescript", selection),
  ).rejects.toBe(cancelled);
});
