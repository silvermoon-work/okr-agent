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
import { checkpoints } from "../src/checkpoints.js";
import { project } from "../src/checks/project.js";

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
    checkpoints,
    target: { projectDirectory: directory },
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
      references: [],
    });
    expect(records.map((node) => node.checkpoint)).toEqual([
      "project",
      "workspace",
    ]);
    expect(records.every((node) => !("parent" in node))).toBe(true);
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
      "references",
    ]);
    if (report.pass) throw new Error("Expected an invalid project.");
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0].code).toBe("typescript-project-invalid");
    expect(report.problems[0].brief).toContain(directory);
    expect(report.problems[0].checkpoint).toBe("project");
  },
);

it.each(["pnpm", "manifest"] as const)(
  "routes %s workspace declaration to monorepo and reports its invalid workspace configuration",
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
    expect(report.pass).toBe(false);
    expect(records.map((node) => node.checkpoint)).toEqual([
      "project",
      "workspace",
    ]);
    if (report.pass)
      throw new Error("Expected invalid workspace configuration.");
    expect(report.problems.map((problem) => problem.code)).toEqual([
      "workspace-configuration-invalid",
    ]);
    expect(report.problems[0].checkpoint).toBe("workspace");
  },
);

it("recognizes monorepo TypeScript dependencies in a child package", async () => {
  await put(directory, "package.json", { workspaces: ["packages/*"] });
  await put(directory, "pnpm-workspace.yaml", "packages: ['packages/*']");
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
  expect(records.map((node) => node.checkpoint)).toEqual([
    "project",
    "workspace",
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
    project.invoke(
      { projectDirectory: link },
      {
        signal: new AbortController().signal,
        outputOf: () => {
          throw new Error("No predecessor");
        },
      },
    ),
  ).rejects.toThrow("linked or redirected");
});

it("keeps invalid host paths and missing directories as execution errors", async () => {
  for (const path of ["relative", `${directory}\n`])
    await expect(
      project.invoke(
        { projectDirectory: path },
        {
          signal: new AbortController().signal,
          outputOf: () => {
            throw new Error("No predecessor");
          },
        },
      ),
    ).rejects.toThrow("absolute host directory");
  await put(directory, "file", "");
  await expect(
    project.invoke(
      { projectDirectory: join(directory, "file") },
      {
        signal: new AbortController().signal,
        outputOf: () => {
          throw new Error("No predecessor");
        },
      },
    ),
  ).rejects.toThrow("must be a directory");
  await expect(
    project.invoke(
      { projectDirectory: join(directory, "absent") },
      {
        signal: new AbortController().signal,
        outputOf: () => {
          throw new Error("No predecessor");
        },
      },
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
  await expect(execute()).rejects.toThrow("Project file read budget exceeded");
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
  await expect(execute()).rejects.toThrow("Project file changed during read");
});

it.each([
  ["empty document", ""],
  ["scalar", "workspace"],
  ["sequence", "- packages"],
  ["missing packages", "catalog: {}"],
  ["empty packages", "packages: []"],
  ["null packages", "packages: null"],
  ["string packages", "packages: 'modules/*'"],
  ["non-string item", "packages: [1]"],
  ["empty item", "packages: ['']"],
  ["blank item", "packages: ['  ']"],
  ["mixed items", "packages: ['modules/*', false]"],
  ["invalid YAML", "packages: ["],
  ["duplicate key", "packages: ['a']\npackages: ['b']"],
  ["unresolved alias", "packages: *absent"],
] as const)(
  "reports workspace configuration problem for %s",
  async (_name, text) => {
    await put(directory, "package.json", {
      devDependencies: { typescript: "*" },
    });
    await put(directory, "pnpm-workspace.yaml", text);
    const report = await execute();
    expect(report).toMatchObject({
      pass: false,
      problems: [
        {
          code: "workspace-configuration-invalid",
        },
      ],
    });
    if (report.pass)
      throw new Error("Expected invalid workspace configuration.");
    expect(report.problems[0].brief).toContain(
      join(directory, "pnpm-workspace.yaml"),
    );
    expect(records.map((node) => node.checkpoint)).toEqual([
      "project",
      "workspace",
    ]);
  },
);

it.each([
  "packages: ['modules/*', '!modules/fixtures', 'nested/**']\ncatalog: {}",
  "members: &members ['modules/*']\npackages: *members",
])(
  "accepts explicit workspace patterns without checking members: %s",
  async (text) => {
    await put(directory, "package.json", {
      devDependencies: { typescript: "*" },
    });
    await put(directory, "pnpm-workspace.yaml", text);
    expect((await execute()).pass).toBe(true);
  },
);

it("reports a non-file workspace declaration and rejects linked configuration", async () => {
  await put(directory, "package.json", {
    devDependencies: { typescript: "*" },
    workspaces: [],
  });
  const path = join(directory, "pnpm-workspace.yaml");
  await fs.mkdir(path);
  const report = await execute();
  expect(report).toMatchObject({
    pass: false,
    problems: [
      {
        code: "workspace-configuration-invalid",
      },
    ],
  });
  if (report.pass) throw new Error("Expected invalid workspace configuration.");
  expect(report.problems[0].brief).toContain("普通文件");
  await fs.rm(path, { recursive: true });
  const outside = join(directory, "dist", "workspace");
  await fs.mkdir(outside, { recursive: true });
  await fs.symlink(outside, path, "junction");
  await expect(execute()).rejects.toThrow("linked or redirected");
});

it("propagates workspace read errors and enforces the file read budget", async () => {
  await put(directory, "package.json", {
    devDependencies: { typescript: "*" },
  });
  await put(directory, "pnpm-workspace.yaml", " ".repeat(1_048_577));
  await expect(execute()).rejects.toThrow("Project file read budget exceeded");
  await put(directory, "pnpm-workspace.yaml", "packages: ['modules/*']");
  const failure = new Error("workspace read denied");
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.open).mockImplementation((path, flags, mode) =>
    String(path).endsWith("pnpm-workspace.yaml")
      ? Promise.reject(failure)
      : actual.open(path, flags, mode),
  );
  await expect(execute()).rejects.toBe(failure);
});

it("builds the new production CAR and runs single, mono and invalid projects through Engine", async () => {
  const single = join(directory, "single");
  const mono = join(directory, "mono");
  const invalid = join(directory, "invalid");
  const missingWorkspace = join(directory, "missing-workspace");
  await put(single, "package.json", { devDependencies: { typescript: "^6" } });
  await put(mono, "package.json", { workspaces: ["packages/*"] });
  await put(mono, "pnpm-workspace.yaml", "packages: ['packages/*']");
  await put(missingWorkspace, "package.json", {
    workspaces: ["modules/*"],
    devDependencies: { typescript: "*" },
  });
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
    [
      "scripts/smoke.mjs",
      `${bundle}.car`,
      single,
      mono,
      invalid,
      missingWorkspace,
    ],
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
    false,
  ]);
  for (const result of value.results)
    for (const field of ["protocol", "nodes", "edges", "root"])
      expect(result).not.toHaveProperty(field);
  expect(value.results[2]?.problems?.map((problem) => problem.code)).toEqual([
    "typescript-project-invalid",
  ]);
  expect(value.results[3]?.problems?.map((problem) => problem.code)).toEqual([
    "workspace-configuration-invalid",
  ]);
  expect(value.reclaimed).toBe(true);
}, 120_000);
