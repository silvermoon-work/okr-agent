import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { Files } from "../src/files.js";
import {
  ciReuseEvidence,
  mappingEvidence,
  releaseMappings,
} from "../src/release-evidence.js";
import { fixture, manifest, put } from "./fixture.js";

it("reads data-only explicit release mappings and rejects dynamic executable lookalikes", () => {
  expect(
    releaseMappings(
      'export const releasePackages = [{id:"lib",name:"@acme/lib",directory:"packages/lib"}];',
    ),
  ).toEqual([{ id: "lib", name: "@acme/lib", directory: "packages/lib" }]);
  expect(() =>
    releaseMappings("export const releasePackages = getPackages();"),
  ).toThrow("静态数组");
  expect(() =>
    releaseMappings(
      "export const releasePackages = [{ get id() { throw 1 } }];",
    ),
  ).toThrow("accessor");
});
it("reports legacy mapping migration without importing or using it to select targets", async () => {
  const root = resolve("dist", `.release-map-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  try {
    await fixture(root);
    await put(
      root,
      "scripts/lib/release-packages.mjs",
      `export const releasePackages = [
      {id:"lib",name:"@acme/lib",directory:"packages/lib"},
      {id:"lib",name:"@acme/other",directory:"packages/lib"}
    ];`,
    );
    const files = new Files(root, new AbortController().signal);
    await files.scan();
    const issues: string[] = [];
    await mappingEvidence(
      files,
      [
        {
          directory: "packages/lib",
          manifest: { name: "@acme/lib" },
          sources: [],
          tests: [],
        },
      ],
      (_status, brief) => {
        issues.push(brief);
      },
    );
    expect(issues).toEqual([
      "scripts/lib/release-packages.mjs: 旧交付来源须迁移到 silvermoon.yaml；不回退或并行选择",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("binds exact-HEAD main-push verifier arguments to the real versioned CI aggregate and rejects drift", async () => {
  const root = resolve("dist", `.release-ci-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  try {
    await fixture(root);
    await put(root, "package.json", {
      ...manifest,
      devDependencies: {
        ...manifest.devDependencies,
        "github-ci-verify": "^0.1.0",
      },
    });
    const files = new Files(root, new AbortController().signal);
    await files.scan();
    const ci = {
      path: ".github/workflows/ci.yaml",
      workflow: {
        on: { push: { branches: ["main"] } },
        jobs: {
          check: {
            steps: [
              { uses: "actions/checkout@v7" },
              { run: "pnpm install --frozen-lockfile" },
              { run: "pnpm check" },
            ],
          },
          aggregate: {
            name: "Release verification (v2)",
            needs: "check",
            if: "always()",
            steps: [
              {
                name: "Confirm required checks succeeded",
                env: { CHECK_RESULT: "${{ needs.check.result }}" },
                run: 'if [ "$CHECK_RESULT" != success ]; then\necho "::error::Every required validation job must succeed; received $CHECK_RESULT."\nexit 1\nfi',
              },
            ],
          },
        },
      },
    };
    const publish = {
      path: ".github/workflows/publish.yaml",
      workflow: {
        jobs: {
          publish: {
            steps: [
              {
                run: 'pnpm exec github-ci-verify --sha "$(git rev-parse HEAD)" --branch main --workflow ci.yaml --job-name "Release verification (v2)" --step-name "Confirm required checks succeeded" --json --summary',
              },
            ],
          },
        },
      },
    };
    const problems: string[] = [];
    await ciReuseEvidence(files, [ci, publish], (_status, brief) => {
      problems.push(brief);
    });
    expect(problems).toEqual([]);
    publish.workflow.jobs.publish.steps[0]!.run =
      publish.workflow.jobs.publish.steps[0]!.run.replace("(v2)", "(v1)");
    await ciReuseEvidence(files, [ci, publish], (_status, brief) => {
      problems.push(brief);
    });
    expect(problems.some((p) => p.includes("版本化标识"))).toBe(true);
    problems.length = 0;
    publish.workflow.jobs.publish.steps[0]!.run =
      publish.workflow.jobs.publish.steps[0]!.run.replace(
        "$(git rev-parse HEAD)",
        "0123456789012345678901234567890123456789",
      );
    await ciReuseEvidence(files, [ci, publish], (_status, brief) => {
      problems.push(brief);
    });
    expect(problems.some((p) => p.includes("任意固定 SHA"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
