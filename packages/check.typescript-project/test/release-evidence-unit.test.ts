import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import type { Project } from "../src/commands.js";
import { Files, Unconfirmed } from "../src/files.js";
import {
  ciReuseEvidence,
  mappingEvidence,
  privatePublishEvidence,
  releaseMappings,
} from "../src/release-evidence.js";

function memory(data: Record<string, string> = {}) {
  const files = new Files(resolve("."), new AbortController().signal);
  files.paths.push(...Object.keys(data));
  vi.spyOn(files, "text").mockImplementation((path) => {
    if (!(path in data)) throw new Error(`Missing mock ${path}`);
    return Promise.resolve(data[path]!);
  });
  vi.spyOn(files, "optionalText").mockImplementation((path) =>
    Promise.resolve(data[path]),
  );
  vi.spyOn(files, "json").mockImplementation((path) =>
    Promise.resolve(JSON.parse(data[path]!) as Record<string, unknown>),
  );
  return files;
}
const project: Project = {
  directory: "",
  manifest: { private: true, name: "root" },
  sources: [],
  tests: [],
};
it.each([
  "not javascript",
  "const releasePackages = [];",
  "export let releasePackages = [];",
  "export const other = [];",
  "export const releasePackages = {};",
  "export const releasePackages = [1];",
  "export const releasePackages = [{...x}];",
  "export const releasePackages = [{get id() {return 'x'}}];",
  "export const releasePackages = [{['id']: 'x'}];",
  "export const releasePackages = [{id}];",
  "export const releasePackages = [{id: 'a', id: 'b'}];",
  "export const releasePackages = [{unknown: 'a'}];",
  "export const releasePackages = [{id: 1}];",
  "export const releasePackages = [{id: 'a'}];",
])("rejects ambiguous or executable release mappings: %s", (source) => {
  expect(() => releaseMappings(source)).toThrow(Unconfirmed);
});
it("uses the canonical declaration and rejects legacy sources without inferring public targets", async () => {
  const report = vi.fn();
  const source = `export const releasePackages = [
    {"id": "Bad!", name: "wrong", directory: "packages/a"},
    {id: "Bad!", name: "wrong", directory: "packages/a"}];`;
  const files = memory({ "scripts/lib/release-packages.mjs": source });
  await mappingEvidence(
    files,
    [
      project,
      {
        ...project,
        directory: "packages/a",
        manifest: { private: false, name: "a" },
      },
      {
        ...project,
        directory: "packages/b",
        manifest: { private: false, name: "b" },
      },
    ],
    report,
  );
  expect(report).toHaveBeenCalledWith(
    "mismatch",
    expect.stringContaining("旧交付来源须迁移"),
  );
  report.mockClear();
  await mappingEvidence(
    memory({
      "scripts/lib/release-packages.mjs": source,
      "scripts/release-packages.js": source,
    }),
    [project],
    report,
  );
  expect(report).toHaveBeenCalledTimes(2);
  report.mockClear();
  await mappingEvidence(
    memory(),
    [
      { ...project, manifest: { private: false } },
      { ...project, directory: "a", manifest: { private: false } },
    ],
    report,
  );
  expect(report).not.toHaveBeenCalled();
  const declared = memory({
    "silvermoon.yaml": JSON.stringify({
      deliverables: [{ path: ".", type: "npm", packageId: "root" }],
    }),
  });
  await mappingEvidence(declared, [project], report);
  expect(report).toHaveBeenCalledWith(
    "mismatch",
    expect.stringContaining("private"),
  );
  report.mockClear();
  await mappingEvidence(
    declared,
    [{ ...project, manifest: { name: "root" } }],
    report,
  );
  expect(report).not.toHaveBeenCalled();
});
it("does not confuse conditions, unknown commands, dry runs or restored protection with a private publish bypass", async () => {
  const jobs = {
    absent: {},
    guarded: {
      steps: [
        { run: "pnpm pkg delete private" },
        { if: "condition", run: "pnpm publish" },
      ],
    },
    restored: {
      steps: [
        {
          run: "pnpm pkg delete private && pnpm pkg set private=true && pnpm publish",
        },
      ],
    },
    unknown: {
      steps: [
        { run: "pnpm pkg delete private" },
        { run: "echo hello" },
        { run: "pnpm publish" },
      ],
    },
    dynamic: {
      steps: [
        {
          run: "pnpm pkg delete private && pnpm publish",
          "working-directory": "${{ matrix.package }}",
        },
      ],
    },
    other: {
      steps: [
        {
          run: "pnpm pkg delete private && pnpm publish",
          "working-directory": "other",
        },
      ],
    },
    dry: {
      steps: [{ run: "pnpm pkg delete private && pnpm publish --dry-run" }],
    },
    bypass: {
      defaults: { run: { "working-directory": "." } },
      steps: [{ run: "pnpm pkg set private=false" }, { run: "pnpm publish" }],
    },
  };
  const report = vi.fn();
  await privatePublishEvidence(
    memory({
      ".github/workflows/publish.yaml": JSON.stringify({ jobs }),
      ".github/workflows/bad.yaml": "pnpm pkg delete private\n: invalid: [",
    }),
    [project],
    report,
  );
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(
    "mismatch",
    expect.stringContaining(":bypass:"),
  );
});

const command =
  'pnpm exec github-ci-verify --sha "$(git rev-parse HEAD)" --branch main --workflow ci.yaml --job-name "Verification (v1)" --step-name "Require success" --json --summary';
function ciSource(): Record<string, unknown> {
  return {
    on: { push: { branches: ["main"] } },
    jobs: {
      quality: {
        strategy: { matrix: { "node-version": ["22.15.0", "24.11.0"] } },
        steps: [
          { uses: "actions/checkout@v7" },
          { uses: "actions/setup-node@v7" },
          { uses: "pnpm/action-setup@v6" },
          { run: "pnpm install --frozen-lockfile" },
          { run: "pnpm check" },
        ],
      },
      aggregate: {
        name: "Verification (v1)",
        needs: "quality",
        if: "always()",
        steps: [
          {
            name: "Require success",
            env: { CHECK_RESULT: "${{ needs.quality.result }}" },
            run: 'if [ "$CHECK_RESULT" != success ]; then\necho "::error::Every required validation job must succeed; received $CHECK_RESULT."\nexit 1\nfi',
          },
        ],
      },
    },
  };
}
async function reuse(
  source: Record<string, unknown>,
  step: Record<string, unknown> = { run: command },
  declared = true,
) {
  const report = vi.fn();
  await ciReuseEvidence(
    memory({
      ".git/config":
        '[remote "origin"]\nurl=https://github.com/acme/project\n[branch "main"]\nmerge=refs/heads/main',
      "package.json": JSON.stringify({
        devDependencies: declared ? { "github-ci-verify": "^1.0.0" } : {},
      }),
    }),
    [
      { path: ".github/workflows/ci.yaml", workflow: source },
      {
        path: ".github/workflows/reuse.yaml",
        workflow: { jobs: { reuse: { steps: [step] } } },
      },
    ],
    report,
  );
  return report;
}
it("accepts complete HEAD-specific reuse of a verified matrix and fail-closed aggregate", async () => {
  expect(await reuse(ciSource())).not.toHaveBeenCalled();
});
it.each([
  [{ run: command, if: "true" }, "条件"],
  [{ run: "github-ci-verify --sha fixed" }, "完整实际 HEAD"],
  [{ run: command.replace("--branch main", "--branch trunk") }, "分支"],
  [{ run: command.replace("ci.yaml", "missing.yaml") }, "不存在"],
])(
  "rejects conditional or mismatched CI verifier invocations",
  async (step, reason) => {
    expect(await reuse(ciSource(), step)).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(reason),
    );
  },
);
it("requires explicit verifier dependencies", async () => {
  expect(await reuse(ciSource(), { run: command }, false)).toHaveBeenCalledWith(
    "missing",
    expect.stringContaining("devDependencies"),
  );
});
it.each([
  [
    "filtered trigger",
    { on: { push: { branches: ["main"], paths: ["src/**"] } } },
    "触发覆盖",
  ],
  ["missing job", { jobs: {} }, "job"],
  [
    "missing steps",
    { jobs: { aggregate: { name: "Verification (v1)" } } },
    "没有可识别 steps",
  ],
  [
    "missing guard",
    { jobs: { aggregate: { name: "Verification (v1)", steps: [] } } },
    "step",
  ],
])("rejects incomplete CI evidence: %s", async (_name, patch, reason) => {
  expect(await reuse({ ...ciSource(), ...patch })).toHaveBeenCalledWith(
    expect.any(String),
    expect.stringContaining(reason),
  );
});
it.each([
  { strategy: { matrix: { "node-version": ["${{ dynamic }}"] } } },
  {
    steps: [
      { uses: "actions/checkout@v7" },
      { uses: "unknown/action@v1" },
      { run: "pnpm install --frozen-lockfile" },
      { run: "pnpm check", env: {} },
    ],
  },
  { steps: [{ run: "pnpm check" }, { run: "pnpm install --frozen-lockfile" }] },
])(
  "rejects filtered matrices and unsafe required job execution",
  async (patch) => {
    const source = ciSource();
    const jobs = source.jobs as Record<string, Record<string, unknown>>;
    Object.assign(jobs.quality!, patch);
    expect(await reuse(source)).toHaveBeenCalledWith(
      "unconfirmed",
      expect.any(String),
    );
  },
);
