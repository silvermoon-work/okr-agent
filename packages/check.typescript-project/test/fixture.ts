import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
  devDependencies: { typescript: "^6.0.3", vitest: "^5.0.4" },
  scripts: {
    typecheck: "tsc --noEmit -p tsconfig.json",
    lint: "eslint .",
    format: "prettier --check .",
    test: "vitest run --coverage",
    check: "pnpm typecheck && pnpm lint && pnpm format && pnpm test",
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
  await put(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'");
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
