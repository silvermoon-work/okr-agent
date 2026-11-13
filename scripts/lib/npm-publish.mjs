import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import semver from "semver";
import { parse } from "acorn";
import { parseDocument } from "yaml";

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
    typeof value.package.directory === "string" &&
      (value.package.directory === "." ||
        (!/[:\\]/.test(value.package.directory) &&
          value.package.directory
            .split("/")
            .every(
              (part) =>
                part &&
                part !== "." &&
                part !== ".." &&
                /^[a-zA-Z0-9._-]+$/.test(part),
            ))),
    "Invalid selected package directory",
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
export function releaseMappings(source) {
  const tree = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const statement = tree.body[0];
  assert(
    tree.body.length === 1 && statement.type === "ExportNamedDeclaration",
    "Only static releasePackages mapping is supported",
  );
  const declaration = statement.declaration;
  assert(
    declaration?.kind === "const" &&
      declaration.declarations.length === 1 &&
      declaration.declarations[0].id.name === "releasePackages",
    "Invalid releasePackages declaration",
  );
  const array = declaration.declarations[0].init;
  assert(array.type === "ArrayExpression", "Mapping must be a static array");
  return array.elements.map((entry) => {
    assert(
      entry?.type === "ObjectExpression",
      "Mapping must contain static objects",
    );
    const result = {};
    for (const property of entry.properties) {
      assert(
        property.type === "Property" &&
          property.kind === "init" &&
          !property.computed &&
          !property.method &&
          !property.shorthand &&
          property.value.type === "Literal" &&
          typeof property.value.value === "string",
        "Mapping fields must be literal strings",
      );
      const key = property.key.name ?? property.key.value;
      assert(
        ["id", "name", "directory"].includes(key) &&
          !Object.hasOwn(result, key),
        "Invalid/duplicate mapping field",
      );
      result[key] = property.value.value;
    }
    keys(result, ["id", "name", "directory"]);
    return result;
  });
}
export function workflowMatrix(source) {
  const document = parseDocument(source, { uniqueKeys: true });
  assert(
    document.errors.length === 0 && document.warnings.length === 0,
    "Invalid CI workflow YAML",
  );
  const workflow = document.toJS({ maxAliasCount: 32 });
  const nodes =
    workflow?.jobs?.compatibility?.strategy?.matrix?.["node-version"];
  const expected = qualityWorkflow(nodes === undefined ? [] : nodes);
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, normalize(child)]),
      );
    return value;
  };
  assert(
    JSON.stringify(normalize(workflow)) === JSON.stringify(normalize(expected)),
    "Fixed quality workflow structure mismatch; expected check/compatibility/release-verification with standard triggers, permissions and failure propagation",
  );
  // configuration performs the bounded exact-stable-version validation.
  configuration({
    schemaVersion: 1,
    package: { id: "validation", name: "validation", directory: "." },
    ci: { nodeVersions: nodes },
  });
  keys(workflow.jobs.compatibility.strategy.matrix, ["node-version"]);
  return nodes;
}
export function qualityWorkflow(nodes) {
  const setup = [
    { uses: "actions/checkout@v7" },
    {
      uses: "actions/setup-node@v7",
      with: { "node-version-file": ".node-version" },
    },
    { uses: "pnpm/action-setup@v6" },
    { run: "pnpm install --frozen-lockfile" },
    { run: "pnpm check" },
  ];
  return {
    name: "CI",
    on: { push: { branches: ["main"] }, pull_request: null },
    permissions: { contents: "read" },
    jobs: {
      check: {
        name: "Quality default",
        "runs-on": "ubuntu-latest",
        steps: setup,
      },
      compatibility: {
        name: "Node.js ${{ matrix.node-version }}",
        "runs-on": "ubuntu-latest",
        strategy: { "fail-fast": false, matrix: { "node-version": nodes } },
        steps: setup.map((step, index) =>
          index === 1
            ? {
                uses: "actions/setup-node@v7",
                with: { "node-version": "${{ matrix.node-version }}" },
              }
            : step,
        ),
      },
      "release-verification": {
        name: "Release verification (v1)",
        needs: ["check", "compatibility"],
        if: "always()",
        "runs-on": "ubuntu-latest",
        steps: [
          {
            name: "Confirm required checks succeeded",
            env: {
              CHECK_RESULT: "${{ needs.check.result }}",
              COMPATIBILITY_RESULT: "${{ needs.compatibility.result }}",
            },
            run: 'if [ "$CHECK_RESULT" != success ] || [ "$COMPATIBILITY_RESULT" != success ]; then\n  echo "::error::Every required validation job and matrix must succeed."\n  exit 1\nfi\n',
          },
        ],
      },
    },
  };
}
export function resolveConfiguration(
  projects,
  mappings,
  nodeVersions,
  event,
  ref,
  input,
) {
  const targets = projects.filter(
    (project) =>
      project.manifest.private !== true &&
      (project.manifest.publishConfig !== undefined ||
        project.manifest.scripts?.["lint-package"] !== undefined),
  );
  assert(targets.length > 0, "No non-private npm publishing target");
  assert(
    targets.every(
      (project) =>
        typeof project.manifest.name === "string" &&
        packageName.test(project.manifest.name),
    ),
    "Npm target manifest.name is unavailable/invalid",
  );
  for (const key of ["id", "name", "directory"])
    assert(
      new Set(mappings.map((mapping) => mapping[key])).size === mappings.length,
      `Ambiguous mapping ${key}`,
    );
  for (const mapping of mappings) {
    configuration({ schemaVersion: 1, package: mapping, ci: { nodeVersions } });
    assert(
      projects.some(
        (project) =>
          project.directory === mapping.directory &&
          project.manifest.name === mapping.name,
      ),
      "Mapping does not identify a real declared project",
    );
  }
  assert(
    mappings.length || targets.length === 1,
    "Multiple npm targets require an existing explicit ID/tag mapping",
  );
  const candidates = mappings.length
    ? mappings
    : targets.map((project) => ({
        id: project.manifest.name.split("/").at(-1),
        name: project.manifest.name,
        directory: project.directory,
      }));
  const selected = candidates.filter((mapping) =>
    event === "push"
      ? projects.some(
          (project) =>
            project.directory === mapping.directory &&
            ref === `${mapping.id}-v${project.manifest.version}`,
        )
      : event === "workflow_dispatch" && input === mapping.id,
  );
  assert(
    selected.length === 1,
    "Release event must explicitly select exactly one package ID/tag",
  );
  const config = configuration({
    schemaVersion: 1,
    package: selected[0],
    ci: { nodeVersions },
  });
  publicationPlan(config, projects);
  return config;
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
    /^[0-9a-f]{40}$/.test(sha) &&
      run.head_sha === sha &&
      run.head_branch === "main" &&
      run.event === "push" &&
      run.path === ".github/workflows/ci.yaml" &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      Number.isSafeInteger(run.id) &&
      run.id > 0 &&
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
  const steps = (Array.isArray(aggregate.steps) ? aggregate.steps : []).filter(
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
export async function verifyCi(config, sha) {
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
  const publicEntries = Object.entries(object(artifact.exports)).filter(
    ([name]) => name !== "./package.json",
  );
  assert(publicEntries.length > 0, "Public exports are required");
  for (const [, entry] of publicEntries)
    for (const path of [object(entry).import, object(entry).types]) {
      assert(
        typeof path === "string" &&
          path.startsWith("./") &&
          !path.split("/").includes(".."),
        "Unsupported/escaping public export",
      );
      const target = `package/${path.replace(/^\.\//, "")}`;
      assert(
        entries.includes(target) && entries.includes(`${target}.map`),
        "Missing public entry or map",
      );
      const map = JSON.parse(
        command("tar", ["-xOf", tarball, `${target}.map`]),
      );
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
export function publicationMode(mode, event) {
  assert(
    (mode === "release" && event === "push") ||
      (mode === "release-dry-run" && event === "workflow_dispatch"),
    "release requires a tag push; release-dry-run requires manual dispatch",
  );
  return mode === "release-dry-run";
}
export function verifiedTarball(tarball, digest) {
  const observed = createHash("sha256")
    .update(readFileSync(tarball))
    .digest("hex");
  assert(observed === digest, "Tarball changed after verification");
}
export function publicationPlan(config, projects) {
  assert(
    projects.filter((project) => project.manifest.name === config.package.name)
      .length <= 1,
    "Mapped package name is ambiguous",
  );
  const selected = projects.filter(
    (project) =>
      project.directory === config.package.directory &&
      project.manifest.name === config.package.name,
  );
  assert(
    selected.length === 1,
    "Mapped package is not a unique declared project",
  );
  assert(selected[0].manifest.private !== true, "Wrong/private package");
  const members = projects.filter((project) => project.directory !== ".");
  const workspace = members.length > 0;
  if (config.package.directory === ".")
    assert(
      !members.some(
        (project) =>
          project.code ||
          project.manifest.publishConfig ||
          project.manifest.scripts?.build,
      ),
      "Workspace publisher must select one member, not the aggregate root",
    );
  assert(
    config.package.directory === "." || workspace,
    "Member package requires an actual workspace",
  );
  return {
    directory: config.package.directory,
    build:
      config.package.directory === "."
        ? ["run", "build"]
        : ["--filter", `${config.package.name}...`, "run", "build"],
    pack: [
      "--dir",
      config.package.directory,
      "--config.ignore-scripts=true",
      "pack",
      "--out",
    ],
  };
}
export async function publish(mode) {
  assert(
    process.argv.length === 2,
    "Fixed release entries do not accept arguments",
  );
  const dryRun = publicationMode(mode, process.env.GITHUB_EVENT_NAME);
  assert(
    !process.env.NPM_TOKEN && !process.env.NODE_AUTH_TOKEN,
    "Stored npm tokens are forbidden",
  );
  assert(
    process.env.GITHUB_ACTIONS === "true",
    "Publisher profile runs only in GitHub Actions",
  );
  const directories = existsSync("pnpm-workspace.yaml")
    ? JSON.parse(
        command("pnpm", [
          "--recursive",
          "--include-workspace-root",
          "list",
          "--depth",
          "-1",
          "--json",
        ]),
      ).map((project) => project.path)
    : [process.cwd()];
  const projects = [
    ...new Set(
      [process.cwd(), ...directories].map((path) => {
        const directory =
          relative(process.cwd(), resolve(path)).split(sep).join("/") || ".";
        assert(
          directory === "." ||
            (!directory.startsWith("/") &&
              !directory.includes(":") &&
              !directory.split("/").includes("..")),
          "Workspace path escape",
        );
        return directory;
      }),
    ),
  ].map((directory) => {
    return {
      directory,
      manifest: JSON.parse(
        readFileSync(join(directory, "package.json"), "utf8"),
      ),
    };
  });
  const nodes = workflowMatrix(
    readFileSync(".github/workflows/ci.yaml", "utf8"),
  );
  const mappingPaths = [
    "scripts/lib/release-packages.mjs",
    "scripts/release-packages.js",
  ].filter((path) => existsSync(path));
  assert(
    mappingPaths.length <= 1,
    "Multiple release mapping sources are ambiguous",
  );
  let mappings = mappingPaths.length
    ? releaseMappings(readFileSync(mappingPaths[0], "utf8"))
    : [];
  if (existsSync("release.config.json")) {
    const legacy = configuration(
      JSON.parse(readFileSync("release.config.json", "utf8")),
    );
    assert(
      JSON.stringify(legacy.ci.nodeVersions) === JSON.stringify(nodes),
      "Legacy matrix differs from the real workflow",
    );
    assert(!mappings.length, "Duplicate release mapping sources");
    mappings = [legacy.package];
  }
  const config = resolveConfiguration(
    projects,
    mappings,
    nodes,
    process.env.GITHUB_EVENT_NAME,
    process.env.GITHUB_REF_NAME,
    process.env.PACKAGE_INPUT,
  );
  const plan = publicationPlan(config, projects);
  const manifest = projects.find(
    (project) => project.directory === plan.directory,
  ).manifest;
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
  const sha = command("git", ["rev-parse", "HEAD^{commit}"]);
  assert(/^[0-9a-f]{40}$/.test(sha), "Actual checkout SHA is invalid");
  if (event === "push")
    assert(
      command("git", [
        "rev-parse",
        `refs/tags/${process.env.GITHUB_REF_NAME}^{commit}`,
      ]) === sha,
      "Dereferenced release tag does not match the checkout commit",
    );
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
  command("pnpm", plan.build);
  const owned = resolve(".release-artifacts", randomUUID());
  mkdirSync(owned, { recursive: true });
  try {
    const tarball = join(owned, "package.tgz");
    command("pnpm", [...plan.pack, tarball]);
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
    verifiedTarball(tarball, digest);
    unpublished(
      release,
      await json(
        `${registry}${encodeURIComponent(release.name)}`,
        undefined,
        true,
      ),
    );
    verifiedTarball(tarball, digest);
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
      ...(dryRun ? ["--dry-run"] : []),
    ]);
    verifiedTarball(tarball, digest);
  } finally {
    rmSync(owned, { recursive: true, force: true });
  }
}
