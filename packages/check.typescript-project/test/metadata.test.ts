import { afterEach, expect, it, vi } from "vitest";
import { verified, publicMetadata } from "../src/metadata.js";
import {
  canonicalPackument,
  canonicalTransport,
  githubContents,
  metadataResponse,
  requestUrl,
} from "./metadata-http-fixture.js";

afterEach(() => vi.restoreAllMocks());
const selection = { current: "6.0.3", series: "6.x" };
it.each([302, 404, 429, 503])(
  "never treats official HTTP %s as a missing or current tool version",
  async (status) => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status }));
    await expect(
      publicMetadata(new AbortController().signal).package(
        "typescript",
        selection,
      ),
    ).rejects.toThrow(`HTTP ${status}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each(["empty-body", "invalid-json", "missing-date", "future-date"] as const)(
  "rejects unusable source responses without a fallback: %s",
  async (mode) => {
    const response =
      mode === "empty-body"
        ? new Response(null, { headers: { date: new Date().toUTCString() } })
        : mode === "invalid-json"
          ? new Response("{", {
              headers: {
                date: new Date().toUTCString(),
                "content-type": "application/json",
              },
            })
          : metadataResponse(
              canonicalPackument("typescript", [{ version: "6.0.3" }]),
              {
                date:
                  mode === "missing-date"
                    ? ""
                    : new Date(Date.now() + 120_000).toUTCString(),
              },
            );
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    await expect(
      publicMetadata(new AbortController().signal).package(
        "typescript",
        selection,
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it("parses a complete canonical packument through mocked HTTP, not global latest or a slim list", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(
    canonicalTransport({
      typescript: [
        { version: "7.0.0" },
        { version: "6.1.0", engines: { node: ">=22" } },
        { version: "6.0.3", peerDependencies: { eslint: "^10" } },
        { version: "6.2.0-rc.0" },
      ],
    }),
  );
  const provider = publicMetadata(new AbortController().signal);
  const [observed, cached] = await Promise.all([
    provider.package("typescript", selection),
    provider.package("typescript", selection),
  ]);
  expect(cached).toEqual(observed);
  expect(observed.authoritative).toBe(true);
  const facts = verified(observed);
  expect(facts.versions).toEqual(["7.0.0", "6.1.0", "6.0.3"]);
  expect(Object.keys(facts.releases).sort()).toEqual(["6.0.3", "6.1.0"]);
  expect(facts.releases["6.0.3"]?.peerDependencies).toEqual({ eslint: "^10" });
  expect(facts.releases["6.1.0"]?.engines).toEqual({ node: ">=22" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toMatchObject([
    "https://registry.npmjs.org/typescript",
    {
      redirect: "error",
      headers: { accept: "application/vnd.npm.install-v1+json" },
    },
  ]);
  await expect(
    provider.package("https://evil.invalid/private", selection),
  ).rejects.toThrow("不发送");
  await expect(
    provider.package("@private/secret-tool", selection),
  ).rejects.toThrow("不发送");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("encodes scoped public tools and shares a complete packument across SemVer series selections", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(
    canonicalTransport({
      "@eslint/js": [{ version: "10.0.1" }],
      publint: [
        { version: "0.4.0" },
        { version: "0.3.26" },
        { version: "0.3.25" },
        { version: "0.0.6" },
        { version: "0.0.5" },
      ],
    }),
  );
  const provider = publicMetadata(new AbortController().signal);
  await provider.package("@eslint/js", { current: "10.0.1", series: "10.x" });
  const minor = verified(
    await provider.package("publint", { current: "0.3.25", series: "0.3.x" }),
  );
  const exact = verified(
    await provider.package("publint", { current: "0.0.5", series: "0.0.5" }),
  );
  expect(Object.keys(minor.releases)).toEqual(["0.3.25", "0.3.26"]);
  expect(Object.keys(exact.releases)).toEqual(["0.0.5"]);
  expect(requestUrl(fetcher.mock.calls[0]![0])).toBe(
    "https://registry.npmjs.org/%40eslint%2Fjs",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([
  "wrong-name",
  "missing-list",
  "empty-list",
  "missing-current",
  "wrong-version",
  "partial-tags",
  "missing-dist",
  "bad-engine",
  "bad-peer",
  "bad-peer-meta",
  "bad-modified",
  "modified-after-response",
] as const)(
  "rejects incomplete or conflicting canonical evidence: %s",
  async (failure) => {
    const body = canonicalPackument("typescript", [
      { version: "6.1.0" },
      { version: "6.0.3" },
    ]);
    const manifest = body.versions["6.0.3"]!;
    const raw: Record<string, unknown> = body;
    if (failure === "wrong-name") body.name = "unrelated";
    if (failure === "missing-list") delete raw.versions;
    if (failure === "empty-list") body.versions = {};
    if (failure === "missing-current") delete body.versions["6.0.3"];
    if (failure === "wrong-version") manifest.version = "6.0.2";
    if (failure === "partial-tags") body["dist-tags"].latest = "7.0.0";
    if (failure === "missing-dist")
      delete (manifest as Record<string, unknown>).dist;
    if (failure === "bad-engine")
      (manifest as Record<string, unknown>).engines = { node: 24 };
    if (failure === "bad-peer")
      (manifest as Record<string, unknown>).peerDependencies = {
        eslint: false,
      };
    if (failure === "bad-peer-meta")
      (manifest as Record<string, unknown>).peerDependenciesMeta = {
        eslint: { optional: "true" },
      };
    if (failure === "bad-modified") raw.modified = "not-a-date";
    if (failure === "modified-after-response")
      raw.modified = new Date(Date.now() + 120_000).toISOString();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(metadataResponse(body));
    await expect(
      publicMetadata(new AbortController().signal).package(
        "typescript",
        selection,
      ),
    ).rejects.toThrow();
  },
);
it.each([{ age: "-1" }, { age: "bad" }, { "content-type": "text/html" }])(
  "never falls back after invalid canonical HTTP evidence: %j",
  async (headers) => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        metadataResponse(
          canonicalPackument("typescript", [{ version: "6.0.3" }]),
          headers,
        ),
      );
    await expect(
      publicMetadata(new AbortController().signal).package(
        "typescript",
        selection,
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetcher.mock.calls[0]![0])).toBe(
      "https://registry.npmjs.org/typescript",
    );
  },
);
it.each([
  { age: "7724" },
  { date: new Date(Date.now() - 86_400_000).toUTCString() },
  { "x-cache": "STALE" },
  { "cache-status": "expired" },
  { "x-nitro-cache": "revalidating" },
  { warning: '110 - "Response is stale"' },
])(
  "accepts canonical registry cache delays and status hints: %j",
  async (headers) => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        metadataResponse(
          canonicalPackument("typescript", [{ version: "6.0.3" }]),
          headers,
        ),
      );
    const observation = await publicMetadata(
      new AbortController().signal,
    ).package("typescript", selection);
    expect(verified(observation).versions).toEqual(["6.0.3"]);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      accept: "application/vnd.npm.install-v1+json",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it("requires official Node index and lifecycle evidence together", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(canonicalTransport());
  const observed = await publicMetadata(new AbortController().signal).node();
  expect(Date.now() - observed.observedAt).toBeLessThan(5_000);
  expect(verified(observed).historicalIndex?.cacheAgeMs).toBeLessThan(5_000);
  expect(observed.source).not.toContain("historical-only=true");
  expect(observed.source).toContain(
    "api.github.com/repos/nodejs/Release/contents/schedule.json",
  );
});
it.each(["index", "schedule"] as const)(
  "accepts cached Node %s data and retains the cache age as evidence",
  async (source) => {
    const transport = canonicalTransport();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const response = await transport(input);
      if (
        source === "index"
          ? requestUrl(input) === "https://nodejs.org/dist/index.json"
          : requestUrl(input).startsWith("https://api.github.com/")
      ) {
        response.headers.set("age", "172800");
        response.headers.set("x-cache", "STALE");
      }
      return response;
    });
    const observed = await publicMetadata(new AbortController().signal).node();
    expect(verified(observed).releases.length).toBeGreaterThan(0);
    expect(Date.now() - observed.observedAt).toBeGreaterThanOrEqual(
      172_800_000,
    );
    expect(observed.source).toContain("age=172800s,cache=STALE");
    if (source === "index")
      expect(observed.data.historicalIndex?.cacheAgeMs).toBe(172_800_000);
  },
);
it.each(["missing-content", "wrong-sha", "invalid-date"] as const)(
  "never uses invalid lifecycle evidence to select a latest LTS: %s",
  async (failure) => {
    const transport = canonicalTransport();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (!requestUrl(input).startsWith("https://api.github.com/"))
        return transport(input);
      const body: Record<string, unknown> = githubContents({
        v24: {
          lts: "2025-10-28",
          end: failure === "invalid-date" ? "bad" : "2028-04-30",
        },
      });
      if (failure === "missing-content") delete body.content;
      if (failure === "wrong-sha") body.sha = "0".repeat(40);
      return metadataResponse(body);
    });
    await expect(
      publicMetadata(new AbortController().signal).node(),
    ).rejects.toThrow();
  },
);
it("allows a full install-v1 response above 4MiB and rejects one above 16MiB", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  const body = canonicalPackument("typescript", [{ version: "6.0.3" }]);
  fetcher.mockResolvedValue(
    metadataResponse({ ...body, padding: "x".repeat(4_200_000) }),
  );
  expect(
    verified(
      await publicMetadata(new AbortController().signal).package(
        "typescript",
        selection,
      ),
    ).versions,
  ).toEqual(["6.0.3"]);
  fetcher.mockResolvedValue(
    metadataResponse({ ...body, padding: "x".repeat(16_777_216) }),
  );
  await expect(
    publicMetadata(new AbortController().signal).package(
      "typescript",
      selection,
    ),
  ).rejects.toThrow("16MiB");
});
it("preserves cancellation and unexpected faults, while network errors are unconfirmed", async () => {
  const controller = new AbortController();
  const cancelled = new Error("cancelled");
  controller.abort(cancelled);
  await expect(
    publicMetadata(controller.signal).package("typescript", selection),
  ).rejects.toBe(cancelled);
  await expect(publicMetadata(controller.signal).node()).rejects.toBe(
    cancelled,
  );
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new TypeError("network unavailable"));
  await expect(
    publicMetadata(new AbortController().signal).package(
      "typescript",
      selection,
    ),
  ).rejects.toThrow("network unavailable");
  const unexpected = new Error("unexpected execution failure");
  fetcher.mockRejectedValue(unexpected);
  await expect(
    publicMetadata(new AbortController().signal).package(
      "typescript",
      selection,
    ),
  ).rejects.toBe(unexpected);
});
it.each([Number.NaN, Date.now() + 120_000])(
  "rejects invalid observation times: %s",
  (observedAt) => {
    expect(() =>
      verified({
        data: {},
        source: "https://fixture.invalid",
        observedAt,
        authoritative: true,
      }),
    ).toThrow("观察时间不可信");
  },
);
it("accepts older observations without discarding provenance checks", () => {
  const observation = {
    data: {},
    source: "https://fixture.invalid",
    observedAt: Date.now() - 86_400_000,
    authoritative: true,
  };
  expect(verified(observation)).toBe(observation.data);
  expect(() => verified({ ...observation, authoritative: false })).toThrow(
    "缺少可信完整发行证据",
  );
  expect(() =>
    verified({ ...observation, source: "http://fixture.invalid" }),
  ).toThrow("来源无效");
});
