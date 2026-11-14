import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Files, Unconfirmed, dataYaml, record } from "../src/files.js";
import { nativeWorkflow } from "../src/native-workflow.js";
import { workflow } from "./fixture.js";
import type { Project } from "../src/commands.js";

afterEach(() => vi.restoreAllMocks());
const project: Project = {
  directory: "packages/native",
  manifest: {
    name: "@acme/native",
    scripts: {
      "native-test": "node scripts/native-test.mjs",
      smoke: "node scripts/smoke.mjs",
    },
  },
  sources: ["packages/native/src/index.ts"],
  tests: [],
};
function native() {
  const w = dataYaml(workflow);
  record(w.on).workflow_dispatch = null;
  const j = record(record(w.jobs).check);
  delete j.name;
  j["runs-on"] = "${{ matrix.os }}";
  j.strategy = { matrix: { os: ["ubuntu-latest", "windows-latest"] } };
  const steps = j.steps as Record<string, unknown>[];
  steps.splice(
    4,
    1,
    { run: "pnpm --filter @acme/native... build" },
    { run: "pnpm --filter @acme/native native-test" },
    { run: "pnpm --filter @acme/native smoke" },
  );
  w.jobs = { native: j, notify: { steps: [{ run: "echo hello" }] } };
  return w;
}
async function run(contents: Record<string, unknown>, projects = [project]) {
  const files = new Files(resolve("."), new AbortController().signal);
  files.paths.push(...Object.keys(contents));
  vi.spyOn(files, "text").mockImplementation((path) => {
    const value = contents[path];
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve(JSON.stringify(value));
  });
  const problems: { status: string; brief: string }[] = [];
  await nativeWorkflow(files, projects, (_domain, status, brief) =>
    problems.push({ status, brief }),
  );
  return problems;
}
it("requires no native workflow without declared native responsibility", async () => {
  expect(
    await run({}, [{ ...project, manifest: { scripts: { smoke: "custom" } } }]),
  ).toEqual([]);
});
it("proves unfiltered native source/dependency/lock/tool/self coverage with required platform jobs", async () => {
  expect(await run({ ".github/workflows/native.yaml": native() })).toEqual([]);
});
it("accepts different native job identities and separate constant-platform jobs", async () => {
  const w = native();
  const j = record(record(w.jobs).native);
  delete j.strategy;
  w.jobs = {
    linux: { ...j, "runs-on": "ubuntu-latest" },
    windows: { ...j, "runs-on": "windows-latest" },
  };
  expect(
    await run({
      ".github/workflows/native.yaml": w,
      ".github/workflows/unrelated.yaml": new Unconfirmed(
        "unreadable extension",
      ),
    }),
  ).toEqual([]);
});
it("reports missing separate native coverage without executing scripts", async () => {
  expect(
    await run({
      ".github/workflows/ci.yaml": native(),
      ".github/workflows/notify.yml": {
        jobs: { notify: { steps: [{ run: "echo hello" }] } },
      },
      ".github/workflows/empty.yaml": {},
    }),
  ).toEqual([expect.objectContaining({ status: "missing" })]);
});
it("reports the best failing native candidate with precise covered predicates", async () => {
  const w = native();
  delete record(w.on).push;
  record(record(w.jobs).native)["timeout-minutes"] = 0;
  const problems = await run({ ".github/workflows/native.yaml": w });
  expect(problems.some((p) => p.brief.includes("on.push"))).toBe(true);
  expect(problems.some((p) => p.brief.includes("timeout-minutes"))).toBe(true);
});
it("scopes filtered coverage and read failures without hiding independent missing evidence", async () => {
  const w = native();
  record(record(w.on).push).paths = ["packages/native/**"];
  expect(await run({ ".github/workflows/native.yaml": w })).toEqual([
    expect.objectContaining({ status: "unconfirmed" }),
  ]);
  expect(
    await run({ ".github/workflows/native.yaml": new Unconfirmed("denied") }),
  ).toEqual([
    expect.objectContaining({ status: "unconfirmed" }),
    expect.objectContaining({ status: "missing" }),
  ]);
  await expect(
    run({ ".github/workflows/native.yaml": new Error("unexpected") }),
  ).rejects.toThrow("unexpected");
});
