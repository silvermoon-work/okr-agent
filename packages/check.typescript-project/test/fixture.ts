import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InspectionEvidence } from "../src/convention.js";
import { metadataFixture } from "./metadata-fixture.js";

export async function testEvidence(): Promise<InspectionEvidence> {
  const agents = await readFile(
    new URL("../assets/AGENTS.md", import.meta.url),
  );
  return {
    agents,
    publisher: await readFile(
      new URL("../assets/npm-publish.mjs", import.meta.url),
    ),
    publishWorkflow: await readFile(
      new URL("../assets/npm-publish.yaml", import.meta.url),
    ),
    ciWorkflow: await readFile(
      new URL("../assets/npm-ci.yaml", import.meta.url),
    ),
    metadata: metadataFixture(),
  };
}

export const strict = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
};
export const manifest = {
  name: "fixture",
  private: true,
  packageManager: "pnpm@11.22.0",
  engines: { node: ">=22" },
  devDependencies: {
    typescript: "^6.0.3",
    vitest: "^5.0.4",
    eslint: "^10.14.0",
    "typescript-eslint": "^8.72.1",
    "@eslint/js": "^10.0.1",
    prettier: "^3.9.10",
    "@vitest/coverage-v8": "^5.0.4",
  },
  scripts: {
    typecheck: "tsc --noEmit -p tsconfig.json",
    lint: "eslint .",
    "format:check": "prettier --check .",
    format: "prettier --write .",
    test: "vitest run --coverage",
    "test:coverage": "vitest run --coverage",
    check:
      "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage",
  },
};
export const lintConfig = `
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
 { ignores: ["**/dist/**", "**/coverage/**"] },
 eslint.configs.recommended,
 ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: ["**/*.ts"] })),
 { files: ["**/*.ts"], languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } }
);`;
export const vitestConfig = `
import { defineConfig } from "vitest/config";
export default defineConfig({ test: {
 include: ["test/**/*.test.ts"],
 coverage: { provider: "v8", include: ["src/**/*.ts"], thresholds: { branches: 90, functions: 90, lines: 90, statements: 90 } }
} });`;
export const workflow = `
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
`;
export async function put(
  root: string,
  path: string,
  value: string | object,
): Promise<void> {
  const full = join(root, ...path.split(/[\\/]/));
  await mkdir(dirname(full), { recursive: true });
  await writeFile(
    full,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}
export async function fixture(root: string): Promise<void> {
  await put(root, "package.json", manifest);
  await put(
    root,
    "pnpm-lock.yaml",
    `lockfileVersion: '9.0'\nimporters:\n  .:\n    devDependencies:\n${Object.entries(
      manifest.devDependencies,
    )
      .map(
        ([name, range]) =>
          `      '${name}':\n        specifier: '${range}'\n        version: '${range.slice(1)}'`,
      )
      .join("\n")}\n`,
  );
  await put(root, ".node-version", "24.11.0\n");
  await put(
    root,
    "AGENTS.md",
    await readFile(new URL("../assets/AGENTS.md", import.meta.url), "utf8"),
  );
  await put(root, "README.md", "Project");
  await put(root, "CONTRIBUTING.md", "Contribute");
  await put(root, "docs/agent-project.md", "Project guidance");
  await put(
    root,
    ".gitignore",
    "node_modules/\ndist/\ncoverage/\n.turbo/\n.env\n.env.*\n",
  );
  await put(
    root,
    ".git/config",
    '[remote "origin"]\nurl = https://github.com/acme/project.git\n[branch "main"]\nmerge = refs/heads/main\n',
  );
  await put(
    root,
    "tsconfig.base.json",
    `// local inheritance\n${JSON.stringify({ compilerOptions: strict })}`,
  );
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    include: ["src/**/*.ts", "test/**/*.ts"],
  });
  await put(root, "eslint.config.js", lintConfig);
  await put(root, "vitest.config.ts", vitestConfig);
  await put(root, ".github\\workflows\\ci.yaml", workflow);
  // Deliberately incorrect code and a failing/side-effecting test are inert data.
  await put(
    root,
    "src\\index.ts",
    'const value: number = "not a number"; export { value };',
  );
  await put(
    root,
    "test\\index.test.ts",
    'throw new Error("DO NOT EXECUTE TARGET TESTS");',
  );
}

export async function npmFixture(root: string): Promise<void> {
  await fixture(root);
  const assets = await testEvidence();
  await put(root, "package.json", {
    ...manifest,
    name: "@acme/library",
    version: "1.2.0-rc.0",
    private: false,
    type: "module",
    description: "An ESM library",
    keywords: ["typescript"],
    license: "MIT",
    engines: { node: ">=22.15.0" },
    repository: { type: "git", url: "https://github.com/acme/library.git" },
    homepage: "https://github.com/acme/library",
    bugs: { url: "https://github.com/acme/library/issues" },
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./package.json": "./package.json",
    },
    files: ["dist", "src", "README.md", "LICENSE"],
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
    devDependencies: {
      ...manifest.devDependencies,
      publint: "^0.3.25",
      semver: "^7.8.5",
    },
    scripts: {
      ...manifest.scripts,
      build: "tsc -p tsconfig.build.json",
      "lint:package": "publint",
      check: `${manifest.scripts.check} && pnpm build && pnpm lint:package`,
    },
  });
  const lock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  await put(
    root,
    "pnpm-lock.yaml",
    `${lock}      publint:\n        specifier: '^0.3.25'\n        version: '0.3.25'\n      semver:\n        specifier: '^7.8.5'\n        version: '7.8.5'\n`,
  );
  await put(root, "tsconfig.build.json", {
    extends: "./tsconfig.base.json",
    compilerOptions: {
      rootDir: "src",
      outDir: "dist",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      declaration: true,
      sourceMap: true,
      declarationMap: true,
      inlineSources: true,
    },
    include: ["src/**/*.ts"],
  });
  await put(root, "LICENSE", "MIT License");
  await put(
    root,
    ".gitignore",
    `${await readFile(join(root, ".gitignore"), "utf8")}.release-artifacts/\n`,
  );
  await put(
    root,
    ".github/workflows/ci.yaml",
    Buffer.from(assets.ciWorkflow).toString("utf8"),
  );
  await put(
    root,
    ".github/workflows/npm-publish.yaml",
    Buffer.from(assets.publishWorkflow).toString("utf8"),
  );
  await put(
    root,
    ".github/scripts/npm-publish.mjs",
    Buffer.from(assets.publisher).toString("utf8"),
  );
  await put(root, "release.config.json", {
    schemaVersion: 1,
    package: { id: "library", name: "@acme/library", directory: "." },
    ci: { nodeVersions: ["22.15.0", "24.11.0"] },
  });
}
