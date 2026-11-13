import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maxSatisfying } from "semver";
import { parse, stringify } from "yaml";
const root = dirname(fileURLToPath(import.meta.url));
assert.ok(root.startsWith("/tmp/okr-convention-"));
const source = join(root, "projects/current");
const target = join(root, "projects/workspace");
await cp(source, target, { recursive: true });
const base = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
const r = await fetch("https://registry.npmjs.org/turbo", {
  signal: AbortSignal.timeout(10000),
  headers: { accept: "application/vnd.npm.install-v1+json" },
});
assert.equal(r.status, 200);
const packument = await r.json();
assert.equal(packument.name, "turbo");
const turbo = maxSatisfying(Object.keys(packument.versions), "2.x");
assert.ok(turbo);
await writeFile(
  join(target, "package.json"),
  JSON.stringify(
    {
      ...base,
      name: "workspace-fixture",
      devDependencies: { ...base.devDependencies, turbo: `^${turbo}` },
      scripts: {
        typecheck: "turbo run typecheck",
        lint: "turbo run lint",
        "format:check": "prettier --check .",
        format: "prettier --write .",
        test: "turbo run test",
        "test:coverage": "turbo run test:coverage",
        check: "pnpm format:check && turbo run typecheck lint test:coverage",
      },
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  join(target, "pnpm-workspace.yaml"),
  stringify({
    ...parse(await readFile(join(source, "pnpm-workspace.yaml"), "utf8")),
    packages: ["packages/*"],
  }),
);
await writeFile(
  join(target, "turbo.json"),
  JSON.stringify(
    {
      tasks: { typecheck: {}, lint: {}, test: {}, "test:coverage": {} },
    },
    null,
    2,
  ) + "\n",
);
for (const name of ["src", "test"])
  await rm(join(target, name), { recursive: true });
for (const name of ["a", "b"]) {
  const member = join(target, "packages", name);
  await mkdir(dirname(member), { recursive: true });
  await cp(source, member, { recursive: true });
  await writeFile(
    join(member, "package.json"),
    JSON.stringify(
      {
        name,
        private: true,
        engines: { node: ">=22" },
        scripts: {
          typecheck: "tsc --noEmit -p tsconfig.json",
          lint: "eslint .",
          test: "vitest run --coverage --root . --config ../../vitest.config.ts",
          "test:coverage":
            "vitest run --coverage --root . --config ../../vitest.config.ts",
        },
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(member, "tsconfig.json"),
    JSON.stringify(
      {
        extends: "../../tsconfig.base.json",
        include: ["src/**/*.ts", "test/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
  );
  for (const file of [
    "AGENTS.md",
    ".node-version",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "eslint.config.js",
  ]) {
    await rm(join(member, file));
  }
}
execFileSync(
  "pnpm",
  [
    "install",
    "--lockfile-only",
    "--ignore-scripts",
    "--config.manage-package-manager-versions=false",
  ],
  { cwd: target, stdio: "inherit", timeout: 120000 },
);
const one = join(root, "projects/workspace-one");
await cp(target, one, { recursive: true });
await rm(join(one, "packages", "b"), { recursive: true });
execFileSync(
  "pnpm",
  [
    "install",
    "--lockfile-only",
    "--ignore-scripts",
    "--config.manage-package-manager-versions=false",
  ],
  { cwd: one, stdio: "inherit", timeout: 120000 },
);
await writeFile(
  join(root, "workspace-preparation.json"),
  JSON.stringify(
    {
      turbo,
      rootToolsShared: true,
      members: ["packages/a", "packages/b"],
      singleMemberWorkspace: ["packages/a"],
      targetScriptsExecuted: false,
      actualPnpmResolution: true,
    },
    null,
    2,
  ) + "\n",
);
