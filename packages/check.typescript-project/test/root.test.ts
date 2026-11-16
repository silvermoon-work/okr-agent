import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { executeCheck, type ReportNode } from "@silvermoon-work/check-task-sdk";
import { runCheckBuilderCli } from "@silvermoon-work/check-task-builder/cli";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { registry } from "../src/registry.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, open: vi.fn(actual.open) };
});

let directory: string;
let records: ReportNode[];
beforeEach(async () => {
  records = [];
  directory = resolve("dist", `.project-root-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(fs.open).mockReset();
  await fs.rm(directory, { recursive: true, force: true });
});
async function put(root: string, path: string, value: string | object) {
  const file = join(root, path);
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}
const execute = (signal = new AbortController().signal) => {
  records = [];
  return executeCheck({
    registry,
    root: { checker: "project", target: { projectDirectory: directory } },
    signal,
    log: (node) => {
      records.push(node);
    },
  });
};

it.each([
  ["dependencies", { dependencies: { typescript: "^6.0.0" } }, undefined],
  [
    "devDependencies",
    { devDependencies: { typescript: "catalog:" } },
    undefined,
  ],
  ["peerDependencies", { peerDependencies: { typescript: "*" } }, undefined],
  [
    "optionalDependencies",
    { optionalDependencies: { typescript: "^6" } },
    undefined,
  ],
  ["tsconfig", {}, "tsconfig.json"],
  ["named tsconfig", {}, "tsconfig.build.json"],
  ["ts source", {}, "src/index.ts"],
  ["tsx source", {}, "src/view.tsx"],
  ["mts source", {}, "src/index.mts"],
  ["cts source", {}, "src/index.cts"],
] as const)(
  "recognizes single repo using %s without validating its content",
  async (_name, manifest, evidence) => {
    await put(directory, "package.json", manifest);
    if (evidence) await put(directory, evidence, "not yet configured");
    const report = await execute();
    expect(report.pass).toBe(true);
    expect(report).toEqual({
      pass: true,
      documentation: "references/check.md",
    });
    expect(records.map((node) => node.item.checker).sort()).toEqual([
      "project",
      "single-repo",
    ]);
    expect(records[0]).not.toHaveProperty("parent");
    expect(records[1]?.parent).toBe(records[0]?.key);
  },
);

it.each([
  ["missing", undefined],
  ["invalid JSON", "{"],
  ["array", "[]"],
  ["null", "null"],
  ["string", '"package"'],
  ["no TypeScript evidence", "{}"],
  ["empty dependency", '{"devDependencies":{"typescript":" "}}'],
  ["invalid dependency", '{"dependencies":{"typescript":true}}'],
  ["invalid dependencies", '{"dependencies":[]}'],
] as const)(
  "reports invalid project for %s without expanding either branch",
  async (_name, manifest) => {
    if (manifest !== undefined) await put(directory, "package.json", manifest);
    const report = await execute();
    expect(report.pass).toBe(false);
    expect(records).toHaveLength(1);
    expect(Object.keys(report).sort()).toEqual([
      "documentation",
      "pass",
      "problems",
    ]);
    if (report.pass) throw new Error("Expected an invalid project.");
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0].code).toBe("typescript-project-invalid");
    expect(report.problems[0].brief).toContain(directory);
    expect(report.problems[0].nodeKey).toBe(records[0]?.key);
  },
);

it.each(["pnpm", "manifest"] as const)(
  "routes %s workspace declaration to monorepo without checking members",
  async (declaration) => {
    await put(
      directory,
      "package.json",
      declaration === "manifest" ? { workspaces: [] } : {},
    );
    if (declaration === "pnpm")
      await put(directory, "pnpm-workspace.yaml", "not valid YAML");
    await put(directory, "packages/a/tsconfig.json", "{}");
    const report = await execute();
    expect(report.pass).toBe(true);
    expect(records.map((node) => node.item.checker).sort()).toEqual([
      "monorepo",
      "project",
    ]);
  },
);

it("recognizes monorepo TypeScript dependencies in a child package", async () => {
  await put(directory, "package.json", { workspaces: ["packages/*"] });
  await put(directory, "packages/bad/package.json", "{");
  await put(directory, "packages/empty/package.json", {});
  await put(directory, "packages/typed/package.json", {
    devDependencies: { typescript: "catalog:" },
  });
  expect((await execute()).pass).toBe(true);
});

it("does not infer monorepo from nested packages or let dependency/output files establish identity", async () => {
  await put(directory, "package.json", {});
  await put(directory, "packages/a/package.json", {
    devDependencies: { typescript: "^6" },
  });
  for (const ignored of [
    "node_modules",
    ".git",
    ".silvermoon",
    ".turbo",
    "dist",
    "coverage",
  ])
    await put(directory, `${ignored}/index.ts`, "export {};");
  expect((await execute()).pass).toBe(false);
  await put(directory, "packages/a/src/index.ts", "export {};");
  await execute();
  expect(records.map((node) => node.item.checker).sort()).toEqual([
    "project",
    "single-repo",
  ]);
});

it("requires TypeScript evidence even when workspace is declared", async () => {
  await put(directory, "package.json", { workspaces: ["packages/*"] });
  await put(directory, "packages/a/package.json", {});
  expect((await execute()).pass).toBe(false);
});

it("does not follow directory links and rejects a linked project root", async () => {
  const outside = join(directory, "dist", "external");
  await put(directory, "package.json", {});
  await put(outside, "index.ts", "export {};");
  const link = join(directory, "linked");
  await fs.symlink(outside, link, "junction");
  expect((await execute()).pass).toBe(false);
  await expect(
    registry.project.invoke(
      { projectDirectory: link },
      new AbortController().signal,
    ),
  ).rejects.toThrow("linked or redirected");
});

it("keeps invalid host paths and missing directories as execution errors", async () => {
  for (const path of ["relative", `${directory}\n`])
    await expect(
      registry.project.invoke(
        { projectDirectory: path },
        new AbortController().signal,
      ),
    ).rejects.toThrow("absolute host directory");
  await put(directory, "file", "");
  await expect(
    registry.project.invoke(
      { projectDirectory: join(directory, "file") },
      new AbortController().signal,
    ),
  ).rejects.toThrow("must be a directory");
  await expect(
    registry.project.invoke(
      { projectDirectory: join(directory, "absent") },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});

it("propagates unexpected I/O failures and cancellation without producing a problem", async () => {
  await put(directory, "package.json", {});
  const fault = new Error("permission denied");
  vi.mocked(fs.open).mockRejectedValueOnce(fault);
  await expect(execute()).rejects.toBe(fault);
  const canceled = new AbortController();
  canceled.abort(fault);
  await expect(execute(canceled.signal)).rejects.toBe(fault);
});

it("preserves both manifest read and cleanup failures", async () => {
  await put(directory, "package.json", {});
  const readFailure = new Error("manifest read failed");
  const closeFailure = new Error("manifest close failed");
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.open).mockImplementation(async (path, flags, mode) => {
    const file = await actual.open(path, flags, mode);
    vi.spyOn(file, "read").mockRejectedValueOnce(readFailure);
    const close = file.close.bind(file);
    vi.spyOn(file, "close").mockImplementation(async () => {
      await close();
      throw closeFailure;
    });
    return file;
  });
  await expect(execute()).rejects.toMatchObject({
    errors: [readFailure, closeFailure],
  });
});

it("rejects oversized manifests rather than returning a normal problem", async () => {
  await put(directory, "package.json", " ".repeat(1_048_577));
  await expect(execute()).rejects.toThrow("Manifest read budget exceeded");
});

it("detects manifest changes during a bounded read", async () => {
  await put(directory, "package.json", {});
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.open).mockImplementation(async (path, flags, mode) => {
    const file = await actual.open(path, flags, mode);
    const read = file.read.bind(file);
    vi.spyOn(file, "read").mockImplementationOnce(async (...args) => {
      await fs.appendFile(path, " ");
      return read(...args);
    });
    return file;
  });
  await expect(execute()).rejects.toThrow("Manifest changed during read");
});

it("builds the new production CAR and runs single, mono and invalid projects through Engine", async () => {
  const single = join(directory, "single");
  const mono = join(directory, "mono");
  const invalid = join(directory, "invalid");
  await put(single, "package.json", { devDependencies: { typescript: "^6" } });
  await put(mono, "package.json", { workspaces: ["packages/*"] });
  await put(
    mono,
    "packages/a/src/index.ts",
    "throw new Error('must not run');",
  );
  await put(invalid, "package.json", {});
  const bundle = join(directory, "bundle");
  let log = "";
  const code = await runCheckBuilderCli(
    ["build", "check.build.yaml", "--out-dir", bundle],
    {
      cwd: resolve("."),
      stdout: {
        write: (text) => {
          log += text;
        },
      },
      stderr: {
        write: (text) => {
          log += text;
        },
      },
    },
  );
  expect(code, log).toBe(0);
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["scripts/smoke.mjs", `${bundle}.car`, single, mono, invalid],
    { cwd: resolve("."), timeout: 90_000 },
  );
  const value: unknown = JSON.parse(stdout);
  const SmokeResult = Type.Object({
    results: Type.Array(
      Type.Object({
        pass: Type.Boolean(),
        problems: Type.Optional(
          Type.Array(Type.Object({ code: Type.String() })),
        ),
      }),
    ),
    reclaimed: Type.Boolean(),
  });
  if (!Value.Check(SmokeResult, value))
    throw new Error("Invalid Engine smoke result.");
  expect(value.results.map((result) => result.pass)).toEqual([
    true,
    true,
    false,
  ]);
  for (const result of value.results)
    for (const field of ["protocol", "nodes", "edges", "root"])
      expect(result).not.toHaveProperty(field);
  expect(value.results[2]?.problems?.map((problem) => problem.code)).toEqual([
    "typescript-project-invalid",
  ]);
  expect(value.reclaimed).toBe(true);
}, 120_000);
