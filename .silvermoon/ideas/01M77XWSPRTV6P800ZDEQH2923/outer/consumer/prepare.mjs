import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maxSatisfying, minVersion } from "semver";
import { parse, stringify } from "yaml";

const root = dirname(fileURLToPath(import.meta.url));
assert.ok(root.startsWith("/tmp/okr-convention-"));
const permitted = new Set([
  "pnpm",
  "typescript",
  "eslint",
  "typescript-eslint",
  "@eslint/js",
  "prettier",
  "vitest",
  "@vitest/coverage-v8",
  "publint",
  "semver",
]);
const facts = new Map();
async function versions(name) {
  assert.ok(permitted.has(name));
  if (facts.has(name)) return facts.get(name);
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    {
      headers: {
        accept: "application/vnd.npm.install-v1+json",
        "cache-control": "no-cache",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    },
  );
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.name, name);
  facts.set(name, value);
  return value;
}
const pnpm = await versions("pnpm");
const newestPnpm = maxSatisfying(Object.keys(pnpm.versions), "11.x");
assert.ok(newestPnpm);
for (const [source, target] of [
  ["good", "current"],
  ["npm", "npm-current"],
]) {
  const directory = join(root, "projects", target);
  await cp(join(root, "projects", source), directory, { recursive: true });
  await writeFile(
    join(directory, "pnpm-workspace.yaml"),
    stringify({
      packages: [],
      minimumReleaseAgeExclude: ["prettier@3.10.1"],
    }),
  );
  const path = join(directory, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.packageManager = `pnpm@${newestPnpm}`;
  for (const [name, range] of Object.entries(manifest.devDependencies)) {
    const minimum = minVersion(range);
    assert.ok(minimum);
    const series =
      minimum.major > 0
        ? `${minimum.major}.x`
        : minimum.minor > 0
          ? `0.${minimum.minor}.x`
          : minimum.version;
    const packument = await versions(name);
    const latest = maxSatisfying(Object.keys(packument.versions), series);
    assert.ok(latest, name);
    manifest.devDependencies[name] =
      minimum.major + minimum.minor === 0 ? latest : `^${latest}`;
  }
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(
    join(directory, ".node-version"),
    process.version.slice(1) + "\n",
  );
  if (target === "npm-current") {
    const configPath = join(directory, "release.config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.ci.nodeVersions = ["22.15.0", process.version.slice(1)];
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
    const ciPath = join(directory, ".github/workflows/ci.yaml");
    const ci = parse(await readFile(ciPath, "utf8"));
    ci.jobs.compatibility.strategy.matrix["node-version"] =
      config.ci.nodeVersions;
    await writeFile(ciPath, stringify(ci));
  }
  // Only owned fixture data is resolved. No target lifecycle scripts/hooks are run.
  execFileSync(
    "pnpm",
    [
      "install",
      "--lockfile-only",
      "--ignore-scripts",
      "--config.manage-package-manager-versions=false",
    ],
    { cwd: directory, stdio: "inherit", timeout: 120000 },
  );
}
const summary = Object.fromEntries(
  [...facts].map(([name, value]) => [
    name,
    { modified: value.modified, versions: Object.keys(value.versions).length },
  ]),
);
await writeFile(
  join(root, "fixture-preparation.json"),
  JSON.stringify(
    {
      node: process.version,
      pnpm: newestPnpm,
      declarationsAndLockfileResolved: true,
      targetScriptsExecuted: false,
      source: "authorized-host-canonical-registry",
      facts: summary,
    },
    null,
    2,
  ) + "\n",
);
