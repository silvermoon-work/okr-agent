import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DeliverablesError,
  loadDeliverables,
  npmMappings,
  parseDeliverables,
} from "../assets/deliverables.mjs";
import { projectDeliverables } from "../src/deliverables.js";
import { Files, Unconfirmed } from "../src/files.js";
import { inspect } from "../src/inspect.js";
import { fixture, npmFixture, put, testEvidence } from "./fixture.js";
import type { Project } from "../src/commands.js";

let root: string;
beforeEach(async () => {
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
async function declaration(deliverables: unknown) {
  await put(root, "silvermoon.yaml", { deliverables });
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
  ["deliverables: []", []],
  [
    "deliverables:\n - path: .\n   type: my-target\n   command: DO-NOT-EXECUTE",
    [{ path: ".", type: "my-target", command: "DO-NOT-EXECUTE" }],
  ],
])("keeps an absent or open-type declaration inert", (source, expected) => {
  expect(parseDeliverables(source)).toEqual(expected);
});
it.each([
  ["deliverables: [", "mismatch"],
  ["null", "mismatch"],
  ["{}", "missing"],
  ["schemaVersion: 1\ndeliverables: []", "mismatch"],
  ["deliverables: {}\n", "mismatch"],
  ["deliverables: []\ndeliverables: []", "mismatch"],
  ['deliverables: ["x"]', "mismatch"],
  ["deliverables: [{type: npm}]", "missing"],
  ["deliverables: [{path: .}]", "missing"],
  ["deliverables: [{path: ., type: npm}]", "missing"],
  ["deliverables: [{path: ., type: npm, packageId: bad_id}]", "mismatch"],
  ['deliverables: [{path: ., type: "Cloudflare"}]', "mismatch"],
  ["deliverables: [{path: ., type: a--b}]", "mismatch"],
  ["deliverables: [{path: ., type: a}, {path: ., type: b}]", "mismatch"],
  [
    "deliverables: [{path: a, type: npm, packageId: x}, {path: b, type: npm, packageId: x}]",
    "mismatch",
  ],
])(
  "rejects malformed or ambiguous declarations: %s",
  async (source, status) => {
    await put(root, "silvermoon.yaml", source);
    expect((await readProjects()).problems).toContainEqual({
      status,
      brief: expect.stringContaining("silvermoon.yaml") as unknown,
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
])("rejects noncanonical path %s", async (path) => {
  await declaration([{ path, type: "custom" }]);
  expect((await readProjects()).problems[0]?.status).toBe("mismatch");
});
it("validates existing directories and nested identities without recursive inheritance", async () => {
  await mkdir(join(root, "internal", "nested"), { recursive: true });
  await declaration([
    { path: "internal", type: "custom" },
    { path: "internal/nested", type: "other", extra: {} },
  ]);
  expect(loadDeliverables(root)).toHaveLength(2);
  expect((await readProjects()).problems).toEqual([]);
  await declaration([{ path: "internal/nested", type: "cloudflare" }]);
  expect((await readProjects()).problems[0]?.status).toBe("mismatch");
  await declaration([{ path: "missing", type: "custom" }]);
  expect((await readProjects()).problems[0]?.status).toBe("missing");
  await declaration([{ path: "README.md", type: "custom" }]);
  expect((await readProjects()).problems[0]?.status).toBe("mismatch");
});
it("does not follow redirected directories or declaration files", async () => {
  await mkdir(join(root, "internal"));
  await symlink(join(root, "internal"), join(root, "redirect"), "junction");
  await declaration([{ path: "redirect", type: "custom" }]);
  expect((await readProjects()).problems[0]?.status).toBe("unconfirmed");
  expect(() => loadDeliverables(root)).toThrow("redirected");
  await rm(join(root, "silvermoon.yaml"));
  await symlink(
    join(root, "internal"),
    join(root, "silvermoon.yaml"),
    "junction",
  );
  expect((await readProjects()).problems[0]?.status).toBe("unconfirmed");
  expect(() => loadDeliverables(root)).toThrow("non-redirected");
});
it("classifies supported read uncertainty but preserves unexpected I/O failures", async () => {
  const files = new Files(root, new AbortController().signal);
  const optionalText = vi
    .spyOn(files, "optionalText")
    .mockRejectedValueOnce(new Unconfirmed("read limit"));
  const problems: string[] = [];
  expect(
    await projectDeliverables(files, [], (_status, brief) =>
      problems.push(brief),
    ),
  ).toEqual([]);
  expect(problems).toEqual(["read limit"]);
  optionalText.mockRejectedValueOnce(new Error("I/O"));
  await expect(projectDeliverables(files, [], () => {})).rejects.toThrow("I/O");
});
it("bounds alias expansion and runtime declaration size", async () => {
  await put(
    root,
    "silvermoon.yaml",
    `deliverables: [&entry {path: ., type: custom}, ${Array.from({ length: 40 }, () => "*entry").join(", ")}]`,
  );
  expect((await readProjects()).problems[0]?.status).toBe("unconfirmed");
  await put(root, "silvermoon.yaml", " ".repeat(1_048_577));
  expect(() => loadDeliverables(root)).toThrow("1MiB");
});
it.each([
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
    { id: "library", name: "@acme/library", directory: "." },
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
  await declaration([{ path: ".", type: "npm", packageId: "library" }]);
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
    { path: ".", type: "npm", packageId: "library" },
    { path: "packages/core", type: "npm", packageId: "core" },
  ]);
  expect(() =>
    npmMappings(loadDeliverables(root), [...projects, core]),
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
    await declaration(type ? [{ path: ".", type }] : []);
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
  ["pnpm release", {}, "missing"],
  ["pnpm release-dry-run", { env: { PACKAGE_INPUT: "undeclared" } }, "missing"],
  ["npm publish", { "working-directory": "." }, "missing"],
  [
    "pnpm publish",
    { "working-directory": "${{ inputs.directory }}" },
    "unconfirmed",
  ],
  ["npm publish --prefix packages/x", {}, "unconfirmed"],
])(
  "reports explicit unregistered/unknown publication selection: %s",
  async (run, extra, status) => {
    await put(root, ".github/workflows/release.yaml", {
      jobs: { release: { steps: [{ run, ...extra }] } },
    });
    expect(
      (await readProjects()).problems.some(
        (problem) => problem.status === status,
      ),
    ).toBe(true);
  },
);
it("accepts a registered release selection and ignores inert non-publishing steps", async () => {
  await npmFixture(root);
  await put(root, ".github/workflows/extra.yaml", {
    jobs: {
      extra: {
        env: { PACKAGE_INPUT: "library" },
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
  await declaration([]);
  expect(
    (await readProjects()).problems.some(
      (problem) => problem.status === "missing",
    ),
  ).toBe(true);
});
it("honors inherited workflow selectors and directories, without treating echo text as invocation", async () => {
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
    defaults: { run: { "working-directory": "elsewhere" } },
    jobs: {
      release: {
        defaults: { run: { shell: "bash" } },
        steps: [{ run: "npm publish" }],
      },
    },
  });
  expect(
    (await readProjects()).problems.some((problem) =>
      problem.brief.includes("elsewhere"),
    ),
  ).toBe(true);
  await put(root, ".github/workflows/extra.yaml", {
    jobs: { log: { steps: [{ run: 'echo "npm publish"' }] } },
  });
  expect((await readProjects()).problems).toEqual([]);
});
it("protects the declaration from formatting and Git exclusions", async () => {
  await declaration([]);
  await put(root, ".prettierignore", "silvermoon.yaml");
  await put(
    root,
    ".gitignore",
    `${await readFile(join(root, ".gitignore"), "utf8")}silvermoon.yaml\n`,
  );
  const problems = await observe();
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "formatting-mismatch",
      brief: expect.stringContaining("silvermoon.yaml") as unknown,
    }),
  );
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "document-mismatch",
      brief: expect.stringContaining("silvermoon.yaml") as unknown,
    }),
  );
});
it("keeps schema failures identifiable to runtime consumers", () => {
  expect(() => parseDeliverables("deliverables: false")).toThrow(
    DeliverablesError,
  );
});
