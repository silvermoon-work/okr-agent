import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DeliverablesError,
  loadDeliverables,
  npmMappings,
  parseDeliverables,
  validateDeliveryPaths,
} from "../assets/deliverables.mjs";
import { projectDeliverables } from "../src-legacy/deliverables.js";
import { Files, Unconfirmed } from "../src-legacy/files.js";
import { inspect } from "../src-legacy/inspect.js";
import { fixture, npmFixture, put, testEvidence } from "./fixture.js";
import type { Project } from "../src-legacy/commands.js";

let root: string;
let declaredDirectories: string[];
beforeEach(async () => {
  declaredDirectories = ["."];
  root = resolve("dist", `.deliverables-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  await fixture(root);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
async function observe() {
  const problems: { code: string; brief: string }[] = [];
  await inspect(
    { projectDirectory: root },
    new AbortController().signal,
    (code, brief) => problems.push({ code, brief }),
    await testEvidence(),
  );
  return problems;
}
async function declaration(deliverables: { path: string; type: string }[]) {
  for (const directory of declaredDirectories)
    await rm(join(root, directory, "deliverable.yaml"), { force: true });
  declaredDirectories = deliverables.map((entry) => entry.path);
  for (const { path, type } of deliverables)
    await put(root, `${path}/deliverable.yaml`, { type });
}
async function readProjects(projects?: Project[]) {
  const files = new Files(root, new AbortController().signal);
  await files.scan();
  const actual = projects ?? [
    {
      directory: "",
      manifest: await files.json("package.json"),
      sources: ["src/index.ts"],
      tests: [],
    },
  ];
  const problems: { status: string; brief: string }[] = [];
  const entries = await projectDeliverables(files, actual, (status, brief) =>
    problems.push({ status, brief }),
  );
  return { entries, projects: actual, problems };
}
it.each([
  [undefined, []],
  ["type: none", [{ path: ".", type: "none" }]],
  [
    "type: my-target\ncommand: DO-NOT-EXECUTE",
    [{ path: ".", type: "my-target", command: "DO-NOT-EXECUTE" }],
  ],
])("keeps an absent or open-type declaration inert", (source, expected) => {
  expect(parseDeliverables(source)).toEqual(expected);
});
it.each([
  ["type: [", "mismatch"],
  ["null", "mismatch"],
  ["{}", "missing"],
  ["deliverables: []", "mismatch"],
  ["type: {}\n", "mismatch"],
  ["type: npm\ntype: npm", "mismatch"],
  ['["x"]', "mismatch"],
  ["path: .", "mismatch"],
  ["type: npm\npath: .", "mismatch"],
  ["type: npm\npackageId: library", "mismatch"],
  ['type: "Cloudflare"', "mismatch"],
  ["type: a--b", "mismatch"],
])(
  "rejects malformed or ambiguous declarations: %s",
  async (source, status) => {
    await put(root, "deliverable.yaml", source);
    expect((await readProjects()).problems).toContainEqual({
      status,
      brief: expect.stringContaining("deliverable.yaml") as unknown,
    });
  },
);
it.each([
  "",
  "/absolute",
  "C:/absolute",
  "../escape",
  "./child",
  "a/../b",
  "a//b",
  "a/",
  "a\\b",
  "apps/*",
  "apps/?",
  "apps/[ab]",
  "apps/{a,b}",
  "bad\npath",
])("rejects noncanonical discovery path %s", (path) => {
  expect(() => parseDeliverables("type: custom", path)).toThrow(
    "root-relative directory",
  );
});
it("requires package-local declarations without recursive inheritance", async () => {
  await mkdir(join(root, "internal", "nested"), { recursive: true });
  await declaration([
    { path: "internal", type: "custom" },
    { path: "internal/nested", type: "other" },
  ]);
  expect(loadDeliverables(root, ["internal", "internal/nested"])).toHaveLength(
    2,
  );
  expect(loadDeliverables(root)).toEqual([]);
  expect((await readProjects()).problems[0]?.status).toBe("mismatch");
  expect(() => {
    validateDeliveryPaths(root, [{ path: "missing", type: "custom" }]);
  }).toThrow("directory unavailable");
  expect(() => {
    validateDeliveryPaths(root, [{ path: "README.md", type: "custom" }]);
  }).toThrow("existing directory");
});
it("does not follow redirected directories or declaration files", async () => {
  await mkdir(join(root, "internal"));
  await symlink(join(root, "internal"), join(root, "redirect"), "junction");
  expect(() => loadDeliverables(root, ["redirect"])).toThrow("redirected");
  await symlink(
    join(root, "internal"),
    join(root, "deliverable.yaml"),
    "junction",
  );
  expect((await readProjects()).problems[0]?.status).toBe("unconfirmed");
  expect(() => loadDeliverables(root)).toThrow("non-redirected");
});
it("classifies supported read uncertainty but preserves unexpected I/O failures", async () => {
  const files = new Files(root, new AbortController().signal);
  const project: Project = {
    directory: "",
    manifest: {},
    sources: [],
    tests: [],
  };
  const optionalText = vi
    .spyOn(files, "optionalText")
    .mockRejectedValueOnce(new Unconfirmed("read limit"));
  const problems: string[] = [];
  expect(
    await projectDeliverables(files, [project], (_status, brief) =>
      problems.push(brief),
    ),
  ).toEqual([]);
  expect(problems).toEqual(["read limit"]);
  optionalText.mockRejectedValueOnce(new Error("I/O"));
  await expect(projectDeliverables(files, [project], () => {})).rejects.toThrow(
    "I/O",
  );
});
it("bounds alias expansion and runtime declaration size", async () => {
  await put(
    root,
    "deliverable.yaml",
    `type: custom\nentries: [&entry {value: x}, ${Array.from({ length: 40 }, () => "*entry").join(", ")}]`,
  );
  expect((await readProjects()).problems[0]?.status).toBe("unconfirmed");
  await put(root, "deliverable.yaml", " ".repeat(1_048_577));
  expect(() => loadDeliverables(root)).toThrow("1MiB");
});
it.each([
  "silvermoon.yaml",
  "scripts/lib/release-packages.mjs",
  "scripts/release-packages.js",
  "release.config.json",
])("rejects legacy target data without executing it: %s", async (path) => {
  await put(root, path, 'throw new Error("DO NOT EXECUTE");');
  expect((await readProjects()).problems[0]?.status).toBe("mismatch");
  expect(() => loadDeliverables(root)).toThrow("legacy delivery source");
});
it("uses explicit npm identity, rejects private/core targets, and never infers from manifest features", async () => {
  await npmFixture(root);
  const { entries, projects } = await readProjects();
  expect(npmMappings(entries, projects)).toEqual([
    { id: "@acme/library", name: "@acme/library", directory: "." },
  ]);
  expect(npmMappings([], projects)).toEqual([]);
  expect(() => npmMappings(entries, [])).toThrow("one declared package");
  expect(() =>
    npmMappings(entries, [{ ...projects[0]!, manifest: { private: true } }]),
  ).toThrow("private");
  expect(() =>
    npmMappings(entries, [{ ...projects[0]!, manifest: {} }]),
  ).toThrow("name is required");
  await put(root, "packages/core/package.json", {
    name: "@acme/core",
    private: true,
  });
  await declaration([{ path: ".", type: "npm" }]);
  const core: Project = {
    directory: "packages/core",
    manifest: { name: "@acme/core", private: true },
    sources: [],
    tests: [],
  };
  const result = await readProjects([...projects, core]);
  expect(core.delivery).toBeUndefined();
  expect(npmMappings(result.entries, result.projects)).toHaveLength(1);
  await declaration([
    { path: ".", type: "npm" },
    { path: "packages/core", type: "npm" },
  ]);
  expect(() =>
    npmMappings(loadDeliverables(root, [".", "packages/core"]), [
      ...projects,
      core,
    ]),
  ).toThrow("private");
});
it("explicitly rejects npm intent for a private package instead of silently exempting it", async () => {
  await npmFixture(root);
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  ) as Record<string, unknown>;
  await put(root, "package.json", { ...manifest, private: true });
  const problems = await observe();
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "delivery-mismatch",
      brief: expect.stringContaining("private") as unknown,
    }),
  );
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "release-mismatch",
      brief: expect.stringContaining("private") as unknown,
    }),
  );
});
it("rejects duplicate full npm identities but distinguishes scopes", () => {
  const entries = [
    { path: "packages/a", type: "npm" },
    { path: "packages/b", type: "npm" },
  ];
  const projects = [
    { directory: "packages/a", manifest: { name: "@first/widget" } },
    { directory: "packages/b", manifest: { name: "@second/widget" } },
  ];
  expect(npmMappings(entries, projects).map((mapping) => mapping.id)).toEqual([
    "@first/widget",
    "@second/widget",
  ]);
  projects[1]!.manifest.name = "@first/widget";
  expect(() => npmMappings(entries, projects)).toThrow(
    "duplicate npm package name",
  );
});
it("does not apply npm delivery to Cloudflare, custom types or undeclared public-looking packages; common strictness remains", async () => {
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  ) as Record<string, unknown>;
  await put(root, "package.json", {
    ...manifest,
    private: false,
    publishConfig: { access: "public" },
  });
  await put(root, "wrangler.jsonc", '{ "main": "src/index.ts" }');
  for (const type of [undefined, "cloudflare", "custom"]) {
    await declaration([{ path: ".", type: type ?? "none" }]);
    const problems = await observe();
    if (type === "cloudflare")
      expect(
        problems.every((problem) => problem.code.startsWith("cloudflare-")),
      ).toBe(true);
    else expect(problems).toEqual([]);
  }
  await put(root, "tsconfig.base.json", { compilerOptions: { strict: false } });
  expect(
    (await observe()).some((problem) => problem.code === "typescript-mismatch"),
  ).toBe(true);
});
it.each([
  ["pnpm release", {}],
  ["pnpm release-dry-run", { env: { PACKAGE_INPUT: "undeclared" } }],
  ["npm publish", { "working-directory": "." }],
  ["pnpm publish", { "working-directory": "${{ inputs.directory }}" }],
  ["npm publish --prefix packages/x", {}],
  ['npm publish "./dist/pkg.tgz"', {}],
])(
  "reports a missing declaration once for publication evidence: %s",
  async (run, extra) => {
    await put(root, ".github/workflows/release.yaml", {
      jobs: { release: { steps: [{ run, ...extra }] } },
    });
    const { problems } = await readProjects();
    expect(problems).toEqual([
      {
        status: "missing",
        brief: expect.stringContaining(
          "未声明交付类型，但观察到交付迹象 .github/workflows/release.yaml:release",
        ) as unknown,
      },
    ]);
  },
);
it("reports platform configuration as delivery evidence only without any declaration", async () => {
  await put(root, "wrangler.toml", 'name = "app"');
  const missing = await readProjects();
  expect(missing.problems).toEqual([
    {
      status: "missing",
      brief: expect.stringContaining("wrangler.toml") as unknown,
    },
  ]);
  await declaration([{ path: ".", type: "none" }]);
  expect((await readProjects()).problems).toEqual([]);
});
it("leaves direct publication directories to the release domain once declared", async () => {
  await npmFixture(root);
  for (const step of [
    { run: "npm publish", "working-directory": "elsewhere" },
    { run: 'npm publish "./dist/pkg.tgz"' },
    { run: "pnpm publish --prefix packages/x" },
  ]) {
    await put(root, ".github/workflows/release.yaml", {
      jobs: { release: { steps: [step] } },
    });
    expect((await readProjects()).problems).toEqual([]);
  }
});
it("accepts a registered release selection and ignores inert non-publishing steps", async () => {
  await npmFixture(root);
  await put(root, ".github/workflows/extra.yaml", {
    jobs: {
      extra: {
        env: { PACKAGE_INPUT: "@acme/library" },
        steps: [{ name: "no command" }, { run: "pnpm release" }],
      },
    },
  });
  expect((await readProjects()).problems).toEqual([]);
  await put(root, ".github/workflows/extra.yaml", {
    jobs: { metadata: { name: "npm publish" } },
  });
  expect((await readProjects()).problems).toEqual([]);
  await put(root, ".github/workflows/extra.yaml", {
    jobs: {
      extra: {
        steps: [
          { run: "pnpm release-dry-run", env: { PACKAGE_INPUT: "core" } },
        ],
      },
    },
  });
  expect(
    (await readProjects()).problems.some(
      (problem) =>
        problem.status === "missing" && problem.brief.includes("core"),
    ),
  ).toBe(true);
  await declaration([{ path: ".", type: "none" }]);
  expect(
    (await readProjects()).problems.some(
      (problem) => problem.status === "missing",
    ),
  ).toBe(true);
});
it("honors inherited workflow selectors without treating echo text as invocation", async () => {
  await npmFixture(root);
  await put(root, ".github/workflows/extra.yaml", {
    env: { PACKAGE_INPUT: "undeclared" },
    jobs: {
      release: {
        env: { OTHER: "value" },
        steps: [{ run: "pnpm run release-dry-run", env: { EXTRA: "value" } }],
      },
    },
  });
  expect(
    (await readProjects()).problems.some(
      (problem) =>
        problem.status === "missing" && problem.brief.includes("undeclared"),
    ),
  ).toBe(true);
  await put(root, ".github/workflows/extra.yaml", {
    jobs: { log: { steps: [{ run: 'echo "npm publish"' }] } },
  });
  expect((await readProjects()).problems).toEqual([]);
});
it("protects the declaration from formatting and Git exclusions", async () => {
  await declaration([{ path: ".", type: "none" }]);
  await put(root, ".prettierignore", "deliverable.yaml");
  await put(
    root,
    ".gitignore",
    `${await readFile(join(root, ".gitignore"), "utf8")}deliverable.yaml\n`,
  );
  const problems = await observe();
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "formatting-mismatch",
      brief: expect.stringContaining("deliverable.yaml") as unknown,
    }),
  );
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "document-mismatch",
      brief: expect.stringContaining("deliverable.yaml") as unknown,
    }),
  );
});
it("keeps schema failures identifiable to runtime consumers", () => {
  expect(() => parseDeliverables("type: false")).toThrow(DeliverablesError);
});
