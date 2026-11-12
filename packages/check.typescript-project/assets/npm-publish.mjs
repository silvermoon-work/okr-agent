import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { Buffer } from "node:buffer";
import semver from "semver";

// This program runs only in the explicitly selected GitHub publishing workflow.
// The Check reads its bytes; it never imports or executes a target's copy.
const registry = "https://registry.npmjs.org/";
const stable =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/;
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    "Expected an object",
  );
  return value;
}
function keys(value, expected) {
  assert(
    Object.keys(object(value)).sort().join() === [...expected].sort().join(),
    "Unexpected profile fields",
  );
}
export function configuration(value) {
  keys(value, ["schemaVersion", "package", "ci"]);
  assert(value.schemaVersion === 1, "Unsupported publisher profile");
  keys(value.package, ["id", "name", "directory"]);
  assert(
    typeof value.package.id === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.package.id),
    "Invalid package ID",
  );
  assert(
    typeof value.package.name === "string" &&
      packageName.test(value.package.name) &&
      !/template|your[-_]|example|^@workspace\//i.test(value.package.name),
    "Invalid package identity",
  );
  assert(
    value.package.directory === ".",
    "This profile supports one root npm package only",
  );
  keys(value.ci, ["nodeVersions"]);
  assert(
    Array.isArray(value.ci.nodeVersions) &&
      value.ci.nodeVersions.length >= 2 &&
      value.ci.nodeVersions.length <= 8 &&
      new Set(value.ci.nodeVersions).size === value.ci.nodeVersions.length &&
      value.ci.nodeVersions.every(
        (v) => semver.valid(v) === v && !semver.prerelease(v),
      ),
    "Invalid compatibility matrix",
  );
  return value;
}
export function releaseIdentity(config, manifest, event, ref, input) {
  keys(manifest.publishConfig, ["access", "registry"]);
  assert(
    ["push", "workflow_dispatch"].includes(event),
    "Unsupported release event",
  );
  assert(
    manifest.name === config.package.name &&
      (manifest.private === undefined || manifest.private === false),
    "Wrong/private package",
  );
  assert(
    typeof manifest.version === "string" &&
      stable.test(manifest.version) &&
      semver.valid(manifest.version) === manifest.version,
    "Only canonical stable and rc versions are supported",
  );
  assert(
    manifest.publishConfig?.access === "public" &&
      manifest.publishConfig.registry === registry &&
      manifest.publishConfig.directory === undefined,
    "Invalid public npm target",
  );
  if (event === "push")
    assert(
      ref === `${config.package.id}-v${manifest.version}`,
      "Tag identity/version mismatch",
    );
  else
    assert(
      input === config.package.id,
      "Manual dry run must select the mapped package",
    );
  return {
    name: manifest.name,
    version: manifest.version,
    channel: semver.prerelease(manifest.version) ? "rc" : "latest",
  };
}
export function unpublished(release, metadata) {
  if (metadata === null) {
    assert(
      !release.version.includes("-rc.") || release.version.endsWith("-rc.0"),
      "First RC must be rc.0",
    );
    return;
  }
  assert(metadata.name === release.name, "Registry identity mismatch");
  const versions = object(metadata.versions);
  const time = object(metadata.time);
  assert(
    typeof time.created === "string" &&
      typeof time.modified === "string" &&
      !time.unpublished &&
      Object.keys(versions).every((v) => typeof time[v] === "string") &&
      Object.keys(time)
        .filter((v) => semver.valid(v))
        .every((v) => Object.hasOwn(versions, v)),
    "Registry publication history incomplete",
  );
  assert(
    !Object.hasOwn(versions, release.version) &&
      !Object.hasOwn(time, release.version),
    "Version already exists",
  );
  if (!release.version.includes("-rc.")) return;
  const [base, counter] = release.version.split("-rc.");
  const prior = Object.keys(versions)
    .filter((v) => v.startsWith(`${base}-rc.`))
    .map((v) => {
      assert(stable.test(v), "Invalid RC history");
      return Number(v.slice(base.length + 4));
    })
    .sort((a, b) => a - b);
  assert(
    prior.every((n, i) => n === i) && Number(counter) === prior.length,
    "RC history must be contiguous from zero",
  );
}
export function artifactIdentity(release, manifest) {
  assert(
    manifest.name === release.name &&
      manifest.version === release.version &&
      (manifest.private === undefined || manifest.private === false),
    "Packed identity/version/private mismatch",
  );
  keys(manifest.publishConfig, ["access", "registry"]);
  assert(
    manifest.publishConfig.access === "public" &&
      manifest.publishConfig.registry === registry,
    "Packed publishing target mismatch",
  );
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ])
    for (const [name, range] of Object.entries(manifest[field] ?? {}))
      assert(
        packageName.test(name) &&
          typeof range === "string" &&
          semver.validRange(range) &&
          !/^(?:workspace|file|link|portal|npm):/.test(range),
        "Unpublishable dependency",
      );
}
export function successfulRun(run, sha) {
  assert(
    run.head_sha === sha &&
      run.head_branch === "main" &&
      run.event === "push" &&
      run.path === ".github/workflows/ci.yaml" &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      Number.isSafeInteger(run.id) &&
      Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0,
    "No successful exact-commit main-push CI",
  );
}
export function successfulJobs(jobs, nodes) {
  const expected = [
    "Quality default",
    ...nodes.map((v) => `Node.js ${v}`),
    "Release verification (v1)",
  ];
  assert(
    jobs.length === expected.length &&
      new Set(jobs.map((j) => j.name)).size === jobs.length &&
      expected.every((name) => jobs.some((j) => j.name === name)) &&
      jobs.every((j) => j.status === "completed" && j.conclusion === "success"),
    "Required CI jobs/matrix incomplete or unsuccessful",
  );
  const aggregate = jobs.find((j) => j.name === "Release verification (v1)");
  const steps = aggregate.steps.filter(
    (s) => s.name === "Confirm required checks succeeded",
  );
  assert(
    steps.length === 1 &&
      steps[0].status === "completed" &&
      steps[0].conclusion === "success",
    "CI aggregate step did not succeed",
  );
}
async function json(url, token, absent = false) {
  const response = await globalThis.fetch(url, {
    signal: globalThis.AbortSignal.timeout(10_000),
    redirect: "error",
    headers: {
      accept: token ? "application/vnd.github+json" : "application/json",
      "cache-control": "no-cache",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const age = Number(response.headers.get("age") ?? "0") * 1000;
  const date = Date.parse(response.headers.get("date") ?? "");
  assert(
    Number.isFinite(date) &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= 3_600_000 &&
      Math.abs(Date.now() - date) <= 3_600_000,
    "Registry/API freshness unavailable",
  );
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert(size <= 16_777_216, "Registry/API response exceeds 16MiB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (absent && response.status === 404) {
    assert(value.error === "Not found", "Untrustworthy absence response");
    return null;
  }
  assert(response.ok, `Registry/API HTTP ${response.status}`);
  return object(value);
}
async function verifyCi(config, sha) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  assert(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "") && token,
    "GitHub host identity/token unavailable",
  );
  const api = `https://api.github.com/repos/${repo}/actions`;
  const result = await json(
    `${api}/workflows/ci.yaml/runs?event=push&branch=main&head_sha=${sha}&per_page=100`,
    token,
  );
  assert(
    Number.isSafeInteger(result.total_count) &&
      result.total_count > 0 &&
      result.total_count <= 100 &&
      Array.isArray(result.workflow_runs) &&
      result.workflow_runs.length === result.total_count,
    "CI history incomplete",
  );
  const latest = [...result.workflow_runs].sort((a, b) => b.id - a.id)[0];
  const before = await json(`${api}/runs/${latest.id}`, token);
  successfulRun(before, sha);
  const page = await json(
    `${api}/runs/${before.id}/attempts/${before.run_attempt}/jobs?per_page=100`,
    token,
  );
  assert(
    Number.isSafeInteger(page.total_count) &&
      page.total_count <= 100 &&
      Array.isArray(page.jobs) &&
      page.jobs.length === page.total_count,
    "CI job pagination incomplete",
  );
  successfulJobs(page.jobs, config.ci.nodeVersions);
  const after = await json(`${api}/runs/${before.id}`, token);
  successfulRun(after, sha);
  assert(
    after.id === before.id && after.run_attempt === before.run_attempt,
    "CI attempt changed during verification",
  );
}
function command(tool, args) {
  return execFileSync(tool, args, {
    encoding: "utf8",
    maxBuffer: 16_777_216,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function tarballMaps(tarball, artifact) {
  const entries = command("tar", ["-tzf", tarball]).split(/\r?\n/);
  for (const entry of entries)
    assert(
      entry.startsWith("package/") && !entry.split("/").includes(".."),
      "Tarball path escape",
    );
  for (const path of [
    artifact.exports["."].import,
    artifact.exports["."].types,
  ]) {
    const target = `package/${path.replace(/^\.\//, "")}`;
    assert(
      entries.includes(target) && entries.includes(`${target}.map`),
      "Missing public entry or map",
    );
    const map = JSON.parse(command("tar", ["-xOf", tarball, `${target}.map`]));
    assert(
      !map.sourceRoot &&
        Array.isArray(map.sources) &&
        map.sources.length &&
        map.sources.every((source) => {
          const path = posix.normalize(
            posix.join(posix.dirname(target), source),
          );
          return path.startsWith("package/") && entries.includes(path);
        }),
      "Map source content not delivered",
    );
  }
}
async function main() {
  assert(
    !process.env.NPM_TOKEN && !process.env.NODE_AUTH_TOKEN,
    "Stored npm tokens are forbidden",
  );
  assert(
    process.env.GITHUB_ACTIONS === "true",
    "Publisher profile runs only in GitHub Actions",
  );
  const config = configuration(
    JSON.parse(readFileSync("release.config.json", "utf8")),
  );
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const event = process.env.GITHUB_EVENT_NAME;
  if (event === "push")
    assert(process.env.GITHUB_REF_TYPE === "tag", "Only release tags publish");
  const release = releaseIdentity(
    config,
    manifest,
    event,
    process.env.GITHUB_REF_NAME,
    process.env.PACKAGE_INPUT,
  );
  const sha = command("git", ["rev-parse", "HEAD"]);
  assert(/^[0-9a-f]{40}$/.test(sha), "Actual checkout SHA is invalid");
  command("git", [
    "merge-base",
    "--is-ancestor",
    sha,
    "refs/remotes/origin/main",
  ]);
  await verifyCi(config, sha);
  unpublished(
    release,
    await json(
      `${registry}${encodeURIComponent(release.name)}`,
      undefined,
      true,
    ),
  );
  command("pnpm", ["run", "build"]);
  const owned = resolve(".release-artifacts", randomUUID());
  mkdirSync(owned, { recursive: true });
  try {
    const tarball = join(owned, "package.tgz");
    command("pnpm", ["--config.ignore-scripts=true", "pack", "--out", tarball]);
    const fingerprint = () =>
      createHash("sha256").update(readFileSync(tarball)).digest("hex");
    const digest = fingerprint();
    const artifact = JSON.parse(
      command("tar", ["-xOf", tarball, "package/package.json"]),
    );
    artifactIdentity(release, artifact);
    let queries = 0;
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ])
      for (const [name, range] of Object.entries(artifact[field] ?? {})) {
        assert(++queries <= 64, "Dependency verification budget exceeded");
        const metadata = await json(
          `${registry}${encodeURIComponent(name)}`,
          undefined,
          true,
        );
        assert(
          metadata?.name === name &&
            Object.keys(object(metadata.versions)).some((v) =>
              semver.satisfies(v, range),
            ),
          "Dependency must already be published separately",
        );
      }
    tarballMaps(tarball, artifact);
    command("pnpm", ["exec", "publint", tarball]);
    const npm = command("npm", ["--version"]);
    assert(
      semver.valid(npm) && !semver.prerelease(npm) && semver.gte(npm, "11.5.1"),
      "npm client does not support Trusted Publishing",
    );
    assert(
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
        process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
      "OIDC capability unavailable",
    );
    assert(fingerprint() === digest, "Tarball changed after verification");
    unpublished(
      release,
      await json(
        `${registry}${encodeURIComponent(release.name)}`,
        undefined,
        true,
      ),
    );
    command("npm", [
      "publish",
      tarball,
      "--ignore-scripts",
      "--access",
      "public",
      "--tag",
      release.channel,
      "--provenance",
      `--registry=${registry}`,
      ...(event === "workflow_dispatch" ? ["--dry-run"] : []),
    ]);
    assert(fingerprint() === digest, "Tarball changed during publication");
  } finally {
    rmSync(owned, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
