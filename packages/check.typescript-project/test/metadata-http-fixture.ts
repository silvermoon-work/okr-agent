import { createHash } from "node:crypto";
import { rcompare } from "semver";
import type { NodeFacts, Release } from "../src/metadata.js";
import { metadataFixture, toolVersions } from "./metadata-fixture.js";

export const publicationTime = "2026-01-01T00:00:00.000Z";
export function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}
export function metadataResponse(
  data: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    headers: {
      date: new Date().toUTCString(),
      "content-type": "application/json",
      ...headers,
    },
  });
}
export function githubContents(data: unknown) {
  const content = Buffer.from(JSON.stringify(data));
  return {
    path: "schedule.json",
    type: "file",
    encoding: "base64",
    content: content.toString("base64"),
    size: content.length,
    sha: createHash("sha1")
      .update(`blob ${content.length}\0`)
      .update(content)
      .digest("hex"),
  };
}
export function canonicalPackument(name: string, releases: Release[]) {
  const sorted = [...releases].sort((a, b) => rcompare(a.version, b.version));
  return {
    name,
    modified: publicationTime,
    "dist-tags": { latest: sorted[0]!.version },
    versions: Object.fromEntries(
      sorted.map((release) => [
        release.version,
        {
          name,
          ...release,
          dist: {
            tarball: "https://registry.npmjs.org/fixture.tgz",
            integrity: "sha512-fixture",
          },
        },
      ]),
    ),
  };
}
/** Author-side fake transport. It never makes a canonical request from this device. */
export function canonicalTransport(
  packages: Record<string, Release[]> = Object.fromEntries(
    Object.entries(toolVersions).map(([name, version]) => [
      name,
      [{ version }],
    ]),
  ),
  nodeOverride: Partial<NodeFacts> = {},
) {
  return async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url = new URL(requestUrl(input));
    const node = { ...(await metadataFixture().node()).data, ...nodeOverride };
    if (url.href === "https://nodejs.org/dist/index.json")
      return metadataResponse(node.releases, {
        date: new Date(Date.now() - 8_070_000).toUTCString(),
        age: "8070",
      });
    if (
      url.href ===
      "https://api.github.com/repos/nodejs/Release/contents/schedule.json?ref=main"
    )
      return metadataResponse(githubContents(node.schedule));
    if (url.origin !== "https://registry.npmjs.org")
      throw new Error(`Unexpected metadata host: ${url.origin}`);
    const name = decodeURIComponent(url.pathname.slice(1));
    const releases = packages[name];
    if (!releases) throw new Error(`Unknown HTTP fixture package ${name}`);
    return metadataResponse(canonicalPackument(name, releases));
  };
}
