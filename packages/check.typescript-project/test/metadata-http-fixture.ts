import { rcompare } from "semver";
import type { Release } from "../src/metadata.js";
import { metadataFixture, toolVersions } from "./metadata-fixture.js";

export const publicationTime = "2026-01-01T00:00:00.000Z";
export function metadataResponse(
  data: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    headers: {
      date: new Date().toUTCString(),
      "x-nitro-cache": "HIT",
      ...headers,
    },
  });
}
/** Author-side fake transport for the real production API parser, never a business provider. */
export function npmxTransport(
  packages: Record<string, Release[]> = Object.fromEntries(
    Object.entries(toolVersions).map(([name, version]) => [
      name,
      [{ version }],
    ]),
  ),
) {
  return async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url = new URL(String(input));
    const node = await metadataFixture().node();
    if (url.href === "https://nodejs.org/dist/index.json")
      return metadataResponse(node.data.releases);
    if (
      url.href ===
      "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json"
    )
      return metadataResponse(node.data.schedule);
    if (url.origin !== "https://npmx.dev")
      throw new Error(`Unexpected metadata host: ${url.origin}`);
    const match = /^\/api\/registry\/(timeline|packument)\/(.+)$/.exec(
      url.pathname,
    );
    if (!match) throw new Error(`Unexpected metadata URL: ${url.href}`);
    const name = decodeURIComponent(match[2]!);
    const releases = packages[name]
      ? [...packages[name]].sort((a, b) => rcompare(a.version, b.version))
      : undefined;
    if (!releases) throw new Error(`Unknown HTTP fixture package ${name}`);
    if (match[1] === "timeline") {
      const offset = Number(url.searchParams.get("offset"));
      return metadataResponse({
        total: releases.length,
        offset,
        versions: releases.slice(offset, offset + 100).map((release) => ({
          version: release.version,
          time: publicationTime,
        })),
      });
    }
    const version = url.searchParams.get("version");
    const release = releases.find((entry) => entry.version === version);
    if (!release) throw new Error(`Unknown HTTP fixture version ${version}`);
    return metadataResponse({
      name,
      _rev: "1-verified",
      time: { modified: publicationTime, [release.version]: publicationTime },
      versions: Object.fromEntries(
        releases
          .slice(0, 5)
          .map((entry) => [entry.version, { version: entry.version }]),
      ),
      requestedVersion: {
        name,
        ...release,
        dist: {
          tarball: "https://npmx.dev/fixture.tgz",
          integrity: "sha512-fixture",
        },
      },
    });
  };
}
