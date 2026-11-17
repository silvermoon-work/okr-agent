import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import process from "node:process";
import { parse } from "yaml";
import { format } from "prettier";
import test from "node:test";
import { loadDeliverables } from "../scripts/lib/deliverables.mjs";
import { workspaces } from "../scripts/lib/tools.mjs";

const root = resolve(".");
function run(cwd, args, success = true) {
  const cli = process.env.npm_execpath;
  assert.ok(cli, "Run this test through pnpm test-release");
  const env = {
    ...process.env,
    TURBO_DAEMON: "false",
    TURBO_TELEMETRY_DISABLED: "1",
  };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    cli.endsWith(".exe") ? cli : process.execPath,
    cli.endsWith(".exe") ? args : [cli, ...args],
    {
      cwd,
      encoding: "utf8",
      env,
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  const output = result.stdout + result.stderr;
  if (success) assert.equal(result.status, 0, output);
  else assert.notEqual(result.status, 0, output);
  return success ? result.stdout : output;
}

test("the actual Turbo graph covers every member and dependency, with shared inputs and output restoration", () => {
  const projects = workspaces();
  const graph = JSON.parse(
    run(root, [
      "exec",
      "turbo",
      "run",
      "build",
      "typecheck",
      "test",
      "test-coverage",
      "lint-package",
      "--dry=json",
    ]),
  );
  for (const project of projects) {
    for (const action of ["build", "typecheck", "test", "test-coverage"]) {
      const task = graph.tasks.find(
        (candidate) =>
          candidate.taskId === `${project.manifest.name}#${action}`,
      );
      assert.ok(task?.command, `Missing ${project.manifest.name}#${action}`);
      if (action === "build") {
        assert.deepEqual(task.outputs, ["dist/**"]);
      } else if (action === "test-coverage") {
        assert.deepEqual(task.outputs, ["coverage/**"]);
      }
      for (const dependency of Object.keys({
        ...project.manifest.dependencies,
        ...project.manifest.devDependencies,
      }).filter((name) =>
        projects.some((entry) => entry.manifest.name === name),
      )) {
        assert.ok(
          task.dependencies.includes(`${dependency}#build`),
          `${task.taskId} must wait for ${dependency}`,
        );
      }
    }
  }
  const npm = loadDeliverables(root).filter((entry) => entry.type === "npm");
  const linted = graph.tasks.filter(
    (task) => task.task === "lint-package" && task.command !== "<NONEXISTENT>",
  );
  assert.equal(linted.length, npm.length);
  for (const entry of npm) {
    const project = projects.find((item) => item.directory === entry.path);
    const task = linted.find((item) => item.package === project.manifest.name);
    assert.ok(task.dependencies.includes(`${task.package}#build`));
  }
  for (const file of [
    ".node-version",
    "tsconfig.json",
    "vitest.config.ts",
    "scripts/lib/tools.mjs",
  ]) {
    assert.ok(
      graph.globalCacheInputs.files[file],
      `Missing shared input ${file}`,
    );
  }
  const sideEffects = JSON.parse(
    run(root, [
      "exec",
      "turbo",
      "run",
      "dev",
      "demo",
      "smoke",
      "native-test",
      "nvm-smoke",
      "--dry=json",
    ]),
  ).tasks.filter(
    (task) => task.task !== "build" && task.command !== "<NONEXISTENT>",
  );
  assert.ok(sideEffects.length > 0);
  for (const task of sideEffects)
    assert.equal(task.resolvedTaskDefinition.cache, false, task.taskId);
  run(root, ["exec", "turbo", "run", "release", "--dry=json"], false);
  run(root, ["exec", "turbo", "run", "release-dry-run", "--dry=json"], false);
});

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "okr-engineering-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  async function write(path, source) {
    const file = join(directory, path);
    mkdirSync(resolve(file, ".."), { recursive: true });
    writeFileSync(file, await format(source, { filepath: file }));
  }
  function json(path, value) {
    return write(path, JSON.stringify(value));
  }
  for (const file of [
    ".node-version",
    ".gitignore",
    ".prettierignore",
    "eslint.config.js",
    "tsconfig.json",
    "vitest.config.ts",
    "turbo.json",
    "scripts/check.mjs",
    "scripts/clean.mjs",
    "scripts/test-release.mjs",
    "scripts/lint-package.mjs",
    "scripts/lib/tools.mjs",
    "scripts/lib/deliverables.mjs",
  ]) {
    mkdirSync(resolve(directory, file, ".."), { recursive: true });
    cpSync(join(root, file), join(directory, file));
  }
  symlinkSync(
    join(root, "node_modules"),
    join(directory, "node_modules"),
    "junction",
  );
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  await json("package.json", { ...manifest, name: "@fixture/root" });
  await write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
  cpSync(join(root, "pnpm-lock.yaml"), join(directory, "pnpm-lock.yaml"));
  await write(
    "silvermoon.yaml",
    "deliverables:\n  - path: packages/core\n    type: npm\n    packageId: core\n",
  );
  await write(
    "probe.mjs",
    `import { appendFileSync, existsSync } from "node:fs";
     import { resolve } from "node:path";
     import process from "node:process";
     const [action, name] = process.argv.slice(2);
     if (name === "app" && !existsSync("../core/dist/index.js"))
       throw new Error("dependency was not built");
     appendFileSync(resolve(import.meta.dirname, "events.jsonl"),
       JSON.stringify({ action, name }) + "\\n");`,
  );
  const core = JSON.parse(readFileSync("packages/core/package.json", "utf8"));
  for (const name of ["core", "app"]) {
    const scripts = { ...core.scripts, "lint-package": "publint" };
    for (const action of [
      "build",
      "typecheck",
      "test",
      "test-coverage",
      "lint-package",
    ])
      scripts[action] += ` && node ../../probe.mjs ${action} ${name}`;
    await json(`packages/${name}/package.json`, {
      ...core,
      name: `@fixture/${name}`,
      private: name !== "core",
      scripts,
      ...(name === "app"
        ? { dependencies: { "@fixture/core": "workspace:*" } }
        : {}),
    });
    cpSync(
      join(root, "packages/core/tsconfig.json"),
      join(directory, `packages/${name}/tsconfig.json`),
    );
    cpSync(
      join(root, "packages/core/tsconfig.build.json"),
      join(directory, `packages/${name}/tsconfig.build.json`),
    );
    await write(
      `packages/${name}/src/index.ts`,
      "export const twice = (value: number): number => value * 2;",
    );
    await write(
      `packages/${name}/test/index.test.ts`,
      `import { expect, test } from "vitest";
       import { twice } from "../src/index.js";
       test("twice", () => { expect(twice(2)).toBe(4); });`,
    );
  }
  await write(
    "test/release.test.js",
    `import { execFileSync } from "node:child_process";
     import process from "node:process";
     import test from "node:test";
     test("release regression executes", () => {
       execFileSync(process.execPath, ["probe.mjs", "release", "root"]);
     });`,
  );
  return {
    directory,
    write,
    events: () =>
      readFileSync(join(directory, "events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
  };
}

test(
  "the real gate builds once in order, runs tools and regressions, restores caches, and propagates failures",
  { timeout: 240_000 },
  async (t) => {
    const { directory, write, events } = await fixture(t);
    run(directory, ["check"]);
    const initial = events();
    assert.deepEqual(
      initial
        .filter((event) => event.action === "build")
        .map((event) => event.name),
      ["core", "app"],
    );
    for (const action of ["typecheck", "test-coverage"]) {
      assert.deepEqual(
        initial
          .filter((event) => event.action === action)
          .map((event) => event.name)
          .sort(),
        ["app", "core"],
      );
    }
    assert.deepEqual(
      initial
        .filter((event) => event.action === "lint-package")
        .map((event) => event.name),
      ["core"],
    );
    assert.ok(
      initial.findIndex((event) => event.action === "release") >
        initial.findLastIndex((event) => event.action === "test-coverage"),
      JSON.stringify(initial),
    );
    for (const name of ["app", "core"])
      for (const output of ["dist", "coverage"])
        rmSync(join(directory, "packages", name, output), { recursive: true });
    run(directory, ["build"]);
    run(directory, ["test-coverage"]);
    for (const name of ["app", "core"]) {
      assert.ok(existsSync(join(directory, "packages", name, "dist/index.js")));
      assert.ok(
        existsSync(
          join(directory, "packages", name, "coverage/coverage-final.json"),
        ),
      );
    }
    assert.equal(
      events().filter((event) => event.action === "build").length,
      2,
    );
    assert.equal(
      events().filter((event) => event.action === "test-coverage").length,
      2,
    );
    run(directory, ["test"]);
    assert.equal(events().filter((event) => event.action === "test").length, 2);
    assert.equal(
      events().filter((event) => event.action === "release").length,
      3,
    );

    const config = JSON.parse(
      readFileSync(join(directory, "tsconfig.json"), "utf8"),
    );
    config.compilerOptions.noUnusedLocals = true;
    await write("tsconfig.json", JSON.stringify(config));
    run(directory, ["build"]);
    assert.equal(
      events().filter((event) => event.action === "build").length,
      4,
    );

    await write("scripts/invalid.mjs", "missingMaintenanceBinding();");
    const before = events().length;
    assert.match(run(directory, ["check"], false), /no-undef/);
    assert.deepEqual(
      events()
        .slice(before)
        .filter((event) =>
          ["test-coverage", "lint-package", "release"].includes(event.action),
        ),
      [],
      "lint failure must stop coverage and package lint",
    );
    rmSync(join(directory, "scripts/invalid.mjs"));
    await write(
      "packages/core/src/untouched.ts",
      "export const untouched = (): number => 42;",
    );
    assert.match(
      run(directory, ["test-coverage"], false),
      /Coverage|coverage|threshold/i,
    );
    assert.equal(
      events().filter((event) => event.action === "release").length,
      3,
    );
    await write(
      "packages/core/src/index.ts",
      "export const twice: number = 'invalid';",
    );
    assert.match(run(directory, ["check"], false), /error TS/);
    assert.equal(
      events().filter((event) => event.action === "release").length,
      3,
    );
  },
);

test("clean removes only declared workspace outputs and refuses redirected paths", async (t) => {
  const { directory } = await fixture(t);
  for (const path of [
    "dist",
    "coverage",
    ".turbo",
    "packages/core/dist",
    "packages/app/coverage",
    "unlisted/dist",
    "node_modules-do-not-touch",
  ]) {
    mkdirSync(join(directory, path), { recursive: true });
    writeFileSync(join(directory, path, "sentinel"), "keep");
  }
  run(directory, ["clean"]);
  for (const path of [
    "dist",
    "coverage",
    ".turbo",
    "packages/core/dist",
    "packages/app/coverage",
  ])
    assert.equal(existsSync(join(directory, path)), false);
  for (const path of [
    "unlisted/dist",
    "node_modules-do-not-touch",
    "packages/core/src/index.ts",
  ])
    assert.ok(existsSync(join(directory, path)));
  symlinkSync(
    join(directory, "unlisted/dist"),
    join(directory, "packages/core/dist"),
    "junction",
  );
  assert.match(run(directory, ["clean"], false), /redirected output/);
  assert.ok(existsSync(join(directory, "unlisted/dist/sentinel")));
  unlinkSync(join(directory, "packages/core/dist"));
  mkdirSync(join(directory, "packages/core/coverage"));
  const result = spawnSync(
    process.execPath,
    [join(directory, "scripts/clean.mjs")],
    {
      cwd: join(directory, "unlisted"),
      encoding: "utf8",
      env: process.env,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(directory, "packages/core/coverage")), false);
  assert.ok(existsSync(join(directory, "unlisted/dist/sentinel")));
});
test("the publisher uses exactly one v6 pnpm-store cache without skipping frozen install", () => {
  const workflow = parse(
    readFileSync(".github/workflows/publish-npm.yaml", "utf8"),
  );
  const steps = workflow.jobs.publish.steps;
  const pnpm = steps.findIndex((step) => step.uses === "pnpm/action-setup@v6");
  const cache = steps.filter(
    (step) =>
      step.uses === "actions/setup-node@v7" && step.with?.cache === "pnpm",
  );
  assert.ok(pnpm >= 0);
  assert.equal(steps[pnpm].with.cache, true);
  assert.equal(cache.length, 0);
  const install = steps.findIndex(
    (step) => step.run === "pnpm install --frozen-lockfile",
  );
  assert.ok(install > pnpm);
  assert.equal(steps[install].if, undefined);
});
