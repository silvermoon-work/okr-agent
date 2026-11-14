import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeEach, afterEach, expect, it } from "vitest";
import { inspect } from "../src/inspect.js";
import type { ProblemCode } from "../src/contract.js";
import { npmFixture, put, testEvidence, fixture, manifest } from "./fixture.js";
import { Files, dataYaml, record } from "../src/files.js";
import {
  compatibilityMatrix,
  publisherProfile,
} from "../src/publisher-profile.js";
import type { Project } from "../src/commands.js";

let root: string;
beforeEach(async () => {
  root = resolve("dist", `.publisher-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  await npmFixture(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function check() {
  const problems: { code: ProblemCode; brief: string }[] = [];
  await inspect(
    { projectDirectory: root },
    new AbortController().signal,
    (code, brief) => {
      problems.push({ code, brief });
    },
    await testEvidence(),
  );
  return problems;
}
it("proves a complete single-package tsc ESM/maps/source + exact standard OIDC publisher profile without executing target code", async () => {
  expect(await check()).toEqual([]);
});
it.each([
  [".github/workflows/ci.yaml", "ci-mismatch"],
  [".github/workflows/npm-publish.yaml", "release-mismatch"],
] as const)("rejects retired Action versions in %s", async (path, code) => {
  const workflow = await readFile(join(root, path), "utf8");
  await put(
    root,
    path,
    workflow.replaceAll("actions/checkout@v7", "actions/checkout@v4"),
  );
  const problem = (await check()).find((entry) => entry.code === code);
  expect(problem?.brief).toContain("actions/checkout@v4");
  expect(problem?.brief).toContain("actions/checkout@v7");
});
it("rejects a second legacy publisher selection source even with unrelated metadata", async () => {
  const config = {
    schemaVersion: 1,
    package: { id: "library", name: "@acme/library", directory: "." },
    ci: { nodeVersions: ["22.15.0", "24.11.0"] },
  };
  await put(root, "release.config.json", { ...config, adapter: "workspace" });
  const problems = await check();
  expect(
    problems.filter((problem) => problem.brief.includes("release.config.json")),
  ).toEqual([
    expect.objectContaining({
      code: "delivery-mismatch",
      brief: expect.stringContaining("旧交付来源须迁移") as unknown,
    }),
  ]);
});
it.each([1, 2])(
  "supports %s real code members with a private aggregate root and one explicitly selected publisher target",
  async (count) => {
    const rootManifest = record(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown,
    );
    const rootScripts = { ...record(rootManifest.scripts) };
    delete rootScripts.build;
    delete rootScripts["lint-package"];
    rootManifest.scripts = rootScripts;
    await put(root, "package.json", {
      ...rootManifest,
      name: "@acme/root",
      private: true,
    });
    await rm(join(root, "scripts", "build.mjs"));
    await rm(join(root, "scripts", "lint-package.mjs"));
    await rm(join(root, "src"), { recursive: true });
    await rm(join(root, "test"), { recursive: true });
    await put(root, "pnpm-workspace.yaml", {
      ...dataYaml(await readFile(join(root, "pnpm-workspace.yaml"), "utf8")),
      packages: ["packages/*"],
    });
    const projects: Project[] = [
      {
        directory: "",
        manifest: { ...rootManifest, name: "@acme/root", private: true },
        sources: [] as string[],
        tests: [] as string[],
      },
    ];
    for (const name of ["library", "core"].slice(0, count)) {
      const member = join(root, "packages", name);
      await npmFixture(member);
      const m = record(
        JSON.parse(
          await readFile(join(member, "package.json"), "utf8"),
        ) as unknown,
      );
      m.name = `@acme/${name}`;
      m.devDependencies = {};
      const memberScripts = { ...record(m.scripts) };
      delete memberScripts.release;
      delete memberScripts["release-dry-run"];
      m.scripts = memberScripts;
      await put(member, "package.json", m);
      await rm(join(member, "scripts", "release.mjs"));
      await rm(join(member, "scripts", "release-dry-run.mjs"));
      await rm(join(member, "AGENTS.md"));
      projects.push({
        directory: `packages/${name}`,
        manifest: m,
        sources: [`packages/${name}/src/index.ts`],
        tests: [`packages/${name}/test/index.test.ts`],
      });
    }
    const config = {
      schemaVersion: 1,
      package: {
        id: "library",
        name: "@acme/library",
        directory: "packages/library",
      },
      ci: { nodeVersions: ["22.15.0", "24.11.0"] },
    };
    const mappings = projects.slice(1).map((project) => ({
      id: project.directory.split("/").at(-1),
      name: project.manifest.name,
      directory: project.directory,
    }));
    const declaration = {
      deliverables: mappings.map((mapping) => ({
        path: mapping.directory,
        type: "npm",
        packageId: mapping.id,
      })),
    };
    await put(root, "silvermoon.yaml", declaration);
    const problems: { code: string; brief: string }[] = [];
    const run = async () => {
      const files = new Files(root, new AbortController().signal);
      await files.scan();
      return publisherProfile(
        files,
        projects,
        await testEvidence(),
        (domain, status, brief) => {
          problems.push({ code: `${domain}-${status}`, brief });
        },
      );
    };
    expect(await run()).toEqual({
      nodeVersions: config.ci.nodeVersions,
      ...(count === 1 ? { directory: "packages/library" } : {}),
    });
    expect(problems).toEqual([]);
    expect(await check()).toEqual([]);
    await put(root, "silvermoon.yaml", {
      deliverables: [{ path: ".", type: "npm", packageId: "library" }],
    });
    expect(await run()).toBeUndefined();
    expect(problems[0]?.code).toBe("release-mismatch");
    expect(problems[0]?.brief).toContain("private");
    problems.length = 0;
    await put(root, "silvermoon.yaml", declaration);
    await put(
      root,
      "scripts/lib/npm-publish.mjs",
      "export async function publish() {}",
    );
    expect(await run()).toBeUndefined();
    expect(problems).toHaveLength(1);
    expect(problems[0]?.brief).toContain("scripts.release-dry-run");
  },
);
it("verifies each static ESM subpath against delivered source and paired tsc outputs", async () => {
  const m = record(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown,
  );
  const exports = {
    ...record(m.exports),
    "./extra": { types: "./dist/extra.d.ts", import: "./dist/extra.js" },
  };
  await put(root, "src/extra.ts", "export const extra = 1;");
  await put(root, "package.json", { ...m, exports });
  expect(await check()).toEqual([]);
  await put(root, "package.json", {
    ...m,
    exports: {
      ...exports,
      "./extra": { ...exports["./extra"], types: "./dist/index.d.ts" },
    },
  });
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "delivery-mismatch",
      brief: expect.stringContaining("exports ./extra") as unknown,
    }),
  );
  await put(root, "package.json", {
    ...m,
    exports: {
      ...exports,
      "./*": { types: "./dist/*.d.ts", import: "./dist/*.js" },
    },
  });
  expect(
    (await check()).some(
      (p) => p.code === "delivery-unconfirmed" && p.brief.includes("./*"),
    ),
  ).toBe(true);
});
it("does not repeat a missing package check as a gate connection mismatch", async () => {
  const m = record(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown,
  );
  const scripts = { ...record(m.scripts) };
  delete scripts["lint-package"];
  scripts.check = `${manifest.scripts.check} && pnpm build`;
  await put(root, "package.json", { ...m, scripts });
  const problems = await check();
  expect(
    problems.some(
      (p) => p.code === "delivery-missing" && p.brief.includes("lint-package"),
    ),
  ).toBe(true);
  expect(
    problems.some((p) => p.brief.includes("build/lint-package 未全部连接")),
  ).toBe(false);
});
it("keeps identically named missing sources in different npm packages distinct", async () => {
  await put(root, "pnpm-workspace.yaml", {
    ...dataYaml(await readFile(join(root, "pnpm-workspace.yaml"), "utf8")),
    packages: ["packages/*"],
  });
  await put(root, "silvermoon.yaml", {
    deliverables: [".", "packages/a", "packages/b"].map((path, i) => ({
      path,
      type: "npm",
      packageId: `package-${i}`,
    })),
  });
  for (const name of ["a", "b"]) {
    const member = join(root, "packages", name);
    await npmFixture(member);
    const m = record(
      JSON.parse(
        await readFile(join(member, "package.json"), "utf8"),
      ) as unknown,
    );
    await put(member, "package.json", {
      ...m,
      name: `@acme/${name}`,
      files: ["dist", "README.md", "LICENSE"],
    });
  }
  const missing = (await check()).filter(
    (p) =>
      p.code === "delivery-mismatch" &&
      p.brief.includes("真实源文件 src/index.ts"),
  );
  expect(missing).toHaveLength(2);
  expect(missing.some((p) => p.brief.startsWith("packages/a:"))).toBe(true);
  expect(missing.some((p) => p.brief.startsWith("packages/b:"))).toBe(true);
});
it.each([
  [
    "source delivery",
    "package.json",
    (text: string) => text.replace('"dist","src"', '"dist"'),
    "delivery-mismatch",
  ],
  [
    "entry relation",
    "package.json",
    (text: string) => text.replace("./dist/index.d.ts", "./dist/other.d.ts"),
    "delivery-mismatch",
  ],
  [
    "rootDir",
    "tsconfig.build.json",
    (text: string) => text.replace('"rootDir":"src"', '"rootDir":"test"'),
    "delivery-mismatch",
  ],
  [
    "client OIDC support",
    ".github/workflows/npm-publish.yaml",
    (text: string) => text.replace("npm@11.21.0", "npm@10.0.0"),
    "release-mismatch",
  ],
  [
    "actual helper bytes",
    "scripts/lib/npm-publish.mjs",
    (text: string) => `${text}\n// custom bypass\n`,
    "release-mismatch",
  ],
  [
    "complete CI aggregate",
    ".github/workflows/ci.yaml",
    (text: string) => text.replace("exit 1", "exit 0"),
    "ci-unconfirmed",
  ],
  [
    "unknown YAML semantics",
    ".github/workflows/ci.yaml",
    (text: string) =>
      text.replace("run: pnpm check", "run: !custom pnpm check"),
    "ci-unconfirmed",
  ],
] as const)(
  "does not pass after mutation of %s",
  async (_label, path, mutate, code) => {
    await put(root, path, mutate(await readFile(join(root, path), "utf8")));
    expect((await check()).map((p) => p.code)).toContain(code);
  },
);
it("reports the observed nonstandard job structure before any derived matrix or publisher binding problem", async () => {
  const workflow = dataYaml(
    await readFile(join(root, ".github", "workflows", "ci.yaml"), "utf8"),
  );
  const jobs = record(workflow.jobs);
  record(jobs.check).strategy = {
    matrix: { "node-version": ["22.15.0", "24.11.1"] },
  };
  delete jobs.compatibility;
  await put(root, ".github/workflows/ci.yaml", workflow);
  await rm(join(root, ".github", "workflows", "npm-publish.yaml"));
  const problems = await check();
  expect(
    problems.some((problem) => problem.brief.includes("jobs.check.strategy")),
  ).toBe(true);
  expect(problems.every((problem) => problem.code.startsWith("ci-"))).toBe(
    true,
  );
  await put(root, "package.json", {
    ...record(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown,
    ),
    version: "not-a-version",
  });
  expect(await check()).toContainEqual(
    expect.objectContaining({ code: "delivery-mismatch" }),
  );
});
it("accepts the bounded Node matrix and scopes unsupported identity axes", async () => {
  const workflow = dataYaml(
    await readFile(join(root, ".github", "workflows", "ci.yaml"), "utf8"),
  );
  const matrix = record(
    record(record(record(workflow.jobs).compatibility).strategy).matrix,
  );
  matrix["node-version"] = ["22.15.0", "24.11.0", "24.11.1"];
  await put(root, ".github/workflows/ci.yaml", workflow);
  const files = new Files(root, new AbortController().signal);
  await files.scan();
  const problems: string[] = [];
  const profile = await publisherProfile(
    files,
    [
      {
        directory: "",
        manifest: await files.json("package.json"),
        sources: ["src/index.ts"],
        tests: ["test/index.test.ts"],
      },
    ],
    await testEvidence(),
    (_domain, _status, brief) => {
      problems.push(brief);
    },
  );
  expect(profile?.nodeVersions).toEqual(matrix["node-version"]);
  expect(problems).toEqual([]);
  matrix.extra = ["ignored"];
  await put(root, ".github/workflows/ci.yaml", workflow);
  expect(
    (await check()).filter((problem) => problem.code.startsWith("ci-")),
  ).toEqual([
    expect.objectContaining({
      code: "ci-unconfirmed",
      brief: expect.stringContaining(
        "jobs.compatibility.strategy.matrix.extra",
      ) as unknown,
    }),
  ]);
});
it("requires the actual engine minimum in the compatibility matrix, not just a higher happy path", async () => {
  const text = await readFile(join(root, "package.json"), "utf8");
  await put(root, "package.json", text.replace(">=22.15.0", ">=22.14.0"));
  expect((await check()).map((p) => p.code)).toContain("ci-mismatch");
});
it("evaluates LTS support at the current time, not the cached observation time", async () => {
  const evidence = await testEvidence();
  const provider = evidence.metadata.node;
  const now = Date.now();
  evidence.metadata.node = async () => {
    const observed = await provider();
    observed.data.schedule.v24!.end = new Date(now - 86_400_000).toISOString();
    return { ...observed, observedAt: now - 172_800_000 };
  };
  const problems: { code: string; brief: string }[] = [];
  await inspect(
    { projectDirectory: root },
    new AbortController().signal,
    (code, brief) => problems.push({ code, brief }),
    evidence,
  );
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "ci-mismatch",
      brief: expect.stringContaining("当前受支持的官方 LTS") as unknown,
    }),
  );
});
it("does not turn unsupported extra matrix entries into a consumer promise", async () => {
  const evidence = await testEvidence();
  const provider = evidence.metadata.node;
  evidence.metadata.node = async () => {
    const observation = await provider();
    observation.data.releases.push({ version: "v22.13.0", lts: "Jod" });
    return observation;
  };
  const problems: { code: string; brief: string }[] = [];
  const runtimes: Project[] = [
    {
      directory: "packages/sdk",
      manifest: { engines: { node: ">=22.15" } },
      sources: ["src/index.ts"],
      tests: [],
    },
    {
      directory: "packages/builder",
      manifest: { private: true, engines: { node: "^22.15.0 || >=24" } },
      sources: ["src/index.ts"],
      tests: [],
    },
  ];
  const run = async (
    nodes: string[],
    tools: { name: string; range: string }[] = [],
  ) => {
    problems.length = 0;
    await compatibilityMatrix(
      { nodeVersions: nodes },
      runtimes,
      evidence.metadata,
      (domain, status, brief) =>
        problems.push({ code: `${domain}-${status}`, brief }),
      tools,
    );
    return problems;
  };
  expect(await run(["22.13.0", "22.15.0", "24.11.0"])).toEqual([]);
  expect(await run(["22.13.0", "24.11.0"])).toContainEqual(
    expect.objectContaining({
      code: "ci-mismatch",
      brief: expect.stringContaining("缺少 required 最低版本") as unknown,
    }),
  );
  const limitation = await run(
    ["22.13.0", "22.15.0", "24.11.0"],
    [{ name: "modern-tool", range: ">=24" }],
  );
  expect(limitation).toHaveLength(1);
  expect(limitation[0]?.code).toBe("ci-unconfirmed");
  expect(limitation[0]?.brief).toContain('unsupported 额外条目=["22.13.0"]');
  expect(limitation[0]?.brief).toContain("仍对全部条目运行开发 check");
});
it("does not infer an npm library from private:false alone", async () => {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await fixture(root);
  await put(root, "package.json", { ...manifest, private: false });
  const problems = await check();
  expect(problems).toEqual([]);
  expect(problems.some((p) => p.code.startsWith("release-"))).toBe(false);
  await put(root, "package.json", { ...manifest, main: "./dist/server.js" });
  const application = await check();
  expect(
    application.some(
      (p) => p.code === "delivery-unconfirmed" && p.brief.includes("应用 main"),
    ),
  ).toBe(true);
  expect(application.some((p) => p.code.startsWith("release-"))).toBe(false);
  await put(root, "package.json", {
    ...manifest,
    exports: { ".": "./src/index.ts" },
  });
  const internal = await check();
  expect(internal.some((p) => p.code === "delivery-unconfirmed")).toBe(false);
  expect(internal.some((p) => p.code.startsWith("release-"))).toBe(false);
});
it("does not promote private internal packages based on manifest features or old mappings", async () => {
  const m = record(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown,
  );
  const scripts = { ...record(m.scripts) };
  delete scripts.release;
  delete scripts["release-dry-run"];
  await rm(join(root, "scripts", "release.mjs"));
  await rm(join(root, "scripts", "release-dry-run.mjs"));
  await put(root, "package.json", {
    ...m,
    scripts,
    private: true,
    exports: { ".": "not-an-npm-entry" },
    types: "./missing.d.ts",
    publishConfig: { access: "restricted" },
    license: undefined,
  });
  await put(root, "silvermoon.yaml", { deliverables: [] });
  await rm(join(root, ".github", "workflows", "npm-publish.yaml"));
  await rm(join(root, "scripts", "lib", "npm-publish.mjs"));
  expect(await check()).toEqual([]);
  await put(root, "tsconfig.build.json", {
    compilerOptions: { noEmit: true },
    include: ["src/**/*.ts"],
  });
  expect(
    (await check()).some(
      (p) =>
        p.code === "delivery-mismatch" && p.brief.includes("build 不得 noEmit"),
    ),
  ).toBe(true);
});
it("reports explicit private-protection removal followed by publication without requiring npm delivery configuration", async () => {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await fixture(root);
  const workflow = {
    on: { workflow_dispatch: {} },
    jobs: {
      release: {
        steps: [
          { run: "npm pkg delete private" },
          { run: "npm publish --tag latest" },
        ],
      },
    },
  };
  await put(root, ".github/workflows/release.yaml", workflow);
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "release-mismatch",
      brief: expect.stringContaining("禁止发布 private 包") as unknown,
    }),
  );
  workflow.jobs.release.steps[1]!.run = "npm publish --dry-run --tag latest";
  await put(root, ".github/workflows/release.yaml", workflow);
  expect(
    (await check()).some((problem) =>
      problem.brief.includes("禁止发布 private 包"),
    ),
  ).toBe(false);
  workflow.jobs.release.steps = [
    { run: "npm pkg delete private" },
    { run: "npm pkg set private=true" },
    { run: "npm publish --tag latest" },
  ];
  await put(root, ".github/workflows/release.yaml", workflow);
  expect(
    (await check()).some((problem) =>
      problem.brief.includes("禁止发布 private 包"),
    ),
  ).toBe(false);
});
