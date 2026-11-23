import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { executeCheck } from "@silvermoon-work/check-task-sdk/legacy";
import { Files, Unconfirmed } from "../src-legacy/files.js";
import { FindingGroup, ruleScope } from "../src-legacy/checks/rules.js";
import { projectRegistry } from "../src-legacy/inspect.js";
import { catalog, fixture, put, strict, testEvidence } from "./fixture.js";

it("keeps attribution local to its configuration owner and preserves unexpected failures", async () => {
  const signal = new AbortController().signal;
  const group = new FindingGroup();
  const local = ruleScope<never>(signal, "a", group);
  local.scopeContext!.path = "shared.config";
  local.scopeContext!.details = "details";
  const result = await local.section("lint", () => {
    throw new Unconfirmed("unsupported");
  });
  if (result.pass) throw new Error("Expected a scoped finding.");
  expect(group.finish(result.problems)[0]?.brief).toContain("成员=a");
  const other = ruleScope<never>(signal, "b");
  const unscoped = await other.section("lint", () => {
    throw new Unconfirmed("missing path");
  });
  if (unscoped.pass) throw new Error("Expected member attribution.");
  expect(unscoped.problems[0].brief).toBe("成员=b；实际 root=b；missing path");
  expect(group.finish(unscoped.problems)).toHaveLength(2);
  const root = ruleScope<never>(signal);
  const rootResult = await root.section("lint", () => {
    throw new Unconfirmed("root fact");
  });
  expect(rootResult).toMatchObject({
    pass: false,
    problems: [{ code: "lint-unconfirmed", brief: "root fact" }],
  });
  const failure = new Error("read failed");
  await expect(
    root.section("lint", () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  await expect(
    root.section("scope", ({ issue }) => {
      issue("scope", "missing", "undeclared code");
    }),
  ).rejects.toThrow("Undeclared");
  const scoped = await root.section("lint", ({ scopeIssue }) => {
    scopeIssue("lint", "missing", "a.config", "absent", "a", "");
  });
  expect(scoped).toMatchObject({
    pass: false,
    problems: [{ brief: "a.config: absent；影响范围: a" }],
  });
});

it("overlaps independent member configuration nodes without mixing scope or findings", async () => {
  const directory = resolve("dist", `.graph-scopes-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const abort = new AbortController();
  let active = 0;
  let maximum = 0;
  const entered = new Set<string>();
  let execution: Promise<unknown> | undefined;
  try {
    await fixture(directory);
    await put(directory, "pnpm-workspace.yaml", {
      packages: ["packages/*"],
      catalog,
    });
    for (const member of ["a", "b"]) {
      await put(directory, `packages/${member}/package.json`, {
        name: member,
        private: true,
        engines: { node: ">=22" },
      });
      await put(directory, `packages/${member}/src/index.ts`, "export {};");
      await put(directory, `packages/${member}/tsconfig.json`, {
        compilerOptions: strict,
        include: ["src/**/*.ts"],
      });
      await put(
        directory,
        `packages/${member}/eslint.config.js`,
        `export default [{ plugins: {} }];`,
      );
    }
    const read = Reflect.get<Files, "text">(Files.prototype, "text");
    vi.spyOn(Files.prototype, "text").mockImplementation(async function (
      this: Files,
      path,
    ) {
      if (
        /^packages\/[ab]\/eslint\.config\.js$/.test(path) &&
        !entered.has(path)
      ) {
        entered.add(path);
        active++;
        maximum = Math.max(maximum, active);
        if (entered.size === 2) release();
        await waiting;
        active--;
      }
      return read.call(this, path);
    });
    const evidence = await testEvidence();
    const reportPromise = executeCheck<ReturnType<typeof projectRegistry>>({
      registry: (signal) =>
        projectRegistry({ projectDirectory: directory }, signal, evidence),
      root: { checker: "project", target: { projectDirectory: directory } },
      signal: abort.signal,
    });
    execution = reportPromise;
    const report = await reportPromise;
    expect(maximum).toBe(2);
    if (report.pass)
      throw new Error("Expected two independent invalid configurations.");
    const findings = report.problems.filter(
      (problem) => problem.code === "lint-unconfirmed",
    );
    expect(findings).toHaveLength(2);
    for (const member of ["a", "b"]) {
      const finding = findings.find((problem) =>
        problem.brief.includes(`配置=packages/${member}/eslint.config.js`),
      );
      expect(finding?.brief).toContain(`成员=packages/${member}`);
      expect(finding?.brief).not.toContain(
        `成员=packages/${member === "a" ? "b" : "a"}`,
      );
    }
    expect(new Set(findings.map((problem) => problem.nodeKey)).size).toBe(2);
  } finally {
    abort.abort();
    release();
    await execution?.catch(() => undefined);
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
