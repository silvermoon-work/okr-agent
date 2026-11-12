import { expect, it } from "vitest";

interface Publisher {
  configuration(value: unknown): unknown;
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
}
// Only the author-owned reviewed asset is imported. A target copy is never loaded.
const path = new URL("../assets/npm-publish.mjs", import.meta.url).href;
const publisher = (await import(path)) as unknown as Publisher;
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
    { conclusion: "failure" },
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
  expect(() => {
    publisher.successfulJobs(
      jobs.map((j, i) => (i === 1 ? { ...j, conclusion: "skipped" } : j)),
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
