import { resolve } from "node:path";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { Files, Unconfirmed } from "../src/files.js";
import { inspect } from "../src/inspect.js";
import type { ProblemCode } from "../src/contract.js";
import { convention } from "../src/convention.js";
import {
  catalog,
  lintConfig,
  manifest,
  strict,
  testEvidence,
  vitestConfig,
} from "./fixture.js";

vi.mock("../src/convention.js", () => ({ convention: vi.fn() }));
vi.mock(import("../src/script-profile.js"), async (importOriginal) => ({
  ...(await importOriginal()),
  scriptProfile: vi.fn(),
}));
vi.mock("../src/quality-workflow.js", () => ({
  qualityWorkflow: vi
    .fn()
    .mockResolvedValue({ nodeVersions: ["22.15.0", "24.11.0"] }),
}));
let data: Record<string, string>;
let scan: MockInstance<Files["scan"]>;
beforeEach(() => {
  data = {
    "package.json": JSON.stringify(manifest),
    "pnpm-workspace.yaml": JSON.stringify({ catalog }),
    "pnpm-lock.yaml": "{}",
    "tsconfig.json": JSON.stringify({
      compilerOptions: strict,
      include: ["src/**/*.ts", "test/**/*.ts"],
    }),
    "eslint.config.js": lintConfig,
    "vitest.config.ts": vitestConfig,
    ".git/config":
      '[remote "origin"]\nurl=https://git.acme.org/a/b\n[branch "main"]\nmerge=refs/heads/main',
    "src/index.ts": "export const x = 1;",
    "test/index.test.ts": "",
    ...Object.fromEntries(
      Object.keys(manifest.scripts).map((name) => [`scripts/${name}.mjs`, ""]),
    ),
  };
  scan = vi.spyOn(Files.prototype, "scan").mockImplementation(function (
    this: Files,
  ) {
    this.paths.push(...Object.keys(data));
    return Promise.resolve();
  });
  vi.spyOn(Files.prototype, "text").mockImplementation((path) => {
    if (!(path in data)) throw new Unconfirmed(`Missing mock file ${path}`);
    return Promise.resolve(data[path]!);
  });
  vi.spyOn(Files.prototype, "optionalText").mockImplementation((path) =>
    Promise.resolve(data[path]),
  );
});
afterEach(() => vi.restoreAllMocks());
async function check() {
  const problems: { code: ProblemCode; brief: string }[] = [];
  await inspect(
    { projectDirectory: resolve(".") },
    new AbortController().signal,
    (code, brief) => problems.push({ code, brief }),
    await testEvidence(),
  );
  return problems;
}
it("passes a complete static project without invoking its code", async () => {
  expect(await check()).toEqual([]);
  expect(convention).toHaveBeenCalled();
});
it("reports unsupported scans, links and missing root manifests before inspection", async () => {
  scan.mockRejectedValueOnce(new Unconfirmed("enumeration denied"));
  expect(await check()).toEqual([
    { code: "scope-unconfirmed", brief: "enumeration denied" },
  ]);
  scan.mockImplementationOnce(function (this: Files) {
    this.links.push("linked");
    return Promise.resolve();
  });
  expect(await check()).toEqual([
    {
      code: "scope-unconfirmed",
      brief: expect.stringContaining("linked") as unknown,
    },
  ]);
  delete data["package.json"];
  expect(await check()).toEqual([
    {
      code: "scope-unconfirmed",
      brief: expect.stringContaining("package.json") as unknown,
    },
  ]);
});
it.each([
  ["pnpm-workspace.yaml", '{"packages":[1]}', "patterns"],
  ["pnpm-workspace.yaml", "x: [", "YAML"],
  ["pnpm-workspace.yaml", '{"scriptShell":"bash"}', "script shell"],
  [".npmrc", "script-shell=bash", "script shell"],
  [".pnpmfile.cjs", "throw Error('never execute')", "hooks"],
])("stops unsupported scope configuration: %s", async (path, value, reason) => {
  data[path] = value;
  expect(await check()).toContainEqual({
    code: "scope-unconfirmed",
    brief: expect.stringContaining(reason) as unknown,
  });
});
it("rejects undeclared nested manifests and excessive workspace membership", async () => {
  delete data["pnpm-workspace.yaml"];
  data["nested/package.json"] = "{}";
  expect((await check())[0]?.brief).toContain("unknown ownership");
  data["pnpm-workspace.yaml"] = '{"packages":[]}';
  expect((await check())[0]?.brief).toContain("未声明");
  data["pnpm-workspace.yaml"] = '{"packages":["*"]}';
  for (let i = 0; i < 130; i++) data[`member${i}/package.json`] = "{}";
  expect((await check())[0]?.brief).toContain("128");
});
it("rejects non-pnpm workspace declarations and preserves unexpected errors", async () => {
  delete data["pnpm-workspace.yaml"];
  data["package.json"] = JSON.stringify({
    ...manifest,
    workspaces: ["packages/*"],
  });
  expect((await check())[0]?.brief).toContain("only pnpm");
  scan.mockRejectedValueOnce(new Error("unexpected scan"));
  await expect(check()).rejects.toThrow("unexpected scan");
});
it.each([
  [undefined, "dependency-missing", "packageManager"],
  [1, "dependency-unconfirmed", "not a string"],
  ["pnpm@latest", "dependency-unconfirmed", "exact stable"],
  ["pnpm@999999999999999999.0.0", "dependency-unconfirmed", "numeric bounds"],
])(
  "reports invalid package manager declaration: %s",
  async (packageManager, code, reason) => {
    data["package.json"] = JSON.stringify({ ...manifest, packageManager });
    expect(await check()).toContainEqual({
      code,
      brief: expect.stringContaining(reason) as unknown,
    });
  },
);
it("reports missing lockfiles, source scope, type declarations and tsconfig separately", async () => {
  delete data["pnpm-lock.yaml"];
  delete data["tsconfig.json"];
  data["package.json"] = JSON.stringify({ ...manifest, devDependencies: {} });
  const problems = await check();
  expect(problems).toEqual(
    expect.arrayContaining([
      { code: "dependency-missing", brief: "缺少 pnpm-lock.yaml" },
      {
        code: "typescript-missing",
        brief: expect.stringContaining("typescript") as unknown,
      },
      {
        code: "typescript-missing",
        brief: expect.stringContaining("tsconfig.json") as unknown,
      },
    ]),
  );
  delete data["src/index.ts"];
  delete data["test/index.test.ts"];
  expect(await check()).toContainEqual({
    code: "typescript-unconfirmed",
    brief: expect.stringContaining("没有可观察") as unknown,
  });
});
it.each([
  { devDependencies: { typescript: 1 } },
  { devDependencies: { typescript: "" } },
])("rejects invalid TypeScript dependency data", async (patch) => {
  data["package.json"] = JSON.stringify({ ...manifest, ...patch });
  expect(await check()).toContainEqual({
    code: "typescript-unconfirmed",
    brief: expect.stringContaining("nonempty string") as unknown,
  });
});
it("reports malformed strict flags in their configuration scope", async () => {
  data["tsconfig.json"] = JSON.stringify({
    compilerOptions: { strict: "true" },
  });
  expect(await check()).toContainEqual({
    code: "typescript-unconfirmed",
    brief: expect.stringContaining("not a boolean") as unknown,
  });
});
it.each([
  ["export default {};", "flat array"],
  ["export default [{plugins: {}}];", "configuration key"],
  ["export default [{languageOptions: {parser: {}}}];", "parser/processor"],
  [
    "export default [{languageOptions: {parserOptions: {extra: true}}}];",
    "parserOptions key",
  ],
  [
    "export default [{languageOptions: {parserOptions: {project: true}}}];",
    "use projectService",
  ],
  [
    "export default [{languageOptions: {parserOptions: {tsconfigRootDir: '/outside'}}}];",
    "tsconfigRootDir",
  ],
])(
  "reports unsupported ESLint configuration without evaluating it",
  async (source, reason) => {
    data["eslint.config.js"] = source;
    expect(await check()).toContainEqual({
      code: "lint-unconfirmed",
      brief: expect.stringContaining(reason) as unknown,
    });
  },
);
it("reports missing ESLint configs and recognizes local ignore branches and disabled typed rules", async () => {
  delete data["eslint.config.js"];
  expect(await check()).toContainEqual({
    code: "lint-missing",
    brief: expect.stringContaining("flat config") as unknown,
  });
  data["eslint.config.js"] = lintConfig.replace(
    /\);$/,
    `, {files: ["other/**"], rules: {"@typescript-eslint/no-unsafe-call": [0]}}, {ignores: ["src/**"], rules: {}}, {rules: {"@typescript-eslint/no-unsafe-call": ["off"]}});`,
  );
  expect(await check()).toContainEqual({
    code: "lint-mismatch",
    brief: expect.stringContaining("未生效") as unknown,
  });
});
it.each([
  [{ watch: "yes" }, "testing-unconfirmed", "boolean"],
  [{ include: ["other/**"] }, "testing-mismatch", "测试发现"],
  [{ watch: true }, "testing-mismatch", "watch=true"],
  [{ passWithNoTests: true }, "testing-mismatch", "passWithNoTests=true"],
  [{ coverage: undefined }, "coverage-missing", "coverage"],
  [{ coverage: { unknown: true } }, "coverage-unconfirmed", "coverage key"],
  [{ coverage: { provider: "custom" } }, "coverage-unconfirmed", "provider"],
  [
    {
      coverage: {
        include: ["src/**"],
        thresholds: {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
          autoUpdate: true,
        },
      },
    },
    "coverage-mismatch",
    "autoUpdate",
  ],
  [
    { coverage: { include: ["src/**"], thresholds: { "src/**": 90 } } },
    "coverage-unconfirmed",
    "per-glob",
  ],
  [
    { coverage: { include: ["src/**"], exclude: ["src/**"] } },
    "coverage-mismatch",
    "排除源码",
  ],
])(
  "reports testing and coverage configuration failures: %j",
  async (test, code, reason) => {
    data["vitest.config.ts"] = `export default ${JSON.stringify({ test })};`;
    expect(await check()).toContainEqual({
      code,
      brief: expect.stringContaining(reason) as unknown,
    });
  },
);
it("handles absent Vitest configurations and unsupported declared major versions", async () => {
  delete data["vitest.config.ts"];
  expect(await check()).toContainEqual({
    code: "testing-missing",
    brief: expect.stringContaining("Vitest") as unknown,
  });
  data["vitest.config.ts"] = vitestConfig;
  data["package.json"] = JSON.stringify({
    ...manifest,
    devDependencies: { ...manifest.devDependencies, vitest: 5 },
  });
  expect(await check()).toContainEqual({
    code: "coverage-unconfirmed",
    brief: expect.stringContaining("4.x/5.x") as unknown,
  });
  data["package.json"] = JSON.stringify({
    ...manifest,
    devDependencies: { ...manifest.devDependencies, vitest: "catalog:tools" },
  });
  data["pnpm-workspace.yaml"] = JSON.stringify({
    catalog,
    catalogs: { tools: { vitest: "^5.0.4" } },
  });
  expect(await check()).toEqual([]);
});
it.each([
  [".prettierrc", "{bad", "formatting-unconfirmed", "invalid Prettier"],
  [
    ".prettierrc.yaml",
    "plugins: []",
    "formatting-unconfirmed",
    "plugins/overrides",
  ],
  [
    "prettier.config.js",
    "export default {overrides: []};",
    "formatting-unconfirmed",
    "plugins/overrides",
  ],
  [".prettierignore", "# comment\nsrc/\n", "formatting-mismatch", "必要格式"],
  [".gitignore", "/src/\n", "formatting-mismatch", "必要格式"],
])(
  "reports unsupported formatter data and necessary-target exclusions",
  async (path, content, code, reason) => {
    data[path] = content;
    expect(await check()).toContainEqual({
      code,
      brief: expect.stringContaining(reason) as unknown,
    });
  },
);
it("rejects package-level Prettier overrides and non-main GitHub primary branches", async () => {
  data["package.json"] = JSON.stringify({
    ...manifest,
    prettier: { overrides: [] },
  });
  expect(await check()).toContainEqual({
    code: "formatting-unconfirmed",
    brief: expect.stringContaining("package.json Prettier") as unknown,
  });
  data[".git/config"] = '[remote "origin"]\nurl=https://github.com/a/b';
  data[".git/refs/remotes/origin/HEAD"] = "ref: refs/remotes/origin/trunk";
  expect(await check()).toContainEqual({
    code: "ci-unconfirmed",
    brief: expect.stringContaining("trunk") as unknown,
  });
});

function github(workflow: Record<string, unknown>) {
  data[".git/config"] =
    '[remote "origin"]\nurl=https://github.com/a/b\n[branch "main"]\nmerge=refs/heads/main';
  data[".github/workflows/ci.yaml"] = JSON.stringify(workflow);
}
it("reports missing GitHub workflows", async () => {
  github({});
  delete data[".github/workflows/ci.yaml"];
  expect(await check()).toContainEqual({
    code: "ci-missing",
    brief: "缺少 GitHub Actions 工作流",
  });
});
it.each([
  [{ on: { pull_request: null, push: { extra: true } } }, "unsupported push"],
  [{ on: { pull_request: null, push: { tags: ["*"] } } }, "tags-only"],
  [
    { on: { pull_request: null, push: { paths: ["src/**"] } } },
    "filtered push",
  ],
  [
    { on: { pull_request: { branches: ["main"] }, push: null } },
    "filtered pull_request",
  ],
  [{ on: { pull_request: null, push: null }, defaults: {} }, "defaults/env"],
  [
    {
      on: { pull_request: null, push: null },
      jobs: {
        check: {
          strategy: { matrix: { include: [{}] } },
          steps: [{ run: "pnpm check" }],
        },
      },
    },
    "matrix",
  ],
])(
  "rejects unsupported workflow trigger or execution semantics",
  async (workflow, reason) => {
    github(workflow);
    expect(await check()).toContainEqual({
      code: "ci-unconfirmed",
      brief: expect.stringContaining(reason) as unknown,
    });
  },
);
it.each(
  [
    [{ run: "pnpm check" }],
    [{ run: "pnpm install" }, { run: "pnpm check" }],
    [
      { uses: "unknown/action@v1" },
      { run: "pnpm install --frozen-lockfile" },
      { run: "pnpm check" },
    ],
    [
      { uses: "actions/checkout@v7", with: { "fetch-depth": 0 } },
      { run: "pnpm check" },
      { run: "pnpm install --frozen-lockfile" },
    ],
    [
      { uses: "actions/checkout@v7" },
      { run: "pnpm install --frozen-lockfile" },
      {
        uses: "actions/setup-node@v7",
        with: { "node-version-file": ".node-version" },
      },
      { uses: "pnpm/action-setup@v6" },
      { run: "pnpm check" },
    ],
    [
      { uses: "actions/checkout@v7" },
      { run: "echo $UNKNOWN" },
      { run: "pnpm install --frozen-lockfile" },
      { run: "pnpm check", if: "true" },
    ],
    [
      { uses: "actions/checkout@v7" },
      { run: "pnpm install --frozen-lockfile" },
    ],
  ].map((steps) => ({ steps })),
)("rejects incomplete or out-of-order CI check jobs", async ({ steps }) => {
  github({
    on: { pull_request: null, push: null },
    jobs: { check: { steps } },
  });
  expect(
    (await check()).some((problem) => problem.code.startsWith("ci-")),
  ).toBe(true);
});
it("accepts an unconditional ordered CI job with root-selected tools", async () => {
  github({
    on: { pull_request: null, push: { branches: ["main"] } },
    jobs: {
      check: {
        steps: [
          {
            uses: "actions/checkout@v7",
            with: { "persist-credentials": false },
          },
          {
            uses: "actions/setup-node@v7",
            with: { "node-version-file": ".node-version" },
          },
          {
            uses: "pnpm/action-setup@v6",
            with: { run_install: false, package_json_file: "package.json" },
          },
          { run: "pnpm install --frozen-lockfile" },
          { run: "pnpm run check", shell: "bash" },
        ],
      },
    },
  });
  expect(await check()).toEqual([]);
});
