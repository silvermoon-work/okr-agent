import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InspectionEvidence } from "../src/convention.js";
import { metadataFixture } from "./metadata-fixture.js";
import { scriptResources } from "../src/script-profile.js";

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
    scripts: Object.fromEntries(
      await Promise.all(
        scriptResources.map(
          async ([name, path]) =>
            [
              name,
              await readFile(new URL(`../assets/${path}`, import.meta.url)),
            ] as const,
        ),
      ),
    ),
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
export const catalog = {
  typescript: "^6.0.3",
  vitest: "^5.0.4",
  eslint: "^10.14.0",
  "typescript-eslint": "^8.72.1",
  "@eslint/js": "^10.0.1",
  prettier: "^3.9.10",
  "@vitest/coverage-v8": "^5.0.4",
};
export const manifest = {
  name: "fixture",
  private: true,
  packageManager: "pnpm@11.22.0",
  engines: { node: ">=22" },
  devDependencies: {
    typescript: "catalog:",
    vitest: "catalog:",
    eslint: "catalog:",
    "typescript-eslint": "catalog:",
    "@eslint/js": "catalog:",
    prettier: "catalog:",
    "@vitest/coverage-v8": "catalog:",
  },
  scripts: {
    typecheck: "node scripts/typecheck.mjs",
    lint: "node scripts/lint.mjs",
    "format-check": "node scripts/format-check.mjs",
    format: "node scripts/format.mjs",
    test: "node scripts/test.mjs",
    "test-coverage": "node scripts/test-coverage.mjs",
    check: "node scripts/check.mjs",
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
export const workflow = await readFile(
  new URL("../assets/npm-ci.yaml", import.meta.url),
  "utf8",
);
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
  const assets = await testEvidence();
  await put(
    root,
    "scripts/lib/workflow-predicates.mjs",
    Buffer.from(assets.scripts["workflow-predicates"]!).toString("utf8"),
  );
  await put(
    root,
    "scripts/lib/deliverables.mjs",
    Buffer.from(assets.scripts["deliverables"]!).toString("utf8"),
  );
  for (const name of Object.keys(manifest.scripts))
    await put(
      root,
      `scripts/${name}.mjs`,
      Buffer.from(assets.scripts[name]!).toString("utf8"),
    );
  await put(
    root,
    "scripts/lib/commands.mjs",
    Buffer.from(assets.scripts["commands"]!).toString("utf8"),
  );
  await put(root, "pnpm-workspace.yaml", { catalog });
  await put(
    root,
    "pnpm-lock.yaml",
    `lockfileVersion: '9.0'\nimporters:\n  .:\n    devDependencies:\n${Object.entries(
      catalog,
    )
      .map(
        ([name, range]) =>
          `      '${name}':\n        specifier: 'catalog:'\n        version: '${range.slice(1)}'`,
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
  await put(root, "silvermoon.yaml", {
    deliverables: [{ path: ".", type: "npm", packageId: "library" }],
  });
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
      publint: "catalog:",
      semver: "catalog:",
      yaml: "^2.8.1",
      acorn: "^8.15.0",
    },
    scripts: {
      ...manifest.scripts,
      build: "node scripts/build.mjs",
      "lint-package": "node scripts/lint-package.mjs",
      release: "node scripts/release.mjs",
      "release-dry-run": "node scripts/release-dry-run.mjs",
    },
  });
  await put(
    root,
    "scripts/build.mjs",
    'throw new Error("DO NOT EXECUTE BUILD");',
  );
  await put(
    root,
    "scripts/lint-package.mjs",
    Buffer.from(assets.scripts["lint-package"]!).toString("utf8"),
  );
  for (const name of ["release", "release-dry-run"])
    await put(
      root,
      `scripts/${name}.mjs`,
      Buffer.from(assets.scripts[name]!).toString("utf8"),
    );
  const lock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  await put(root, "pnpm-workspace.yaml", {
    catalog: { ...catalog, publint: "^0.3.25", semver: "^7.8.5" },
  });
  await put(
    root,
    "pnpm-lock.yaml",
    `${lock}      publint:\n        specifier: 'catalog:'\n        version: '0.3.25'\n      semver:\n        specifier: 'catalog:'\n        version: '7.8.5'\n`,
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
    "scripts/lib/npm-publish.mjs",
    Buffer.from(assets.publisher).toString("utf8"),
  );
}

export async function cloudflareFixture(root: string): Promise<void> {
  await fixture(root);
  await put(root, "silvermoon.yaml", {
    deliverables: [{ path: ".", type: "cloudflare" }],
  });
  const versions = {
    wrangler: "4.162.0",
    "@cloudflare/vitest-plugin": "1.8.2",
    "@vitest/coverage-istanbul": "5.0.4",
  };
  await put(root, "package.json", {
    ...manifest,
    devDependencies: {
      ...manifest.devDependencies,
      ...Object.fromEntries(
        Object.keys(versions).map((name) => [name, "catalog:"]),
      ),
    },
  });
  await put(root, "pnpm-workspace.yaml", {
    catalog: {
      ...catalog,
      ...Object.fromEntries(
        Object.entries(versions).map(([name, version]) => [
          name,
          `^${version}`,
        ]),
      ),
    },
  });
  const lock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  await put(
    root,
    "pnpm-lock.yaml",
    `${lock}${Object.entries(versions)
      .map(
        ([name, version]) =>
          `      '${name}':\n        specifier: 'catalog:'\n        version: '${version}'\n`,
      )
      .join("")}`,
  );
  await put(root, "wrangler.jsonc", {
    name: "fixture-worker",
    compatibility_date: "2026-01-01",
    main: "src/worker.ts",
  });
  await put(
    root,
    "src/worker.ts",
    'export default {async fetch(): Promise<Response> {throw new Error("DO NOT EXECUTE");}} satisfies ExportedHandler<Env>;',
  );
  await put(
    root,
    "worker-configuration.d.ts",
    "declare namespace Cloudflare {interface Env {}} interface Env extends Cloudflare.Env {}",
  );
  await put(root, "tsconfig.json", {
    extends: "./tsconfig.base.json",
    compilerOptions: { types: ["./worker-configuration.d.ts"] },
    include: ["src/**/*.ts", "test/**/*.ts"],
  });
  await put(
    root,
    "vitest.config.ts",
    `import {cloudflareTest} from "@cloudflare/vitest-plugin";\n${vitestConfig.replace("defineConfig({ test:", 'defineConfig({plugins:[cloudflareTest({wrangler:{configPath:"./wrangler.jsonc"}})], test:').replace('provider: "v8"', 'provider: "istanbul"')}`,
  );
}
