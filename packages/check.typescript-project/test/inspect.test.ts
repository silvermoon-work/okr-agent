import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { inspect } from "../src/inspect.js";
import type { Input, ProblemCode } from "../src/contract.js";
import {
  catalog,
  fixture,
  put,
  manifest,
  vitestConfig,
  lintConfig,
  workflow,
  testEvidence,
} from "./fixture.js";
import { javascript, jsonc } from "../src/static.js";
import { Files } from "../src/files.js";

let root: string;
beforeEach(async () => {
  root = resolve("dist", `.typescript-fixture-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  await fixture(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function check(requirements?: unknown) {
  const problems: { code: ProblemCode; brief: string }[] = [];
  await inspect(
    {
      projectDirectory: root,
      ...(requirements === undefined ? {} : { requirements }),
    },
    new AbortController().signal,
    (code, brief) => problems.push({ code, brief }),
    await testEvidence(),
  );
  return problems;
}
it("passes configuration despite deliberately broken types and failing test code", async () => {
  expect(await check()).toEqual([]);
});
it("rejects oversized configuration and malformed UTF-8 rather than reading or defaulting it", async () => {
  await put(root, "large.json", "x".repeat(1_048_577));
  const files = new Files(root, new AbortController().signal);
  await expect(files.text("large.json")).rejects.toThrow("byte budget");
  await writeFile(join(root, "invalid.json"), Buffer.from([0xff]));
  await expect(files.text("invalid.json")).rejects.toThrow();
});
it("enforces the configuration-count budget while caching repeated reads", async () => {
  const files = new Files(root, new AbortController().signal);
  for (let index = 0; index < 512; index++) {
    const path = `configuration/${index}.json`;
    await put(root, path, "{}");
    expect(await files.text(path)).toBe("{}");
  }
  expect(await files.text("configuration/0.json")).toBe("{}");
  await put(root, "configuration/overflow.json", "{}");
  await expect(files.text("configuration/overflow.json")).rejects.toThrow(
    "exceeds 512",
  );
});
it("checks the fixed shared implementation rather than only its wrapper", async () => {
  const assets = await testEvidence();
  await put(
    root,
    "scripts/lib/commands.mjs",
    `${Buffer.from(assets.scripts["commands"]!).toString("utf8")}\n// changed\n`,
  );
  const problems = await check();
  expect(problems).toEqual([
    expect.objectContaining({
      code: "gate-mismatch",
      brief: expect.stringContaining("scripts/lib/commands.mjs") as unknown,
    }),
  ]);
  expect(problems[0]?.brief).toContain("观察 SHA256");
});
it("does not require a duplicate scripts topology configuration", async () => {
  expect(await check()).toEqual([]);
});
it("short-circuits each invalid invocation before file/lib checks while retaining independent scripts and configuration issues", async () => {
  await put(root, "package.json", {
    ...manifest,
    scripts: { check: "pnpm check", lint: "node scripts/lint.mjs" },
  });
  for (const name of Object.keys(manifest.scripts))
    await rm(join(root, "scripts", `${name}.mjs`));
  await rm(join(root, "scripts", "lib", "commands.mjs"));
  await put(root, "tsconfig.json", { compilerOptions: { strict: false } });
  const problems = await check();
  expect(
    problems.filter((p) => p.brief.includes("scripts/check.mjs:")),
  ).toEqual([]);
  expect(
    problems.filter((p) => p.brief.includes("scripts/lint.mjs:")),
  ).toHaveLength(1);
  expect(
    problems.filter((p) => p.brief.includes("scripts/lib/commands.mjs")),
  ).toEqual([]);
  expect(problems.some((p) => p.code === "typescript-mismatch")).toBe(true);
});
it("reports one shared-library failure with the affected valid entrypoints", async () => {
  await rm(join(root, "scripts", "lib", "commands.mjs"));
  const failures = (await check()).filter((p) =>
    p.brief.includes("scripts/lib/commands.mjs"),
  );
  expect(failures).toHaveLength(1);
  expect(failures[0]?.brief).toContain("scripts.check");
  expect(failures[0]?.brief).toContain("scripts.lint");
});
it("keeps voluntarily declared private release entries fixed without imposing npm delivery requirements", async () => {
  const evidence = await testEvidence();
  await put(root, "package.json", {
    ...manifest,
    scripts: { ...manifest.scripts, release: "node scripts/release.mjs" },
  });
  await put(
    root,
    "scripts/release.mjs",
    Buffer.from(evidence.scripts.release!).toString("utf8"),
  );
  const problems = await check();
  expect(problems).toEqual([
    expect.objectContaining({
      code: "gate-missing",
      brief: expect.stringContaining("scripts/lib/npm-publish.mjs") as unknown,
    }),
  ]);
  await put(
    root,
    "scripts/lib/npm-publish.mjs",
    Buffer.from(evidence.publisher).toString("utf8"),
  );
  expect(await check()).toEqual([]);
});
it("supports shared root configuration and scheduling without duplicating member scripts or a topology file", async () => {
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  await put(root, "packages/a/package.json", {
    name: "member",
    private: true,
    engines: { node: ">=22" },
  });
  await put(root, "packages/a/code/index.ts", "export const member = 1;");
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    include: ["src/**/*.ts", "test/**/*.ts", "packages/**/*.ts"],
  });
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace('["src/**/*.ts"]', '["src/**/*.ts", "code/**/*.ts"]'),
  );
  expect(await check()).toEqual([]);
  await put(root, "packages/a/package.json", {
    name: "member",
    private: true,
    engines: { node: ">=22" },
    dependencies: { fixture: "workspace:*" },
  });
  await put(root, "package.json", {
    ...manifest,
    dependencies: { member: "workspace:*" },
  });
  await rm(join(root, "scripts", "lib", "commands.mjs"));
  const problems = await check();
  expect(
    problems.filter(
      (p) => p.code === "gate-unconfirmed" && p.brief.includes("循环"),
    ),
  ).toHaveLength(1);
  expect(
    problems.filter(
      (p) =>
        p.code === "gate-missing" &&
        p.brief.includes("scripts/lib/commands.mjs"),
    ),
  ).toHaveLength(1);
});
it("keeps shared Vitest configuration separate from two member roots and aggregates only shared discovery failures", async () => {
  await rm(join(root, "src"), { recursive: true });
  await rm(join(root, "test"), { recursive: true });
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    include: ["packages/**/*.ts"],
  });
  for (const name of ["a", "b"]) {
    await put(root, `packages/${name}/package.json`, {
      name,
      private: true,
      engines: { node: ">=22" },
    });
    await put(root, `packages/${name}/src/index.ts`, "export {};");
    await put(root, `packages/${name}/test/index.test.ts`, "export {};");
  }
  expect(await check()).toEqual([]);
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace("src/**/*.ts", "missing/**/*.ts"),
  );
  const coverageFailures = (await check()).filter(
    (problem) => problem.code === "coverage-mismatch",
  );
  expect(coverageFailures).toHaveLength(1);
  for (const name of ["a", "b"]) {
    expect(coverageFailures[0]?.brief).toContain(`实际 root=packages/${name}`);
    expect(coverageFailures[0]?.brief).toContain(
      `未匹配文件=["packages/${name}/src/index.ts"]`,
    );
  }
  await put(root, "vitest.config.ts", vitestConfig);
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    include: ["src/**/*.ts", "test/**/*.ts"],
  });
  const typeFailures = (await check()).filter(
    (problem) => problem.code === "typescript-mismatch",
  );
  expect(typeFailures).toHaveLength(1);
  expect(typeFailures[0]?.brief).toContain("配置=tsconfig.json");
  expect(typeFailures[0]?.brief).toContain(
    'include={"base":".","patterns":["src/**/*.ts","test/**/*.ts"]}',
  );
  expect(typeFailures[0]?.brief).toContain("未匹配文件");
  expect(typeFailures[0]?.brief).toContain("成员=packages/a");
  expect(typeFailures[0]?.brief).toContain("成员=packages/b");
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    include: ["packages/**/*.ts"],
  });
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace("test/**/*.test.ts", "missing/**/*.test.ts"),
  );
  const failures = (await check()).filter(
    (problem) => problem.code === "testing-mismatch",
  );
  expect(failures).toHaveLength(1);
  for (const name of ["a", "b"]) {
    expect(failures[0]?.brief).toContain(`成员=packages/${name}`);
    expect(failures[0]?.brief).toContain(`实际 root=packages/${name}`);
    expect(failures[0]?.brief).toContain(`packages/${name}/test/index.test.ts`);
  }
  expect(failures[0]?.brief).toContain('include=["missing/**/*.test.ts"]');
  expect(failures[0]?.brief).toContain("配置=vitest.config.ts");
  await put(
    root,
    "packages/b/vitest.config.ts",
    vitestConfig.replace("test/**/*.test.ts", "other/**/*.test.ts"),
  );
  expect(
    (await check()).filter((problem) => problem.code === "testing-mismatch"),
  ).toHaveLength(2);
});
it("uses the explicitly selected ESLint config and member cwd patterns rather than nested per-file discovery", async () => {
  await put(root, "src/nested/index.ts", "export {};");
  await put(root, "src/nested/eslint.config.js", "export default [];");
  expect(await check()).toEqual([]);
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  await put(root, "packages/a/package.json", {
    name: "a",
    private: true,
    engines: { node: ">=22" },
  });
  await put(root, "packages/a/src/index.ts", "export {};");
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    include: ["src/**/*.ts", "test/**/*.ts", "packages/**/*.ts"],
  });
  await put(
    root,
    "eslint.config.js",
    lintConfig.replaceAll('["**/*.ts"]', '["src/**/*.ts", "test/**/*.ts"]'),
  );
  expect(await check()).toEqual([]);
  await put(
    root,
    "eslint.config.js",
    lintConfig.replaceAll('["**/*.ts"]', '["packages/**/*.ts"]'),
  );
  const failures = (await check()).filter(
    (problem) => problem.code === "lint-mismatch",
  );
  expect(
    failures.some(
      (problem) =>
        problem.brief.includes("成员=packages/a") &&
        problem.brief.includes("执行 root=packages/a"),
    ),
  ).toBe(true);
});
it("does not reinterpret observed frozen-install/check steps as absent when Node selection blocks execution", async () => {
  await put(
    root,
    ".github/workflows/ci.yaml",
    workflow.replace("node-version-file: .node-version", "node-version: 22"),
  );
  const failures = (await check()).filter((p) => p.code.startsWith("ci-"));
  expect(failures).toHaveLength(1);
  expect(failures[0]?.brief).toContain('"node-version":22');
  expect(failures[0]?.brief).toContain("Node selection without override");
  expect(failures[0]?.brief).not.toContain("未声明根 pnpm check");
  expect(failures[0]?.brief).not.toContain("未在 checkout 后声明");
  await put(
    root,
    ".github/workflows/ci.yaml",
    workflow
      .replace("node-version-file: .node-version", "node-version: 22")
      .replace("      - run: pnpm install --frozen-lockfile\n", ""),
  );
  expect(
    (await check()).find((p) => p.code.startsWith("ci-"))?.brief,
  ).toContain("Node selection without override");
});
it.each([
  "pnpm exec node scripts/check.mjs",
  "node --import ./loader.mjs scripts/check.mjs",
  "node scripts/check.cjs",
  "tsx scripts/check.ts",
  "node ../other/scripts/check.mjs",
  "node scripts/lib/check.mjs",
  "node scripts/check.mjs && pnpm test",
  "node scripts/check.mjs --extra",
])("rejects a noncanonical package script interface: %s", async (command) => {
  await put(root, "package.json", {
    ...manifest,
    scripts: { ...manifest.scripts, check: command },
  });
  expect((await check()).map((p) => p.code)).toEqual(["gate-mismatch"]);
});
it("reports missing entries and orphan top-level files but exempts shared modules", async () => {
  await rm(join(root, "scripts", "lint.mjs"));
  await put(root, "scripts/orphan.mjs", "export {};");
  await put(root, "scripts/helper.js", "export {};");
  await put(
    root,
    "scripts/lib/helpers.mjs",
    'throw new Error("DO NOT EXECUTE");',
  );
  const problems = await check();
  expect(problems.map((p) => p.code)).toEqual([
    "gate-missing",
    "gate-mismatch",
    "gate-mismatch",
  ]);
  expect(problems.some((p) => p.brief.includes("scripts/lib/"))).toBe(true);
  expect(
    problems.some((p) => p.brief.startsWith("scripts/lib/commands.mjs")),
  ).toBe(false);
});
it.each([
  "format:check",
  "test:coverage",
  "lint:package",
  "test:watch",
  "lint:fix",
  "custom:task",
])("rejects every colon-bearing script name: %s", async (name) => {
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      [name]: `node scripts/${name.replaceAll(":", "-")}.mjs`,
    },
  });
  expect(await check()).toEqual([
    expect.objectContaining({
      code: "gate-mismatch",
      brief: expect.stringContaining(`无效 script 名称: ${name}`) as unknown,
    }),
  ]);
});
it("validates optional and lifecycle scripts with the same structural rule", async () => {
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      precheck: "node scripts/precheck.mjs",
      dev: "node scripts/dev.mjs",
      "lint.extra": "node scripts/lint.extra.mjs",
      检查: "node scripts/检查.mjs",
    },
  });
  await put(root, "scripts/precheck.mjs", "await arbitraryHook();");
  await put(root, "scripts/dev.mjs", "await arbitraryServer();");
  await put(root, "scripts/lint.extra.mjs", "export {};");
  await put(root, "scripts/检查.mjs", "export {};");
  expect(await check()).toEqual([]);
});
it("rejects script names that cannot map to a local top-level entry", async () => {
  await put(root, "package.json", {
    ...manifest,
    scripts: { ...manifest.scripts, "../escape": "node scripts/../escape.mjs" },
  });
  expect((await check()).map((p) => p.code)).toEqual(["gate-mismatch"]);
});
it("does not interpret config-like entry names as independent tool configurations", async () => {
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      "eslint.config": "node scripts/eslint.config.mjs",
      "prettier.config": "node scripts/prettier.config.mjs",
    },
  });
  await put(root, "scripts/eslint.config.mjs", " ".repeat(1_048_577));
  await put(
    root,
    "scripts/prettier.config.mjs",
    "export default unknownImplementation();",
  );
  expect(await check()).toEqual([]);
});
it("recognizes JSONC comments/trailing commas without damaging strings", () => {
  expect(
    jsonc('{ "url": "https://example.test/*", /* x */ "yes": true, }'),
  ).toEqual({ url: "https://example.test/*", yes: true });
});
it("rejects a modified fixed coverage entry independently of its tool configuration", async () => {
  await put(
    root,
    "scripts/test-coverage.mjs",
    "export default unknownCoverageImplementation();",
  );
  expect((await check()).map((p) => p.code)).toEqual(["gate-mismatch"]);
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace("branches: 90", "branches: 101"),
  );
  expect((await check()).map((p) => p.code)).toEqual([
    "gate-mismatch",
    "coverage-mismatch",
  ]);
});
it("keeps independent CI and lint failures when coverage blocks dependent checks", async () => {
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      test: manifest.scripts.test,
      "test-coverage": manifest.scripts["test-coverage"],
    },
  });
  await rm(join(root, "eslint.config.js"));
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace("branches: 90", "branches: 101"),
  );
  await put(
    root,
    ".github\\workflows\\ci.yaml",
    workflow.replace("--frozen-lockfile", ""),
  );
  expect((await check()).map((p) => p.code)).toEqual([
    "lint-missing",
    "coverage-mismatch",
    "ci-mismatch",
  ]);
});
it("skips coverage diagnostics when test discovery is unconfirmed", async () => {
  await put(root, "vitest.config.ts", "export default unknownConfiguration();");
  expect((await check()).map((p) => p.code)).toEqual(["testing-unconfirmed"]);
});
it("allows a generated lockfile formatting exclusion but names excluded maintained configurations once", async () => {
  await put(root, ".prettierignore", "pnpm-lock.yaml\n");
  expect(await check()).toEqual([]);
  await put(root, ".prettierignore", "pnpm-lock.yaml\ntsconfig.json\n");
  const problems = await check();
  expect(problems.map((p) => p.code)).toEqual(["formatting-mismatch"]);
  expect(problems[0]?.brief).toContain("tsconfig.json");
  expect(problems[0]?.brief).not.toContain("pnpm-lock.yaml");
});
it("allows unrelated extra jobs and explicit benign setup options", async () => {
  await put(
    root,
    ".github/workflows/ci.yaml",
    workflow.replace(
      "cache: true",
      "cache: true\n          run_install: false",
    ) +
      `
  aggregate:
    needs: check
    if: always()
    steps:
      - run: echo done
`,
  );
  expect(await check()).toEqual([]);
});
it("reports CI root tool selection once while retaining independent checks", async () => {
  await put(
    root,
    ".github/workflows/ci.yaml",
    workflow.replace("node-version-file: .node-version", "node-version: 24"),
  );
  const problems = await check();
  expect(problems.map((p) => p.code)).toEqual(["ci-mismatch"]);
  expect(problems[0]?.brief).toContain("Node selection without override");
});
it("does not accept pnpm auto-install as the explicit frozen installation step", async () => {
  await put(
    root,
    ".github/workflows/ci.yaml",
    workflow.replace("cache: true", "cache: true\n          run_install: true"),
  );
  expect((await check()).map((p) => p.code)).toEqual(["ci-mismatch"]);
});
it("allows explicit additional test entries without changing fixed implementations", async () => {
  await put(
    root,
    "scripts/lib/release.test.js",
    'throw new Error("DO NOT EXECUTE");',
  );
  await put(
    root,
    "scripts/test-extra.mjs",
    'import "./lib/release.test.js"; process.exit(0);',
  );
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      "test-extra": "node scripts/test-extra.mjs",
    },
  });
  expect(await check()).toEqual([]);
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      "test-extra": "node scripts/test-extra.mjs",
      check: `node scripts/release.test.js && ${manifest.scripts.check}`,
    },
  });
  const problems = await check();
  expect(problems.map((p) => p.code)).toContain("gate-mismatch");
  expect(
    problems.some((p) => p.brief.includes("必须为 node scripts/check.mjs")),
  ).toBe(true);
});
it("accepts opaque custom build interfaces but rejects shell suffixes", async () => {
  await put(root, "scripts/build.mjs", "export default customBuild();");
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      build: "node scripts/build.mjs",
    },
  });
  expect(await check()).toEqual([]);
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      build: "node scripts/build.mjs",
      check: `${manifest.scripts.check} && pnpm build && node unknown.mjs`,
    },
  });
  const problems = await check();
  expect(problems.map((p) => p.code)).toEqual(["gate-mismatch"]);
  expect(problems[0]?.brief).toContain("必须为 node scripts/check.mjs");
});
it("keeps independent gate safety checks when lint blocks capability linkage", async () => {
  await rm(join(root, "eslint.config.js"));
  await put(root, "package.json", {
    ...manifest,
    scripts: { ...manifest.scripts, check: "pnpm format" },
  });
  const problems = await check();
  expect(problems.map((p) => p.code)).toContain("lint-missing");
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "gate-mismatch",
      brief:
        'package.json scripts["check"] = "pnpm format"；必须为 node scripts/check.mjs（无参数）',
    }),
  );
});
it("checks CI interface invocation independently of an invalid root interface", async () => {
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      check: "pnpm typecheck && pnpm lint && pnpm format-check",
    },
  });
  expect((await check()).map((p) => p.code)).toEqual(["gate-mismatch"]);
});
it("checks effective strict flags rather than strict:true alone", async () => {
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    compilerOptions: { strictNullChecks: false },
    include: ["src/**/*.ts", "test/**/*.ts"],
  });
  expect(await check()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "typescript-mismatch",
        brief: expect.stringContaining("strict") as unknown,
      }),
    ]),
  );
});
it("detects lint ignores and excluded test typecheck scope", async () => {
  await put(
    root,
    "eslint.config.js",
    lintConfig.replace('"**/dist/**"', '"src/**"'),
  );
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    include: ["src/**/*.ts"],
  });
  const codes = (await check()).map((p) => p.code);
  expect(codes).toContain("lint-mismatch");
  expect(codes).toContain("typescript-mismatch");
});
it("does not execute or accept dynamically computed config", async () => {
  await put(
    root,
    "vitest.config.ts",
    'throw new Error("MUST NOT RUN"); export default process.env.CI ? {} : {};',
  );
  expect((await check()).map((p) => p.code)).toContain("testing-unconfirmed");
  expect(() =>
    javascript("export default { test: (() => { throw 1 })() };"),
  ).toThrow("unsupported");
  expect(() =>
    javascript(
      'import bad from "https://example.test/config"; export default bad;',
    ),
  ).toThrow("not loaded");
});
it("detects coverage excluding sources, missing thresholds and no-test success", async () => {
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace(
      'provider: "v8"',
      'provider: "v8", exclude: ["src/**"]',
    ),
  );
  expect((await check()).map((p) => p.code)).toContain("coverage-mismatch");
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace("branches: 90,", ""),
  );
  expect((await check()).map((p) => p.code)).toContain("coverage-mismatch");
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace(
      'include: ["test/**/*.test.ts"]',
      'passWithNoTests: true, include: ["test/**/*.test.ts"]',
    ),
  );
  expect((await check()).map((p) => p.code)).toContain("testing-mismatch");
});
it("does not follow traversal or symlinks, and keeps missing-root I/O as a fault", async () => {
  await put(root, "tsconfig.json", { extends: "../outside.json" });
  expect((await check()).map((p) => p.code)).toContain(
    "typescript-unconfirmed",
  );
  const link = join(root, "linked");
  await symlink(resolve(root, ".."), link, "junction");
  expect((await check()).map((p) => p.code)).toContain("scope-unconfirmed");
  await expect(
    inspect(
      { projectDirectory: join(root, "absent") },
      new AbortController().signal,
      () => undefined,
      await testEvidence(),
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
  await expect(
    inspect(
      { projectDirectory: root, requirements: null } as unknown as Input,
      new AbortController().signal,
      () => undefined,
      await testEvidence(),
    ),
  ).rejects.toThrow("Invalid input");
});
it("requires CI failure propagation, ordering and non-filtered triggers", async () => {
  await put(
    root,
    ".github\\workflows\\ci.yaml",
    workflow.replace(
      "- run: pnpm check",
      "- run: pnpm check\n        continue-on-error: true",
    ),
  );
  expect((await check()).map((p) => p.code)).toContain("ci-mismatch");
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      check: "pnpm typecheck; pnpm lint; pnpm format; pnpm test",
    },
  });
  expect((await check()).map((p) => p.code)).toContain("gate-mismatch");
});
it.each([1, 2])(
  "handles %s-member pnpm/turbo workspaces with declared shared schedulers",
  async (memberCount) => {
    await put(root, "pnpm-workspace.yaml", {
      packages: ["packages/*"],
      catalog: { ...catalog, turbo: "^2.11.10" },
    });
    await put(root, "turbo.json", {
      tasks: { typecheck: {}, lint: {}, test: {}, "test-coverage": {} },
    });
    const workspaceManifest = {
      ...manifest,
      devDependencies: {
        ...manifest.devDependencies,
        vitest: "catalog:",
        turbo: "catalog:",
      },
      scripts: manifest.scripts,
    };
    await put(root, "package.json", workspaceManifest);
    for (const name of ["a", "b"].slice(0, memberCount)) {
      const member = join(root, "packages", name);
      await fixture(member);
      await put(member, "package.json", {
        name,
        private: true,
        engines: { node: ">=22" },
        scripts: manifest.scripts,
      });
      await rm(join(member, "eslint.config.js"));
      await rm(join(member, "AGENTS.md"));
      await put(member, "tsconfig.json", {
        extends: "../../tsconfig.base.json",
        include: ["src/**/*.ts", "test/**/*.ts"],
      });
    }
    const { readFile } = await import("node:fs/promises");
    const turboLock =
      "      turbo:\n        specifier: 'catalog:'\n        version: '2.11.10'\n";
    const workspaceLock =
      (await readFile(join(root, "pnpm-lock.yaml"), "utf8")).replace(
        "specifier: '^5.0.4'",
        "specifier: 'catalog:'",
      ) + turboLock;
    await put(root, "pnpm-lock.yaml", workspaceLock);
    // The aggregate root has no code responsibility of its own.
    await rm(join(root, "src"), { recursive: true });
    await rm(join(root, "test"), { recursive: true });
    expect(await check()).toEqual([]);
    await put(root, "package.json", {
      ...workspaceManifest,
      devDependencies: { ...manifest.devDependencies, vitest: "catalog:" },
    });
    await put(
      root,
      "pnpm-lock.yaml",
      workspaceLock.replace(turboLock, "") +
        "  unrelated:\n    devDependencies:\n      turbo:\n        specifier: '^2.11.10'\n        version: '2.11.10'\n",
    );
    const missing = (await check()).filter(
      (p) => p.code === "dependency-missing",
    );
    expect(missing.some((p) => p.brief.startsWith(".: turbo"))).toBe(true);
    expect(missing.some((p) => p.brief.startsWith("packages/a: turbo"))).toBe(
      false,
    );
    await put(root, "package.json", workspaceManifest);
    expect(await check()).toContainEqual(
      expect.objectContaining({
        code: "dependency-unconfirmed",
        brief: expect.stringContaining("turbo: 目标 importer") as unknown,
      }),
    );
    await put(root, "pnpm-lock.yaml", workspaceLock);
    expect(await check()).toEqual([]);
    const member = join(root, "packages", "a");
    const memberManifest = JSON.parse(
      await readFile(join(member, "package.json"), "utf8"),
    ) as typeof manifest;
    await put(member, "package.json", {
      ...memberManifest,
      scripts: {
        ...memberManifest.scripts,
        test: "vitest run --root . --config ../../vitest.config.ts",
        "test-coverage": "vitest run --root . --config ../../vitest.config.ts",
      },
    });
    const partial = await check();
    expect(partial.map((p) => p.code)).toEqual([
      "gate-mismatch",
      "gate-mismatch",
    ]);
    expect(partial[0]?.brief).toContain("packages/a/package.json");
    await put(member, "package.json", memberManifest);
    await put(root, "packages\\uncovered\\package.json", {
      name: "uncovered",
      scripts: {},
    });
    await put(
      root,
      "packages\\uncovered\\src\\index.ts",
      "export const uncovered = 1;",
    );
    const problems = await check();
    expect(problems.map((p) => p.code)).toEqual(
      expect.arrayContaining(["typescript-mismatch", "lint-mismatch"]),
    );
  },
);
it("rejects input scopes and bounds file sizes", async () => {
  const input: Input = {
    projectDirectory: root,
    projectScopes: ["../elsewhere"],
  } as unknown as Input;
  const codes: string[] = [];
  await expect(
    inspect(
      input,
      new AbortController().signal,
      (code) => codes.push(code),
      await testEvidence(),
    ),
  ).rejects.toThrow("Invalid input");
  await put(root, "vitest.config.ts", " ".repeat(1_048_577));
  expect((await check()).map((p) => p.code)).toContain("testing-unconfirmed");
});
it("does not accept fabricated preset/reference markers or unknown ignore branches", async () => {
  await put(
    root,
    "eslint.config.js",
    `export default [
    { __typeAwarePreset: true, files: ["**/*.ts"], languageOptions: { parserOptions: { projectService: true } } }
  ];`,
  );
  expect((await check()).map((p) => p.code)).toContain("lint-unconfirmed");
  await put(
    root,
    "eslint.config.js",
    `const fake = { reference: "typescript-eslint.configs.recommendedTypeChecked" }; export default [...fake];`,
  );
  expect((await check()).map((p) => p.code)).toContain("lint-unconfirmed");
  await put(
    root,
    "eslint.config.js",
    lintConfig.replace('"**/dist/**"', '"src/**", "!src/index.ts"'),
  );
  expect((await check()).map((p) => p.code)).toContain("lint-unconfirmed");
});
it("respects files-only tsconfig scope, output exclusions and rejects inline CLI options", async () => {
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    files: ["src/index.ts"],
  });
  expect((await check()).map((p) => p.code)).toContain("typescript-mismatch");
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    compilerOptions: { outDir: "src" },
  });
  expect((await check()).map((p) => p.code)).toContain("typescript-mismatch");
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      typecheck: "tsc -p tsconfig.json --project ignored.json",
    },
  });
  expect((await check()).map((p) => p.code)).toContain("gate-mismatch");
});
it("treats test helpers as lint/typecheck inputs, not required executable tests", async () => {
  await put(root, "test\\helper.ts", "export const helper = 1;");
  expect(await check()).toEqual([]);
});
it("detects Prettier gitignore exclusions and unsupported CommonJS config", async () => {
  await put(root, ".gitignore", "src/\n");
  expect((await check()).map((p) => p.code)).toContain("formatting-mismatch");
  await rm(join(root, ".gitignore"));
  await put(
    root,
    ".prettierrc.cjs",
    "module.exports = process.env.CI ? {} : {};",
  );
  expect((await check()).map((p) => p.code)).toContain(
    "formatting-unconfirmed",
  );
});
it("rejects false capability relaxations", async () => {
  await expect(
    check({
      typescript: { strict: false },
      lint: { typeAware: false },
      testing: { nonWatch: false, failOnNoTests: false },
      formatting: { checkOnly: false },
    }),
  ).rejects.toThrow("Invalid input");
});
it("does not anchor implicit inherited TypeScript include at the base config", async () => {
  await put(root, "config\\base.json", { compilerOptions: { strict: true } });
  await put(root, "tsconfig.json", {
    extends: "./config/base.json",
    compilerOptions: {
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noImplicitOverride: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
    },
  });
  expect(await check()).toEqual([]);
  await put(root, "tsconfig.json", {
    extends: "./config/base.json",
    include: ["config/**/*.ts"],
  });
  expect((await check()).map((p) => p.code)).toContain("typescript-mismatch");
});
it("does not overlook nested dynamic formatting or the explicitly selected dynamic ESLint configuration", async () => {
  await put(
    root,
    "src\\prettier.config.js",
    "export default (() => ({ printWidth: 80 }))();",
  );
  expect((await check()).map((p) => p.code)).toContain(
    "formatting-unconfirmed",
  );
  await put(
    root,
    "eslint.config.js",
    "export default process.env.CI ? [] : [];",
  );
  expect((await check()).map((p) => p.code)).toContain("lint-unconfirmed");
});
it("does not require emit-only build configs to cover tests when a full typecheck exists", async () => {
  await put(root, "tsconfig.build.json", {
    extends: "./tsconfig.base.json",
    include: ["src/**/*.ts"],
  });
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      build: "node scripts/build.mjs",
      ...manifest.scripts,
    },
  });
  await put(root, "scripts/build.mjs", "export default unknownBuilder();");
  expect(await check()).toEqual([]);
});
it.each(["exit 0", "cd ignored", "export CI=true"])(
  "does not prove a gate through shell builtin %s",
  async (prefix) => {
    await put(root, "package.json", {
      ...manifest,
      scripts: {
        ...manifest.scripts,
        check: `${prefix} && ${manifest.scripts.check}`,
      },
    });
    expect((await check()).map((p) => p.code)).toContain("gate-mismatch");
  },
);
it("does not accept excluded main or tag-only CI triggers", async () => {
  await put(
    root,
    ".github\\workflows\\ci.yaml",
    workflow.replace("[main]", '[main, "!main"]'),
  );
  expect((await check()).map((p) => p.code)).toContain("ci-unconfirmed");
  await put(
    root,
    ".github\\workflows\\ci.yaml",
    workflow.replace("branches: [main]", 'tags: ["v*"]'),
  );
  expect((await check()).map((p) => p.code)).toContain("ci-mismatch");
});
it("rejects legacy relaxations of write formatting and no-test success", async () => {
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      format: "prettier --write .",
      test: "vitest run --coverage --passWithNoTests",
    },
  });
  await expect(
    check({
      formatting: { checkOnly: false },
      testing: { failOnNoTests: false },
    }),
  ).rejects.toThrow("Invalid input");
});
it("does not interpret custom pnpm script shells or package hooks", async () => {
  await put(root, ".npmrc", "script-shell=./unknown-executor\n");
  expect((await check()).map((p) => p.code)).toEqual(["scope-unconfirmed"]);
  await rm(join(root, ".npmrc"));
  await put(root, ".pnpmfile.cjs", 'throw new Error("DO NOT EXECUTE HOOKS");');
  expect((await check()).map((p) => p.code)).toEqual(["scope-unconfirmed"]);
});
it("does not treat invalid target boolean strings or parser overrides as effective facts", async () => {
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    compilerOptions: { strictNullChecks: "false" },
  });
  expect((await check()).map((p) => p.code)).toContain(
    "typescript-unconfirmed",
  );
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace(
      'include: ["test/**/*.test.ts"]',
      'passWithNoTests: "false", include: ["test/**/*.test.ts"]',
    ),
  );
  expect((await check()).map((p) => p.code)).toContain("testing-unconfirmed");
  await put(
    root,
    "eslint.config.js",
    lintConfig.replace(
      "projectService: true",
      "projectService: true, programs: []",
    ),
  );
  expect((await check()).map((p) => p.code)).toContain("lint-unconfirmed");
});
it.each([
  [{ module: "CommonJS", moduleResolution: "NodeNext" }, "typescript-mismatch"],
  [{ module: "ES2022", moduleResolution: "Node16" }, "typescript-mismatch"],
  [{ module: "NodeNext", moduleResolution: "Node10" }, "typescript-mismatch"],
  [{ module: "AMD", moduleResolution: "Bundler" }, "typescript-mismatch"],
  [{ module: "future-module" }, "typescript-unconfirmed"],
  [{ moduleResolution: 99 }, "typescript-unconfirmed"],
  [{ target: "ES-future" }, "typescript-unconfirmed"],
  [
    { module: "CommonJS", moduleResolution: "Bundler" },
    "typescript-unconfirmed",
  ],
])(
  "rejects unsupported or incompatible explicit compiler modes %#",
  async (compilerOptions, code) => {
    await put(root, "tsconfig.json", {
      extends: "./tsconfig.base.json",
      compilerOptions,
      include: ["src/**/*.ts", "test/**/*.ts"],
    });
    expect((await check()).map((problem) => problem.code)).toContain(code);
  },
);
it.each([
  { module: "nOdEnExT", moduleResolution: "NodeNext", target: "ES2022" },
  { module: "ESNext", moduleResolution: "Bundler", target: "ES2020" },
  { module: "NodeNext", moduleResolution: "Node16", target: "ES2022" },
])(
  "accepts supported compatible compiler modes %# without imposing a universal target",
  async (compilerOptions) => {
    await put(root, "tsconfig.json", {
      extends: "./tsconfig.base.json",
      compilerOptions,
      include: ["src/**/*.ts", "test/**/*.ts"],
    });
    expect(await check()).toEqual([]);
  },
);
it("does not vacuously pass without observable TS files", async () => {
  await rm(join(root, "src"), { recursive: true });
  await rm(join(root, "test"), { recursive: true });
  const problems = await check();
  expect(problems.map((problem) => problem.code)).toContain(
    "typescript-unconfirmed",
  );
});
it.each(["101", "1e309", '"65"', "null"])(
  "rejects observed coverage percentages outside finite 0..100: %s",
  async (value) => {
    await put(
      root,
      "vitest.config.ts",
      vitestConfig.replace("branches: 90", `branches: ${value}`),
    );
    expect((await check()).map((problem) => problem.code)).toContain(
      "coverage-mismatch",
    );
  },
);
it.each([0, 65, 72.5, 100])(
  "accepts explicit project-selected coverage thresholds of %s without a fixed minimum",
  async (threshold) => {
    await put(
      root,
      "vitest.config.ts",
      vitestConfig.replace(
        /(?:branches|functions|lines|statements): 90/g,
        (metric) => metric.replace("90", String(threshold)),
      ),
    );
    expect(await check()).toEqual([]);
  },
);
it.each([true, false])(
  "accepts optional boolean subprocess coverage collection: %s",
  async (autoAttachSubprocess) => {
    const config = vitestConfig
      .replace(
        'provider: "v8",',
        `provider: "v8", autoAttachSubprocess: ${autoAttachSubprocess},`,
      )
      .replace(/: 90/g, ": 65");
    await put(root, "vitest.config.ts", config);
    expect(await check()).toEqual([]);
    for (const invalid of ["", "branches: 101,"]) {
      await put(
        root,
        "vitest.config.ts",
        config.replace("branches: 65,", invalid),
      );
      expect((await check()).map((p) => p.code)).toContain("coverage-mismatch");
    }
    await put(
      root,
      "vitest.config.ts",
      config.replace('include: ["src/**/*.ts"],', 'include: ["lib/**/*.ts"],'),
    );
    expect((await check()).map((p) => p.code)).toContain("coverage-mismatch");
  },
);
it.each(['"true"', "1", "null"])(
  "rejects nonboolean subprocess coverage collection: %s",
  async (value) => {
    await put(
      root,
      "vitest.config.ts",
      vitestConfig.replace(
        'provider: "v8",',
        `provider: "v8", autoAttachSubprocess: ${value},`,
      ),
    );
    expect(await check()).toContainEqual(
      expect.objectContaining({
        code: "coverage-unconfirmed",
        brief: expect.stringContaining(
          `coverage.autoAttachSubprocess 观察值=${value}`,
        ) as unknown,
      }),
    );
  },
);
it("does not accept unrelated unknown coverage fields", async () => {
  await put(
    root,
    "vitest.config.ts",
    vitestConfig.replace(
      'provider: "v8",',
      'provider: "v8", unknownCollection: true,',
    ),
  );
  expect((await check()).map((p) => p.code)).toContain("coverage-unconfirmed");
});
