import type { Metadata, PackageFacts, Release } from "../src/metadata.js";

export function packageFacts(releases: Record<string, Release>): PackageFacts {
  return { versions: Object.keys(releases), releases };
}

export const toolVersions: Record<string, string> = {
  pnpm: "11.22.0",
  typescript: "6.0.3",
  vitest: "5.0.4",
  vite: "8.3.4",
  eslint: "10.14.0",
  "typescript-eslint": "8.72.1",
  "@eslint/js": "10.0.1",
  prettier: "3.9.10",
  "@vitest/coverage-v8": "5.0.4",
  publint: "0.3.25",
  semver: "7.8.5",
  turbo: "2.11.10",
};
export function metadataFixture(): Metadata {
  return {
    node() {
      return Promise.resolve({
        source: "https://fixture.invalid/node",
        observedAt: Date.now(),
        authoritative: true,
        data: {
          releases: [
            { version: "v24.11.0", lts: "Krypton" },
            { version: "v22.15.0", lts: "Jod" },
          ],
          schedule: {
            v24: { lts: "2025-10-28", end: "2028-04-30" },
            v22: { lts: "2024-10-29", end: "2027-04-30" },
          },
          historicalIndex: {
            source: "https://fixture.invalid/node-index",
            cacheAgeMs: 0,
          },
        },
      });
    },
    package(name) {
      const version = toolVersions[name];
      if (!version) throw new Error(`Unknown metadata fixture ${name}`);
      return Promise.resolve({
        source: `https://fixture.invalid/${name}`,
        observedAt: Date.now(),
        authoritative: true,
        data: packageFacts({ [version]: { version } }),
      });
    },
  };
}
