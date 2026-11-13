import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { put } from "./fixture.js";

interface Task {
  directory: string;
  args: string[];
}
interface Commands {
  configuration(value: unknown): unknown;
  plan(config: unknown, action: string, scope?: string): Task[];
  execute(
    tasks: Task[],
    root: string,
    spawn: (...args: unknown[]) => unknown,
  ): void;
  discover(root: string, list: (...args: unknown[]) => string): unknown;
}
const path = new URL("../assets/commands.mjs", import.meta.url).href;
const commands = (await import(path)) as unknown as Commands;
const config = [
  {
    directory: ".",
    manifest: { scripts: { "test-extra": "node scripts/test-extra.mjs" } },
    configs: {},
  },
  {
    directory: "packages/app",
    manifest: {
      name: "app",
      scripts: { build: "node scripts/build.mjs" },
      dependencies: { core: "workspace:*" },
      publishConfig: { access: "public" },
    },
    configs: {
      typecheck: "packages/app/tsconfig.json",
      lint: "eslint.config.js",
      test: "vitest.config.ts",
    },
  },
  {
    directory: "packages/core",
    manifest: {
      name: "core",
      scripts: { build: "node scripts/build.mjs" },
      publishConfig: { access: "public" },
    },
    configs: {
      typecheck: "packages/core/tsconfig.json",
      lint: "eslint.config.js",
      test: "vitest.config.ts",
    },
  },
];
it("fixes tool safety options, separates formatting and enables coverage without accepting free tool arguments", () => {
  expect(
    commands
      .plan(config, "typecheck")
      .every((task) => task.args.includes("--noEmit")),
  ).toBe(true);
  expect(
    commands.plan(config, "lint").every((task) => !task.args.includes("--fix")),
  ).toBe(true);
  expect(commands.plan(config, "format")[0]?.args).toEqual([
    "exec",
    "prettier",
    "--write",
    ".",
  ]);
  expect(commands.plan(config, "format-check")[0]?.args).toEqual([
    "exec",
    "prettier",
    "--check",
    ".",
  ]);
  const tests = commands
    .plan(config, "test-coverage")
    .filter((task) => task.args.includes("vitest"));
  expect(tests).toHaveLength(2);
  for (const task of tests)
    expect(task.args).toEqual([
      "exec",
      "vitest",
      "run",
      "--watch=false",
      "--passWithNoTests=false",
      "--coverage.enabled=true",
      "--root",
      ".",
      "--config",
      "../../vitest.config.ts",
    ]);
  expect(commands.plan(config, "lint")).toHaveLength(2);
  expect(tests.map((task) => task.directory)).toEqual([
    "packages/core",
    "packages/app",
  ]);
  const calls: unknown[][] = [];
  commands.execute(tests, process.cwd(), (...args) => {
    calls.push(args);
    return { status: 0 };
  });
  expect(calls.map((call) => (call[2] as { cwd: string }).cwd)).toEqual([
    resolve("packages", "core"),
    resolve("packages", "app"),
  ]);
  expect(
    calls.every((call) => (call[2] as { shell: boolean }).shell === false),
  ).toBe(true);
});
it("orders dependency builds before dependants and package checks, and connects explicit supplemental tests", () => {
  const tasks = commands.plan(config, "check");
  const builds = tasks.filter((task) => task.args.join(" ") === "run build");
  expect(builds.map((task) => task.directory)).toEqual([
    "packages/core",
    "packages/app",
  ]);
  const lastBuild = tasks.lastIndexOf(builds[1]!);
  expect(
    tasks.findIndex((task) => task.args.includes("publint")),
  ).toBeGreaterThan(lastBuild);
  expect(tasks.some((task) => task.args.join(" ") === "run test-extra")).toBe(
    true,
  );
  expect(
    tasks.some((task) => task.args.includes("--coverage.enabled=true")),
  ).toBe(true);
  expect(
    commands
      .plan(config, "check", "packages/app")
      .filter((task) => task.args.join(" ") === "run build")
      .map((task) => task.directory),
  ).toEqual(["packages/core", "packages/app"]);
  const cyclic = structuredClone(config);
  Object.assign(cyclic[2]!.manifest, { dependencies: { app: "workspace:*" } });
  expect(() => commands.plan(cyclic, "check")).toThrow("Cyclic");
});
it("does not rebuild members through a non-code aggregate root, while preserving code roots and single packages", () => {
  const projects = structuredClone(config);
  Object.assign(projects[0]!, { code: false });
  Object.assign(projects[0]!.manifest.scripts, {
    build: "node scripts/build.mjs",
  });
  const builds = (value: unknown) =>
    commands
      .plan(value, "check")
      .filter((task) => task.args.join(" ") === "run build");
  expect(builds(projects).map((task) => task.directory)).toEqual([
    "packages/core",
    "packages/app",
  ]);
  expect(
    commands
      .plan(projects, "check", "packages/app")
      .filter((task) => task.args.join(" ") === "run build")
      .map((task) => task.directory),
  ).toEqual(["packages/core", "packages/app"]);
  expect(builds([projects[0]]).map((task) => task.directory)).toEqual(["."]);
  Object.assign(projects[0]!, {
    code: true,
    configs: {
      typecheck: "tsconfig.json",
      lint: "eslint.config.js",
      test: "vitest.config.ts",
    },
  });
  expect(builds(projects).map((task) => task.directory)).toContain(".");
});
it("discovers catalog-only and member workspaces from pnpm and existing tool configuration without duplicate topology files", async () => {
  const root = resolve("dist", `.commands-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  try {
    await put(root, "package.json", { name: "root", private: true });
    await put(
      root,
      "pnpm-workspace.yaml",
      "catalog: {}\npackages: [packages/*]\n",
    );
    await put(root, "tsconfig.json", {});
    await put(root, "eslint.config.js", "export default [];");
    await put(root, "vitest.config.ts", "export default {};");
    await put(root, "packages/a/package.json", {
      name: "a",
      private: true,
      scripts: { build: "node scripts/build.mjs" },
    });
    await put(root, "packages/a/custom/index.ts", "export {};");
    const list = () =>
      JSON.stringify([
        { path: root },
        { path: resolve(root, "packages", "a") },
      ]);
    const projects = commands.discover(root, list);
    const tasks = commands.plan(projects, "check");
    expect(tasks.filter((task) => task.args.includes("tsc"))).toEqual([
      {
        directory: "packages/a",
        args: ["exec", "tsc", "--noEmit", "--project", "../../tsconfig.json"],
      },
    ]);
    expect(tasks.filter((task) => task.args.includes("publint"))).toEqual([]);
    expect(
      tasks.some(
        (task) =>
          task.directory === "packages/a" &&
          task.args.join(" ") === "run build",
      ),
    ).toBe(true);
    expect(
      commands
        .plan(
          commands.discover(root, () => JSON.stringify([{ path: root }])),
          "check",
        )
        .some((task) => task.args.join(" ") === "run build"),
    ).toBe(false);
    await rm(resolve(root, "tsconfig.json"));
    expect(() =>
      commands.plan(commands.discover(root, list), "typecheck"),
    ).toThrow("Cannot determine");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("discovers two shared-config member roots and preserves their real execution cwd and config paths", async () => {
  const root = resolve("dist", `.shared-commands-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  try {
    await put(root, "package.json", { name: "root", private: true });
    await put(root, "pnpm-workspace.yaml", "packages: [packages/*]\n");
    await put(
      root,
      "vitest.config.ts",
      "export default {test:{include:['test/**/*.test.ts']}};",
    );
    await put(root, "eslint.config.js", "export default [];");
    await put(root, "tsconfig.json", {});
    for (const name of ["a", "b"]) {
      await put(root, `packages/${name}/package.json`, { name, private: true });
      await put(root, `packages/${name}/src/index.ts`, "export {};");
      await put(root, `packages/${name}/test/index.test.ts`, "export {};");
    }
    const list = () =>
      JSON.stringify(
        [".", "packages/a", "packages/b"].map((directory) => ({
          path: resolve(root, directory),
        })),
      );
    const projects = commands.discover(root, list);
    const tasks = commands.plan(projects, "test");
    expect(tasks).toEqual(
      ["a", "b"].map((name) => ({
        directory: `packages/${name}`,
        args: [
          "exec",
          "vitest",
          "run",
          "--watch=false",
          "--passWithNoTests=false",
          "--root",
          ".",
          "--config",
          "../../vitest.config.ts",
        ],
      })),
    );
    const calls: unknown[][] = [];
    commands.execute(tasks, root, (...args) => {
      calls.push(args);
      return { status: 0 };
    });
    expect(calls.map((call) => (call[2] as { cwd: string }).cwd)).toEqual(
      ["a", "b"].map((name) => resolve(root, "packages", name)),
    );
    await put(root, "src/root.ts", "export {};");
    const lint = commands.plan(commands.discover(root, list), "lint");
    expect(lint).toHaveLength(3);
    expect(lint.find((task) => task.directory === ".")?.args).toEqual([
      "exec",
      "eslint",
      "src/root.ts",
      "--max-warnings=0",
      "--config",
      "eslint.config.js",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("stops at the first failed, signalled or unavailable process instead of swallowing failure", () => {
  const tasks = commands.plan(config, "check");
  for (const failure of [
    { status: 1 },
    { status: 0, signal: "SIGTERM" },
    { error: new Error("unavailable") },
  ]) {
    let calls = 0;
    expect(() => {
      commands.execute(tasks, ".", () => {
        calls++;
        return failure;
      });
    }).toThrow();
    expect(calls).toBe(1);
  }
});
