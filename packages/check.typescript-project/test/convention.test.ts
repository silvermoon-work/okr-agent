import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { inspect } from "../src/inspect.js";
import type { InspectionEvidence } from "../src/convention.js";
import type { ProblemCode } from "../src/contract.js";
import { catalog, fixture, manifest, put, testEvidence } from "./fixture.js";
import { packageFacts } from "./metadata-fixture.js";
import { dataYaml, record } from "../src/files.js";
import { stringify } from "yaml";

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
async function peerLock(peer: string, version: string) {
  const lock = dataYaml(await readFile(join(root, "pnpm-lock.yaml"), "utf8"));
  const importer = record(record(lock.importers)["."]);
  const dependencies = record(importer.devDependencies);
  const ref = `5.0.4(${peer}@${version})`;
  record(dependencies.vitest).version = ref;
  const packages = {
    "vitest@5.0.4": { resolution: { integrity: "sha512-test-vitest" } },
    [`${peer}@${version}`]: { resolution: { integrity: "sha512-test-peer" } },
  };
  const snapshots = {
    [`vitest@${ref}`]: { dependencies: { [peer]: version } },
    [`${peer}@${version}`]: {},
  };
  lock.packages = packages;
  lock.snapshots = snapshots;
  await put(root, "pnpm-lock.yaml", stringify(lock));
  return { lock, packages, snapshots, ref };
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
it("recognizes an explicitly bundled exact standard asset without exempting modified or ordinary nested guidance", async () => {
  const canonical = Buffer.from(evidence.agents).toString("utf8");
  await put(root, "assets/AGENTS.md", canonical);
  await put(root, "check.build.yaml", {
    include: [{ from: "assets/**", to: "resources/assets/" }],
  });
  expect(await check()).toEqual([]);
  await put(root, "assets/AGENTS.md", `${canonical}\ncustom\n`);
  expect((await check()).map((p) => p.code)).toEqual(["document-unconfirmed"]);
  await put(root, "assets/AGENTS.md", canonical);
  await put(root, "src/AGENTS.md", canonical);
  const problems = await check();
  expect(problems.map((p) => p.code)).toEqual(["document-unconfirmed"]);
  expect(problems[0]?.brief).toContain("src/AGENTS.md");
});
it("ignores freely added development and runtime dependencies without querying their metadata", async () => {
  const queried: string[] = [];
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => {
    queried.push(name);
    return provider(name, selection);
  };
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  for (const name of ["a", "b"]) {
    const member = join(root, "packages", name);
    await fixture(member);
    await put(member, "package.json", {
      ...manifest,
      name,
      devDependencies: {
        "custom-tool": "1.0.0-rc.2",
        "@private/tool": "file:./tool",
        ...manifest.devDependencies,
      },
      dependencies: { semver: "7.0.0", "@private/runtime": "latest" },
    });
  }
  const lock = dataYaml(await readFile(join(root, "pnpm-lock.yaml"), "utf8"));
  const importers = record(lock.importers);
  for (const name of ["a", "b"])
    importers[`packages/${name}`] = structuredClone(importers["."]);
  await put(root, "pnpm-lock.yaml", stringify(lock));
  expect(
    (await check()).filter((p) => p.code.startsWith("dependency-")),
  ).toEqual([]);
  expect(queried).not.toContain("custom-tool");
  expect(queried).not.toContain("@private/tool");
  expect(queried).not.toContain("@private/runtime");
  expect(queried).not.toContain("semver");
});
it("reports an incomplete existing ID mapping without treating a private non-code member as a release target", async () => {
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  await put(root, "package.json", {
    ...manifest,
    private: false,
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
  });
  await put(root, "packages/core/package.json", {
    name: "@acme/core",
    private: true,
  });
  await put(
    root,
    "scripts/lib/release-packages.mjs",
    'export const releasePackages = [{id:"core",name:"@acme/core",directory:"packages/core"}];',
  );
  const problems = await check();
  expect(problems.some((p) => p.brief.includes("目录/name"))).toBe(false);
  expect(problems).toContainEqual(
    expect.objectContaining({
      code: "release-unconfirmed",
      brief: expect.stringContaining("#single-package") as unknown,
    }),
  );
  expect(problems.some((p) => p.brief.includes("尚未支持的门卫包括"))).toBe(
    false,
  );
});
it("rejects direct publication precisely instead of speculating about custom guard internals", async () => {
  await put(root, "package.json", {
    ...manifest,
    private: false,
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
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
    environment: npm
    permissions:
      id-token: write
    steps:
      - name: Publish
        run: npm publish artifact.tgz --tag "$DIST_TAG"
      - name: Dry run
        run: npm publish artifact.tgz --dry-run --tag oidc-dry-run
`,
  );
  const release = (await check()).filter((p) => p.code.startsWith("release-"));
  const mismatch = release.filter((p) => p.code === "release-mismatch");
  expect(mismatch).toHaveLength(1);
  expect(mismatch[0]?.brief).toContain("Dry run");
  expect(mismatch[0]?.brief).toContain("oidc-dry-run");
  expect(
    release.some(
      (p) =>
        p.code === "release-missing" && p.brief.includes("release.config.json"),
    ),
  ).toBe(false);
});
it("reports unequal monorepo consumer minimums before derived matrix differences", async () => {
  await put(root, ".nvmrc", "22.15.0");
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  await rm(join(root, "src"), { recursive: true });
  await rm(join(root, "test"), { recursive: true });
  for (const [name, range] of [
    ["sdk", ">=22.13"],
    ["builder", ">=22.15.0"],
  ])
    await put(root, `packages/${name}/package.json`, {
      name,
      private: false,
      engines: { node: range },
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
    });
  await put(root, "packages/sdk/src/index.ts", "export {};");
  await put(root, "packages/builder/src/index.ts", "export {};");
  const workflow = dataYaml(new TextDecoder().decode(evidence.ciWorkflow));
  record(record(record(record(workflow.jobs).compatibility).strategy).matrix)[
    "node-version"
  ] = ["22.15.0", "24.11.0"];
  await put(root, ".github/workflows/ci.yaml", workflow);
  const problems = await check();
  const environment = problems.filter(
    (problem) =>
      problem.code === "environment-mismatch" &&
      problem.brief.includes("最低受支持 Node 必须一致"),
  );
  expect(environment).toHaveLength(1);
  expect(environment[0]?.brief).toContain(
    '{"manifest":"packages/builder/package.json","range":">=22.15.0","minVersion":"22.15.0"}',
  );
  expect(environment[0]?.brief).toContain(
    '{"manifest":"packages/sdk/package.json","range":">=22.13","minVersion":"22.13.0"}',
  );
  const ci = problems.filter((problem) => problem.code === "ci-mismatch");
  expect(ci).toEqual([]);
  expect(
    problems.some((problem) =>
      problem.brief.includes(".nvmrc 与根 .node-version 不一致"),
    ),
  ).toBe(true);
  expect(ci.some((problem) => problem.brief.includes("固定发布绑定"))).toBe(
    false,
  );
  record(record(workflow.jobs).check).permissions = { contents: "write" };
  await put(root, ".github/workflows/ci.yaml", workflow);
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "ci-mismatch",
      brief: expect.stringContaining("jobs.check.permissions") as unknown,
    }),
  );
});
it.each([">=22", ">=22.15.0"])(
  "compares private code packages while excluding empty aggregate manifests: %s",
  async (range) => {
    await put(root, "pnpm-workspace.yaml", {
      packages: ["packages/*"],
      catalog,
    });
    await rm(join(root, "src"), { recursive: true });
    await rm(join(root, "test"), { recursive: true });
    await put(root, "package.json", { ...manifest, engines: { node: ">=18" } });
    for (const [name, node] of [
      ["a", ">=22"],
      ["b", range],
    ])
      await put(root, `packages/${name}/package.json`, {
        name,
        private: true,
        engines: { node },
      });
    await put(root, "packages/a/src/index.ts", "export {};");
    await put(root, "packages/b/src/index.ts", "export {};");
    await put(root, "packages/aggregate/package.json", {
      name: "aggregate",
      private: true,
      engines: { node: ">=16" },
    });
    const problems = (await check()).filter((p) =>
      p.code.startsWith("environment-"),
    );
    if (range === ">=22") expect(problems).toEqual([]);
    else {
      expect(problems).toHaveLength(1);
      expect(problems[0]?.brief).toContain("packages/a/package.json");
      expect(problems[0]?.brief).toContain("packages/b/package.json");
      expect(problems[0]?.brief).not.toContain("aggregate/package.json");
    }
  },
);
it("accepts different ranges with equal parsed minimums, including private code", async () => {
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  await put(root, "packages/member/package.json", {
    name: "member",
    private: true,
    engines: { node: "^22.0.0 || >=24" },
  });
  await put(root, "packages/member/src/index.ts", "export {};");
  expect(
    (await check()).filter((p) => p.code.startsWith("environment-")),
  ).toEqual([]);
});
it("reports each missing or invalid engine without derived minimum or matrix failures", async () => {
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  for (const [name, node] of [
    ["missing", undefined],
    ["invalid", "not-semver"],
    ["empty", "<0.0.0"],
    ["malformed", undefined],
  ]) {
    await put(root, `packages/${name}/package.json`, {
      name,
      private: false,
      engines: name === "malformed" ? [] : { node },
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
    });
    await put(root, `packages/${name}/src/index.ts`, "export {};");
  }
  const problems = await check();
  const environment = problems.filter((p) => p.code.startsWith("environment-"));
  expect(environment.map((p) => p.code).sort()).toEqual([
    "environment-missing",
    "environment-unconfirmed",
    "environment-unconfirmed",
    "environment-unconfirmed",
  ]);
  expect(environment.map((p) => p.brief).join("\n")).toContain(
    "packages/missing/package.json",
  );
  expect(environment.map((p) => p.brief).join("\n")).toContain(
    'engines.node="not-semver"',
  );
  expect(environment.map((p) => p.brief).join("\n")).toContain(
    'engines.node="<0.0.0"',
  );
  expect(environment.map((p) => p.brief).join("\n")).toContain(
    "packages/malformed/package.json: engines=[]",
  );
  expect(problems.some((p) => p.code.startsWith("ci-"))).toBe(false);
  expect(problems.some((p) => p.code.startsWith("release-"))).toBe(true);
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
  await put(root, "pnpm-workspace.yaml", { catalog });
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
  await peerLock("typescript", "6.0.3");
  const mismatch = (await check()).filter(
    (p) => p.code === "dependency-mismatch",
  );
  expect(mismatch.some((p) => p.brief.includes("engines.node"))).toBe(true);
  expect(mismatch.some((p) => p.brief.includes("peer typescript"))).toBe(true);
});
it("requires catalog references even for single packages and resolves named catalogs with the exact importer", async () => {
  await put(root, "package.json", {
    ...manifest,
    devDependencies: { ...manifest.devDependencies, typescript: "^6.0.3" },
  });
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "dependency-mismatch",
      brief: expect.stringContaining("typescript 必须引用根") as unknown,
    }),
  );
  await put(root, "package.json", {
    ...manifest,
    devDependencies: {
      ...manifest.devDependencies,
      typescript: "catalog:compiler",
    },
  });
  await put(root, "pnpm-workspace.yaml", {
    catalog,
    catalogs: { compiler: { typescript: "^6.0.3" } },
  });
  const lock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  await put(
    root,
    "pnpm-lock.yaml",
    lock.replace(
      "'typescript':\n        specifier: 'catalog:'",
      "'typescript':\n        specifier: 'catalog:compiler'",
    ),
  );
  expect(await check()).toEqual([]);
  await put(root, "pnpm-lock.yaml", lock);
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "dependency-mismatch",
      brief: expect.stringContaining(
        "specifier != catalog:compiler",
      ) as unknown,
    }),
  );
  await put(root, "pnpm-workspace.yaml", { catalog });
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "dependency-unconfirmed",
      brief: expect.stringContaining(
        "typescript: catalog 无对应版本声明",
      ) as unknown,
    }),
  );
  await rm(join(root, "pnpm-workspace.yaml"));
  expect(
    (await check()).some((p) => p.brief.includes("catalog 无对应版本声明")),
  ).toBe(true);
});
it("preserves internal workspace protocols without querying internal tools as public packages", async () => {
  await put(root, "pnpm-workspace.yaml", { packages: ["packages/*"], catalog });
  await put(root, "packages/internal/package.json", {
    name: "@private/internal",
    private: true,
  });
  await put(root, "package.json", {
    ...manifest,
    devDependencies: {
      ...manifest.devDependencies,
      "@private/internal": "workspace:*",
    },
  });
  expect(
    (await check()).filter((p) => p.code.startsWith("dependency-")),
  ).toEqual([]);
  await put(root, "package.json", {
    ...manifest,
    devDependencies: {
      ...manifest.devDependencies,
      "@private/missing": "workspace:*",
    },
  });
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "dependency-mismatch",
      brief: expect.stringContaining("workspace 引用无对应成员") as unknown,
    }),
  );
});
it("still requires evidence for an unknown peer of a prescribed tool, not arbitrary development dependencies", async () => {
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => {
    const observed = await provider(name, selection);
    return name === "vitest"
      ? {
          ...observed,
          data: packageFacts({
            "5.0.4": {
              version: "5.0.4",
              peerDependencies: { "custom-peer": "^1.0.0" },
            },
          }),
        }
      : observed;
  };
  await put(root, "package.json", {
    ...manifest,
    devDependencies: { ...manifest.devDependencies, "custom-peer": "1.0.0" },
  });
  await peerLock("custom-peer", "1.0.0");
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "dependency-unconfirmed",
      brief: expect.stringContaining(
        "已解析 peer custom-peer 尚无公开元数据支持",
      ) as unknown,
    }),
  );
});
it.each([false, true])(
  "uses the selected snapshot for required/optional auto-installed Vite, not another importer: optional=%s",
  async (optional) => {
    const provider = evidence.metadata.package;
    evidence.metadata.package = async (name, selection) => {
      const observed = await provider(name, selection);
      return name === "vitest"
        ? {
            ...observed,
            data: packageFacts({
              "5.0.4": {
                version: "5.0.4",
                peerDependencies: { vite: "^8" },
                peerDependenciesMeta: { vite: { optional } },
              },
            }),
          }
        : observed;
    };
    await peerLock("vite", "8.3.4");
    expect(await check()).toEqual([]);
    const { lock, snapshots } = await peerLock("vite", "7.0.0");
    record(lock.importers)["unrelated"] = {
      devDependencies: { vite: { specifier: "^8", version: "8.3.4" } },
    };
    record(lock.packages)["vite@8.3.4"] = {
      resolution: { integrity: "sha512-unrelated" },
    };
    snapshots["vite@8.3.4"] = {};
    await put(root, "pnpm-lock.yaml", stringify(lock));
    expect(await check()).toContainEqual(
      expect.objectContaining({
        code: "dependency-mismatch",
        brief: expect.stringContaining("peer vite@7.0.0 不满足 ^8") as unknown,
      }),
    );
    delete snapshots["vitest@5.0.4(vite@7.0.0)"];
    snapshots["vitest@5.0.4(vite@8.3.4)"] = {
      dependencies: { vite: "8.3.4" },
    };
    await put(root, "pnpm-lock.yaml", stringify(lock));
    expect((await check()).map((p) => p.code)).toContain(
      "dependency-unconfirmed",
    );
  },
);
it("checks actual auto-installed Vite Node compatibility without requiring a direct declaration", async () => {
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => {
    const observed = await provider(name, selection);
    if (name === "vitest")
      return {
        ...observed,
        data: packageFacts({
          "5.0.4": { version: "5.0.4", peerDependencies: { vite: "^8" } },
        }),
      };
    if (name === "vite")
      return {
        ...observed,
        data: packageFacts({
          "8.3.4": { version: "8.3.4", engines: { node: ">=28" } },
        }),
      };
    return observed;
  };
  await peerLock("vite", "8.3.4");
  expect(await check()).toContainEqual(
    expect.objectContaining({
      code: "dependency-mismatch",
      brief: expect.stringContaining("peer vite@8.3.4 engines.node") as unknown,
    }),
  );
});
it("accepts cached tool metadata without a fixed observation age limit", async () => {
  const provider = evidence.metadata.package;
  evidence.metadata.package = async (name, selection) => ({
    ...(await provider(name, selection)),
    observedAt: Date.now() - 86_400_000,
  });
  expect(await check()).toEqual([]);
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
        publint: "catalog:",
      },
    });
    await put(root, "pnpm-workspace.yaml", {
      catalog: { ...catalog, publint: declaration },
    });
    await put(
      root,
      "pnpm-lock.yaml",
      `${lock}      publint:\n        specifier: 'catalog:'\n        version: '${version}'\n`,
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
      - uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
      - uses: pnpm/action-setup@v6
      - run: pnpm check
`,
  );
  expect((await check()).map((p) => p.code)).toContain("ci-mismatch");
});
it("rejects known unsafe release configuration without accepting guard keywords as semantics", async () => {
  await put(root, "package.json", {
    ...manifest,
    private: false,
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
  expect(
    problems.some(
      (problem) =>
        problem.code === "release-missing" &&
        problem.brief.includes("release.config.json"),
    ),
  ).toBe(false);
});
