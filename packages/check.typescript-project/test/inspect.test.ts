import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { inspect } from "../src/inspect.js";
import type { Input, ProblemCode } from "../src/contract.js";
import {
  fixture,
  put,
  manifest,
  vitestConfig,
  lintConfig,
  workflow,
  testEvidence,
} from "./fixture.js";
import { javascript, jsonc } from "../src/static.js";

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
it("recognizes JSONC comments/trailing commas without damaging strings", () => {
  expect(
    jsonc('{ "url": "https://example.test/*", /* x */ "yes": true, }'),
  ).toEqual({ url: "https://example.test/*", yes: true });
});
it("does not mistake threshold declarations for an enabled coverage gate", async () => {
  await put(root, "package.json", {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      test: "vitest run",
      "test:coverage": "vitest run",
    },
  });
  expect((await check()).map((p) => p.code)).toEqual(
    expect.arrayContaining([
      "coverage-missing",
      "gate-mismatch",
      "ci-mismatch",
    ]),
  );
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
it("detects coverage excluding sources, low thresholds and no-test success", async () => {
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
    vitestConfig.replace("branches: 90", "branches: 80"),
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
  expect((await check()).map((p) => p.code)).toContain("gate-unconfirmed");
});
it.each([1, 2])(
  "handles %s-member pnpm/turbo workspaces with declared shared schedulers",
  async (memberCount) => {
    await put(
      root,
      "pnpm-workspace.yaml",
      'packages: ["packages/*"]\ncatalog:\n  vitest: "^5.0.4"\n',
    );
    await put(root, "turbo.json", {
      tasks: { typecheck: {}, lint: {}, test: {}, "test:coverage": {} },
    });
    const workspaceManifest = {
      ...manifest,
      devDependencies: {
        ...manifest.devDependencies,
        vitest: "catalog:",
        turbo: "^2.11.10",
      },
      scripts: {
        typecheck: "turbo run typecheck",
        lint: "turbo run lint",
        format: "prettier --write .",
        "format:check": "prettier --check .",
        test: "turbo run test",
        "test:coverage": "turbo run test:coverage",
        check: "pnpm format:check && turbo run typecheck lint test:coverage",
      },
    };
    await put(root, "package.json", workspaceManifest);
    for (const name of ["a", "b"].slice(0, memberCount)) {
      const member = join(root, "packages", name);
      await fixture(member);
      await put(member, "package.json", {
        name,
        private: true,
        engines: { node: ">=22" },
        scripts: {
          typecheck: "tsc --noEmit -p tsconfig.json",
          lint: "eslint .",
          test: "vitest run --coverage --root . --config ../../vitest.config.ts",
          "test:coverage":
            "vitest run --coverage --root . --config ../../vitest.config.ts",
          "lint:all": "pnpm exec turbo run lint",
        },
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
      "      turbo:\n        specifier: '^2.11.10'\n        version: '2.11.10'\n";
    const workspaceLock =
      (await readFile(join(root, "pnpm-lock.yaml"), "utf8")).replace(
        "specifier: '^5.0.4'",
        "specifier: 'catalog:'",
      ) + turboLock;
    await put(root, "pnpm-lock.yaml", workspaceLock);
    // Root fixture has its own source, so give it direct commands too.
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
      true,
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
      expect.arrayContaining([
        "typescript-missing",
        "lint-missing",
        "testing-missing",
        "gate-mismatch",
      ]),
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
it("respects files-only tsconfig scope, output exclusions and duplicate CLI options", async () => {
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
  expect((await check()).map((p) => p.code)).toContain(
    "typescript-unconfirmed",
  );
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
  await put(root, "config\\tsconfig.json", {
    extends: "../tsconfig.base.json",
  });
  await put(root, "package.json", {
    ...manifest,
    scripts: { ...manifest.scripts, typecheck: "tsc -p config/tsconfig.json" },
  });
  expect((await check()).map((p) => p.code)).toContain("typescript-mismatch");
});
it("does not overlook nested dynamic formatting or per-file ESLint configuration", async () => {
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
    "src\\eslint.config.js",
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
      build: "tsc -p tsconfig.build.json",
      ...manifest.scripts,
    },
  });
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
    expect((await check()).map((p) => p.code)).toContain("gate-unconfirmed");
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
  expect((await check()).map((p) => p.code)).toContain("ci-unconfirmed");
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
it.each(["101", "1e309"])(
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
