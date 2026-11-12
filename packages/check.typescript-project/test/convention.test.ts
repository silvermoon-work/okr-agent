import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { inspect } from "../src/inspect.js";
import type { InspectionEvidence } from "../src/convention.js";
import type { ProblemCode } from "../src/contract.js";
import { fixture, manifest, put, testEvidence } from "./fixture.js";
import { packageFacts } from "./metadata-fixture.js";

let root: string;
let evidence: InspectionEvidence;
beforeEach(async () => {
  root = resolve("dist", `.convention-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  await fixture(root);
  evidence = await testEvidence();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function check() {
  const problems: { code: ProblemCode; brief: string }[] = [];
  await inspect(
    { projectDirectory: root },
    new AbortController().signal,
    (code, brief) => problems.push({ code, brief }),
    evidence,
  );
  return problems;
}
it("compares the entire bundled text with only LF normalization and protects arbitrary free documents", async () => {
  const canonical = Buffer.from(evidence.agents).toString("utf8");
  await put(root, "AGENTS.md", canonical.replace(/\n/g, "\r\n"));
  await put(root, "docs/agent-project.md", "任意正文，不含任何标准关键词");
  await put(root, "README.md", "自由");
  await put(root, "CONTRIBUTING.md", "自由");
  expect(await check()).toEqual([]);
  await put(root, "AGENTS.md", `${canonical}\ncustom instruction\n`);
  expect(await check()).toContainEqual(
    expect.objectContaining({ code: "document-mismatch" }),
  );
  await put(root, "AGENTS.md", canonical.trimEnd());
  expect(await check()).toContainEqual(
    expect.objectContaining({ code: "document-mismatch" }),
  );
  await rm(join(root, "AGENTS.md"));
  expect(await check()).toContainEqual(
    expect.objectContaining({ code: "document-missing" }),
  );
});
it("requires the free extension and does not silently ignore nested Agent overrides", async () => {
  await rm(join(root, "docs", "agent-project.md"));
  await put(root, "src/AGENTS.md", "custom");
  const codes = (await check()).map((p) => p.code);
  expect(codes).toContain("document-missing");
  expect(codes).toContain("document-unconfirmed");
});
it("uses official lifecycle and exact release LTS status, not an even major or minimum", async () => {
  const provider = evidence.metadata.node;
  evidence.metadata.node = async () => {
    const observed = await provider();
    return {
      ...observed,
      data: {
        ...observed.data,
        releases: [{ version: "v24.11.0", lts: false }],
      },
    };
  };
  expect((await check()).map((p) => p.code)).toContain("environment-mismatch");
  evidence.metadata.node = async () => {
    const observed = await provider();
    return {
      ...observed,
      data: {
        ...observed.data,
        schedule: { v24: { lts: "2025-01-01", end: "2026-01-01" } },
      },
    };
  };
  expect((await check()).map((p) => p.code)).toContain("environment-mismatch");
});
it("separates package runtime engines from the default developer Node", async () => {
  await put(root, "package.json", { ...manifest, engines: { node: ">=18" } });
  expect(await check()).toEqual([]);
  await put(root, ".nvmrc", "22.0.0");
  expect((await check()).map((p) => p.code)).toContain("environment-mismatch");
});
it("checks actual importer rather than a newer snapshot or unrelated member", async () => {
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => {
    const observed = await provider(name, selection);
    return name === "typescript"
      ? {
          ...observed,
          data: packageFacts({
            ...observed.data.releases,
            "6.0.4": { version: "6.0.4" },
          }),
        }
      : observed;
  };
  const lock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  await put(
    root,
    "pnpm-lock.yaml",
    `${lock}\nsnapshots:\n  typescript@6.0.4: {}\n`,
  );
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "dependency-mismatch",
      brief: expect.stringContaining("importer 6.0.3") as unknown,
    }),
  );
  await put(
    root,
    "pnpm-lock.yaml",
    lock.replace("version: '6.0.3'", "version: '6.0.4'"),
  );
  expect(await check()).toEqual([]);
});
it("requires current same-major pnpm and does not compare against another major latest tag", async () => {
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => {
    const observed = await provider(name, selection);
    return name === "pnpm"
      ? {
          ...observed,
          data: packageFacts({
            ...observed.data.releases,
            "12.0.0": { version: "12.0.0" },
          }),
        }
      : observed;
  };
  expect(await check()).toEqual([]);
  const prior = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => {
    const observed = await prior(name, selection);
    return name === "pnpm"
      ? {
          ...observed,
          data: packageFacts({
            ...observed.data.releases,
            "11.23.0": { version: "11.23.0" },
          }),
        }
      : observed;
  };
  expect((await check()).map((p) => p.code)).toContain("dependency-mismatch");
});
it("checks catalog declaration and peer/default Node compatibility of installed tools", async () => {
  await put(root, "pnpm-workspace.yaml", 'catalog:\n  typescript: "^6.0.3"\n');
  await put(root, "package.json", {
    ...manifest,
    devDependencies: { ...manifest.devDependencies, typescript: "catalog:" },
  });
  const lock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  await put(
    root,
    "pnpm-lock.yaml",
    lock.replace("specifier: '^6.0.3'", "specifier: 'catalog:'"),
  );
  expect(await check()).toEqual([]);
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => {
    const observed = await provider(name, selection);
    return name === "vitest"
      ? {
          ...observed,
          data: packageFacts({
            "5.0.4": {
              version: "5.0.4",
              engines: { node: ">=28" },
              peerDependencies: { typescript: "^5" },
            },
          }),
        }
      : observed;
  };
  const mismatch = (await check()).filter(
    (p) => p.code === "dependency-mismatch",
  );
  expect(mismatch.some((p) => p.brief.includes("engines.node"))).toBe(true);
  expect(mismatch.some((p) => p.brief.includes("peer typescript"))).toBe(true);
});
it("treats metadata failures and expired observations as unconfirmed, never stale success", async () => {
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => ({
    ...(await provider(name, selection)),
    observedAt: Date.now() - 3_600_001,
  });
  expect((await check()).map((p) => p.code)).toContain(
    "dependency-unconfirmed",
  );
});
it("reports malformed lockfile and unsupported dependency protocols without executing or faulting", async () => {
  await put(root, "pnpm-lock.yaml", "importers: [broken");
  expect((await check()).map((p) => p.code)).toContain(
    "dependency-unconfirmed",
  );
  await fixture(root);
  await put(root, "package.json", {
    ...manifest,
    devDependencies: {
      ...manifest.devDependencies,
      typescript: "file:./untrusted",
    },
  });
  expect((await check()).map((p) => p.code)).toContain("dependency-mismatch");
});
it("follows only patches in a 0.minor series and never auto-upgrades an exact 0.0.patch", async () => {
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) =>
    name === "publint"
      ? {
          source: "https://fixture.invalid/publint",
          observedAt: Date.now(),
          authoritative: true,
          data: packageFacts({
            "0.3.25": { version: "0.3.25" },
            "0.3.26": { version: "0.3.26" },
            "0.4.0": { version: "0.4.0" },
            "0.0.5": { version: "0.0.5" },
            "0.0.6": { version: "0.0.6" },
          }),
        }
      : await provider(name, selection);
  const lock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  const select = async (declaration: string, version: string) => {
    await put(root, "package.json", {
      ...manifest,
      devDependencies: {
        ...manifest.devDependencies,
        publint: declaration,
      },
    });
    await put(
      root,
      "pnpm-lock.yaml",
      `${lock}      publint:\n        specifier: '${declaration}'\n        version: '${version}'\n`,
    );
  };
  await select("^0.3.25", "0.3.25");
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "dependency-mismatch",
      brief: expect.stringContaining("最新 0.3.26") as unknown,
    }),
  );
  await select("^0.3.25", "0.3.26");
  expect(await check()).toEqual([]);
  await select("0.0.5", "0.0.5");
  expect(await check()).toEqual([]);
  await select("^0.0.5", "0.0.5");
  expect((await check()).map((p) => p.code)).toContain("dependency-mismatch");
});
it("does not accept an unrelated safe CI job as proof of the actual check job environment", async () => {
  const { workflow } = await import("./fixture.js");
  await put(
    root,
    ".github/workflows/ci.yaml",
    workflow.replace("node-version-file: .node-version", "node-version: 24") +
      `
  decoy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
      - uses: pnpm/action-setup@v4
      - run: pnpm check
`,
  );
  expect((await check()).map((p) => p.code)).toContain("ci-mismatch");
});
it("rejects known unsafe release configuration without accepting guard keywords as semantics", async () => {
  await put(root, "package.json", {
    ...manifest,
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
    exports: { ".": { import: "./dist/index.js", types: "./dist/index.d.ts" } },
  });
  await put(
    root,
    ".github/workflows/release.yaml",
    `
on:
  push:
    tags: ["pkg-v*"]
  workflow_dispatch: {}
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - run: echo "exact SHA main push rc history single tarball Trusted Publishing"
      - run: pnpm -r publish --tag canary
`,
  );
  const problems = await check();
  expect(problems.map((p) => p.code)).toContain("release-mismatch");
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "release-unconfirmed",
      brief: expect.stringContaining("准确 SHA") as unknown,
    }),
  );
});
