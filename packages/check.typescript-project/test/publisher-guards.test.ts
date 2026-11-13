import { afterEach, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface Publisher {
  configuration(value: unknown): unknown;
  releaseMappings(source: string): unknown[];
  workflowMatrix(source: string): string[];
  resolveConfiguration(
    projects: unknown[],
    mappings: unknown[],
    nodes: string[],
    event: string,
    ref?: string,
    input?: string,
  ): unknown;
  releaseIdentity(
    config: unknown,
    manifest: unknown,
    event: string,
    ref?: string,
    input?: string,
  ): { name: string; version: string; channel: string };
  unpublished(release: unknown, metadata: unknown): void;
  artifactIdentity(release: unknown, manifest: unknown): void;
  successfulRun(run: unknown, sha: string): void;
  successfulJobs(jobs: unknown[], nodes: string[]): void;
  verifyCi(config: unknown, sha: string): Promise<void>;
  publicationMode(mode: string, event: string): boolean;
  publicationPlan(
    config: unknown,
    projects: unknown[],
  ): { directory: string; build: string[]; pack: string[] };
  verifiedTarball(tarball: string, digest: string): void;
}
// Only the author-owned reviewed asset is imported. A target copy is never loaded.
const path = new URL("../assets/npm-publish.mjs", import.meta.url).href;
const publisher = (await import(path)) as unknown as Publisher;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const config = {
  schemaVersion: 1,
  package: { id: "library", name: "@acme/library", directory: "." },
  ci: { nodeVersions: ["22.15.0", "24.11.0"] },
};
const manifest = {
  name: "@acme/library",
  version: "1.2.0-rc.0",
  publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
};
it("derives a unique single target without a release description and binds workspace selection to existing mapping and actual CI", async () => {
  expect(
    publisher.resolveConfiguration(
      [{ directory: ".", manifest }],
      [],
      config.ci.nodeVersions,
      "push",
      "library-v1.2.0-rc.0",
    ),
  ).toEqual(config);
  const projects = [
    { directory: ".", manifest: { name: "root", private: true } },
    { directory: "packages/library", manifest },
  ];
  const nodes = publisher.workflowMatrix(
    await readFile(new URL("../assets/npm-ci.yaml", import.meta.url), "utf8"),
  );
  expect(
    publisher.resolveConfiguration(
      projects,
      [],
      nodes,
      "push",
      "library-v1.2.0-rc.0",
    ),
  ).toEqual({
    ...config,
    package: { ...config.package, directory: "packages/library" },
  });
  const mappings = publisher.releaseMappings(
    'export const releasePackages = [{id:"lib",name:"@acme/library",directory:"packages/library"}, {id:"core",name:"@acme/core",directory:"packages/core"}];',
  );
  projects.push({
    directory: "packages/core",
    manifest: { ...manifest, name: "@acme/core" },
  });
  expect(() =>
    publisher.resolveConfiguration(
      projects,
      [],
      nodes,
      "workflow_dispatch",
      undefined,
      "library",
    ),
  ).toThrow("Multiple");
  expect(
    publisher.resolveConfiguration(
      projects,
      mappings,
      nodes,
      "workflow_dispatch",
      undefined,
      "lib",
    ),
  ).toEqual({
    ...config,
    package: { id: "lib", name: manifest.name, directory: "packages/library" },
  });
  for (const input of ["", "all", "lib,core"])
    expect(() =>
      publisher.resolveConfiguration(
        projects,
        mappings,
        nodes,
        "workflow_dispatch",
        undefined,
        input,
      ),
    ).toThrow("exactly one");
  expect(() =>
    publisher.resolveConfiguration(
      projects,
      mappings,
      nodes,
      "push",
      "lib-v9.0.0",
    ),
  ).toThrow("exactly one");
  expect(() =>
    publisher.resolveConfiguration(
      projects,
      [...mappings, mappings[0]],
      nodes,
      "push",
      "lib-v1.2.0-rc.0",
    ),
  ).toThrow("Ambiguous");
  expect(() => publisher.workflowMatrix("jobs: {}")).toThrow("structure");
  expect(() =>
    publisher.releaseMappings("export const releasePackages = getPackages();"),
  ).toThrow("static array");
});
it("blocks a changed tarball instead of publishing a different artifact after verification", async () => {
  const root = resolve("dist", `.tarball-${randomUUID()}`);
  const tarball = resolve(root, "package.tgz");
  await mkdir(root, { recursive: true });
  try {
    await writeFile(tarball, "verified");
    const digest = createHash("sha256").update("verified").digest("hex");
    expect(() => {
      publisher.verifiedTarball(tarball, digest);
    }).not.toThrow();
    await writeFile(tarball, "changed");
    expect(() => {
      publisher.verifiedTarball(tarball, digest);
    }).toThrow("Tarball changed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("adapts a single mapped root/member to one pack while workspace builds may include dependencies", () => {
  expect(
    publisher.publicationPlan(config, [{ directory: ".", manifest }]),
  ).toEqual({
    directory: ".",
    build: ["run", "build"],
    pack: ["--dir", ".", "--config.ignore-scripts=true", "pack", "--out"],
  });
  const memberConfig = {
    ...config,
    package: { ...config.package, directory: "packages/library" },
  };
  expect(publisher.configuration(memberConfig)).toEqual(memberConfig);
  const projects = [
    { directory: ".", manifest: { name: "root", private: true } },
    { directory: "packages/library", manifest },
    { directory: "packages/core", manifest: { name: "@acme/core" } },
  ];
  const plan = publisher.publicationPlan(memberConfig, projects);
  expect(plan.build).toEqual(["--filter", "@acme/library...", "run", "build"]);
  expect(plan.pack).toEqual([
    "--dir",
    "packages/library",
    "--config.ignore-scripts=true",
    "pack",
    "--out",
  ]);
  expect(plan.pack.join(" ")).not.toContain("--recursive");
  expect(() => publisher.publicationPlan(config, projects)).toThrow("unique");
  expect(() => publisher.publicationPlan(memberConfig, [projects[0]])).toThrow(
    "unique",
  );
  expect(() =>
    publisher.configuration({
      ...memberConfig,
      package: { ...memberConfig.package, directory: "../library" },
    }),
  ).toThrow("directory");
});
function history(versions: string[]) {
  return {
    name: manifest.name,
    versions: Object.fromEntries(versions.map((v) => [v, {}])),
    time: {
      created: "2026-01-01",
      modified: "2026-01-01",
      ...Object.fromEntries(versions.map((v) => [v, "2026-01-01"])),
    },
  };
}
it("binds stable/rc channels to exact tag/package/version, private rejection and dry-run identity", () => {
  expect(publisher.publicationMode("release", "push")).toBe(false);
  expect(
    publisher.publicationMode("release-dry-run", "workflow_dispatch"),
  ).toBe(true);
  expect(() =>
    publisher.publicationMode("release", "workflow_dispatch"),
  ).toThrow("manual dispatch");
  expect(() => publisher.publicationMode("release-dry-run", "push")).toThrow(
    "tag push",
  );
  expect(publisher.configuration(config)).toEqual(config);
  expect(
    publisher.releaseIdentity(
      config,
      manifest,
      "workflow_dispatch",
      undefined,
      "library",
    ).channel,
  ).toBe("rc");
  expect(
    publisher.releaseIdentity(
      config,
      { ...manifest, version: "1.2.0" },
      "push",
      "library-v1.2.0",
    ).channel,
  ).toBe("latest");
  expect(() =>
    publisher.releaseIdentity(
      config,
      { ...manifest, private: true },
      "push",
      "library-v1.2.0-rc.0",
    ),
  ).toThrow("private");
  expect(() =>
    publisher.releaseIdentity(config, manifest, "push", "library-v1.2.0"),
  ).toThrow("Tag");
  expect(() =>
    publisher.releaseIdentity(
      config,
      { ...manifest, version: "1.2.0-beta.0" },
      "push",
      "library-v1.2.0-beta.0",
    ),
  ).toThrow("canonical");
  expect(() => {
    publisher.artifactIdentity(manifest, { ...manifest, version: "1.2.0" });
  }).toThrow("Packed");
});
it("requires RC history to start at zero and advance exactly once, refusing existing or incomplete history", () => {
  expect(() => {
    publisher.unpublished(manifest, null);
  }).not.toThrow();
  const next = { ...manifest, version: "1.2.0-rc.1" };
  expect(() => {
    publisher.unpublished(next, null);
  }).toThrow("First RC");
  expect(() => {
    publisher.unpublished(next, history(["1.2.0-rc.0"]));
  }).not.toThrow();
  expect(() => {
    publisher.unpublished(next, history(["1.2.0-rc.1"]));
  }).toThrow("exists");
  expect(() => {
    publisher.unpublished(
      { ...manifest, version: "1.2.0-rc.3" },
      history(["1.2.0-rc.0", "1.2.0-rc.2"]),
    );
  }).toThrow("contiguous");
  expect(() => {
    publisher.unpublished(next, { name: manifest.name, versions: {} });
  }).toThrow("Expected an object");
  expect(() => {
    publisher.unpublished(next, {
      ...history(["1.2.0-rc.0"]),
      time: {
        ...history(["1.2.0-rc.0"]).time,
        unpublished: { versions: ["1.2.0-rc.1"] },
      },
    });
  }).toThrow("incomplete");
});
it("does not substitute PR, other SHA, failed/skipped matrix or empty aggregate for exact successful main push CI", () => {
  const sha = "0123456789012345678901234567890123456789";
  const run = {
    head_sha: sha,
    head_branch: "main",
    event: "push",
    path: ".github/workflows/ci.yaml",
    status: "completed",
    conclusion: "success",
    id: 1,
    run_attempt: 1,
  };
  expect(() => {
    publisher.successfulRun(run, sha);
  }).not.toThrow();
  for (const change of [
    { event: "pull_request" },
    { head_sha: "f".repeat(40) },
    { head_branch: "other" },
    { path: ".github/workflows/other.yaml" },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { conclusion: "skipped" },
    { status: "in_progress", conclusion: null },
  ])
    expect(() => {
      publisher.successfulRun({ ...run, ...change }, sha);
    }).toThrow("exact-commit");
  const nodes = ["22.15.0", "24.11.0"];
  const jobs = [
    "Quality default",
    ...nodes.map((v) => `Node.js ${v}`),
    "Release verification (v1)",
  ].map((name) => ({
    name,
    status: "completed",
    conclusion: "success",
    steps: [
      {
        name: "Confirm required checks succeeded",
        status: "completed",
        conclusion: "success",
      },
    ],
  }));
  expect(() => {
    publisher.successfulJobs(jobs, nodes);
  }).not.toThrow();
  expect(() => {
    publisher.successfulJobs(jobs.slice(1), nodes);
  }).toThrow("incomplete");
  for (const change of [
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { conclusion: "skipped" },
    { status: "in_progress", conclusion: null },
  ])
    expect(() => {
      publisher.successfulJobs(
        jobs.map((j, i) => (i === 1 ? { ...j, ...change } : j)),
        nodes,
      );
    }).toThrow("unsuccessful");
  expect(() => {
    publisher.successfulJobs(
      jobs.map((j) => ({ ...j, steps: [] })),
      nodes,
    );
  }).toThrow("aggregate");
});
it("reuses exact full-SHA successful main-push evidence through the fixed API without dispatching replacement CI", async () => {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  const sha = "0123456789012345678901234567890123456789";
  const run = {
    head_sha: sha,
    head_branch: "main",
    event: "push",
    path: ".github/workflows/ci.yaml",
    status: "completed",
    conclusion: "success",
    id: 7,
    run_attempt: 2,
  };
  const jobs = [
    "Quality default",
    ...config.ci.nodeVersions.map((node) => `Node.js ${node}`),
    "Release verification (v1)",
  ].map((name) => ({
    name,
    status: "completed",
    conclusion: "success",
    steps: [
      {
        name: "Confirm required checks succeeded",
        status: "completed",
        conclusion: "success",
      },
    ],
  }));
  vi.stubEnv("GITHUB_REPOSITORY", "acme/library");
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    (url) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.includes("/jobs?")
              ? { total_count: jobs.length, jobs }
              : url.includes("/workflows/")
                ? { total_count: 1, workflow_runs: [run] }
                : run,
          ),
          { headers: { date: new Date(now).toUTCString() } },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(publisher.verifyCi(config, sha)).resolves.toBeUndefined();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    `https://api.github.com/repos/acme/library/actions/workflows/ci.yaml/runs?event=push&branch=main&head_sha=${sha}&per_page=100`,
    "https://api.github.com/repos/acme/library/actions/runs/7",
    "https://api.github.com/repos/acme/library/actions/runs/7/attempts/2/jobs?per_page=100",
    "https://api.github.com/repos/acme/library/actions/runs/7",
  ]);
  expect(
    fetch.mock.calls.every(
      ([, options]) => !options?.method || options.method === "GET",
    ),
  ).toBe(true);
  fetch.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          total_count: 0,
          workflow_runs: [],
        }),
        { headers: { date: new Date(now).toUTCString() } },
      ),
    ),
  );
  await expect(publisher.verifyCi(config, sha)).rejects.toThrow(
    "CI history incomplete",
  );
  fetch.mockRejectedValue(new Error("API unavailable"));
  await expect(publisher.verifyCi(config, sha)).rejects.toThrow(
    "API unavailable",
  );
});
it("keeps the fixed release path free of pnpm check while preserving tag dereference, build and single artifact guards", async () => {
  const source = await readFile(
    new URL("../assets/npm-publish.mjs", import.meta.url),
    "utf8",
  );
  const workflow = await readFile(
    new URL("../assets/npm-publish.yaml", import.meta.url),
    "utf8",
  );
  expect(workflow).not.toContain("pnpm check");
  const publish = source.slice(
    source.indexOf("export async function publish("),
  );
  expect(publish).not.toContain('["check"]');
  expect(publish).toContain("}^{commit}");
  expect(publish.indexOf("await verifyCi(config, sha)")).toBeLessThan(
    publish.indexOf('command("pnpm", plan.build)'),
  );
});
