import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import semver from "semver";
import { parseDocument } from "yaml";

const registry = "https://registry.npmjs.org/";
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/;
const packagePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "Expected an object in release metadata.",
  );
  return value as Record<string, unknown>;
}

function yaml(path: string): Record<string, unknown> {
  const document = parseDocument(readFileSync(path, "utf8"), {
    uniqueKeys: true,
  });
  requireValue(
    document.errors.length === 0 && document.warnings.length === 0,
    `Invalid or unsupported YAML: ${path}`,
  );
  return object(document.toJS({ maxAliasCount: 32 }));
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1_048_576,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function request(
  url: string,
  token?: string,
  allowAbsent = false,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      accept: token ? "application/vnd.github+json" : "application/json",
      "cache-control": "no-cache",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const date = Date.parse(response.headers.get("date") ?? "");
  const age = Number(response.headers.get("age") ?? "0");
  requireValue(
    Number.isFinite(date) &&
      Math.abs(Date.now() - date) <= 3_600_000 &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= 3600,
    "Registry/API freshness could not be confirmed.",
  );
  requireValue(response.body, "Registry/API response body is missing.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = object(await reader.read());
      if (chunk.done === true) break;
      const value = chunk.value;
      requireValue(
        value instanceof Uint8Array,
        "Unsupported API response chunk.",
      );
      size += value.byteLength;
      requireValue(size <= 16_777_216, "Registry/API response exceeds 16MiB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const value = object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (allowAbsent && response.status === 404) {
    requireValue(value.error === "Not found", "Unconfirmed registry absence.");
    return null;
  }
  requireValue(response.ok, `Registry/API HTTP ${response.status}.`);
  return value;
}

function list(value: unknown): unknown[] {
  requireValue(Array.isArray(value), "Expected a list in release metadata.");
  return value;
}

function deliveryDeclaration(root: string, directory: string) {
  requireValue(
    !existsSync(join(root, "silvermoon.yaml")),
    "Migrate root silvermoon.yaml to per-package deliverable.yaml; legacy delivery declarations are not supported.",
  );
  const path = join(directory, "deliverable.yaml");
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
  requireValue(
    info.isFile() &&
      !info.isSymbolicLink() &&
      realpathSync(path) === path &&
      info.size <= 1_048_576,
    "deliverable.yaml must be a regular non-redirected file of at most 1MiB.",
  );
  const declaration = yaml(path);
  requireValue(
    typeof declaration.type === "string" &&
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(declaration.type) &&
      !["path", "packageId", "deliverables"].some((key) =>
        Object.hasOwn(declaration, key),
      ),
    "Declare a valid type in this package's deliverable.yaml; path and packageId are derived, not configurable.",
  );
  return declaration;
}

function packageIdentity(directory: string) {
  const manifest = object(
    JSON.parse(readFileSync(join(directory, "package.json"), "utf8")),
  );
  const { name, version } = manifest;
  requireValue(
    typeof name === "string" &&
      packagePattern.test(name) &&
      !/template|your[-_]|example|^@workspace\//i.test(name) &&
      (manifest.private === undefined || manifest.private === false) &&
      typeof version === "string" &&
      versionPattern.test(version) &&
      semver.valid(version) === version,
    "Expected a public npm package with a canonical stable or rc version.",
  );
  return {
    manifest,
    name,
    version,
    channel: version.includes("-rc.") ? ("rc" as const) : ("latest" as const),
  };
}

export interface PublishTarget {
  readonly directory: string;
  readonly name: string;
  readonly version: string;
  readonly channel: "latest" | "rc";
}

export function selectPublishTarget(
  cwd = process.cwd(),
  env = process.env,
): PublishTarget {
  requireValue(
    env.GITHUB_ACTIONS === "true" &&
      (env.GITHUB_EVENT_NAME === "push" ||
        env.GITHUB_EVENT_NAME === "workflow_dispatch"),
    "Target selection requires a GitHub Actions tag push or manual dispatch.",
  );
  const root = resolve(git(cwd, "rev-parse", "--show-toplevel"));
  const paths = existsSync(join(root, "pnpm-workspace.yaml"))
    ? list(
        JSON.parse(
          packageManager(
            root,
            env,
            "list",
            "--recursive",
            "--include-workspace-root",
            "--depth",
            "-1",
            "--json",
          ),
        ),
      ).map((entry) => {
        const path = object(entry).path;
        requireValue(
          typeof path === "string",
          "Workspace member path is unavailable.",
        );
        return resolve(path);
      })
    : [];
  const names = new Set<string>();
  const candidates = [...new Set([root, ...paths])]
    .flatMap((directory) => {
      const path = relative(root, directory).split(sep).join("/") || ".";
      requireValue(
        path !== ".." &&
          !path.startsWith("../") &&
          !path.includes(":") &&
          !path.startsWith("/") &&
          realpathSync(directory) === directory,
        "Publishing directories must be non-redirected package directories inside the repository.",
      );
      if (deliveryDeclaration(root, directory)?.type !== "npm") return [];
      const { name, version, channel } = packageIdentity(directory);
      requireValue(!names.has(name), `Duplicate npm delivery name: ${name}`);
      names.add(name);
      return [{ directory: path, name, version, channel }];
    })
    .filter((entry) =>
      env.GITHUB_EVENT_NAME === "push"
        ? env.GITHUB_REF_TYPE === "tag" &&
          env.GITHUB_REF === `refs/tags/${entry.name}@${entry.version}`
        : env.PACKAGE_INPUT === entry.name,
    );
  requireValue(
    candidates.length === 1,
    "Release event must select exactly one registered npm package and version.",
  );
  return candidates[0]!;
}

function packageManager(
  cwd: string,
  env: NodeJS.ProcessEnv,
  ...args: string[]
) {
  const cli = env.npm_execpath;
  requireValue(cli, "The lifecycle package-manager executable is unavailable.");
  const javascript = /\.[cm]?js$/i.test(cli);
  return execFileSync(
    javascript ? process.execPath : cli,
    javascript ? [cli, ...args] : args,
    {
      cwd,
      env,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1_048_576,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function pnpmDependencyResolver(root: string, env: NodeJS.ProcessEnv) {
  let projects: Record<string, unknown>[] | undefined;
  let catalog: Record<string, unknown> | undefined;
  return (name: string, range: unknown): unknown => {
    if (range === "catalog:") {
      catalog ??= object(yaml(join(root, "pnpm-workspace.yaml")).catalog);
      return catalog[name];
    }
    if (range === "workspace:*") {
      projects ??= list(
        JSON.parse(
          packageManager(
            root,
            env,
            "list",
            "--recursive",
            "--depth",
            "-1",
            "--json",
          ),
        ),
      ).map(object);
      const matches = projects.filter((project) => project.name === name);
      requireValue(
        matches.length === 1,
        `Workspace dependency ${name} must identify exactly one member.`,
      );
      const version = matches[0]!.version;
      requireValue(
        typeof version === "string" && semver.valid(version) === version,
        `Workspace dependency ${name} needs an exact version.`,
      );
      return version;
    }
    return range;
  };
}

function verifyRun(run: Record<string, unknown>, sha: string): void {
  requireValue(
    run.head_sha === sha &&
      run.head_branch === "main" &&
      run.event === "push" &&
      run.path === ".github/workflows/ci.yaml" &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      Number.isSafeInteger(run.id) &&
      Number(run.id) > 0 &&
      Number.isSafeInteger(run.run_attempt) &&
      Number(run.run_attempt) > 0,
    "The latest exact-commit main-push CI must have succeeded.",
  );
}

async function verifyCi(
  root: string,
  sha: string,
  repo: string,
  token: string,
): Promise<void> {
  const workflow = yaml(join(root, ".github", "workflows", "ci.yaml"));
  const nodes = list(
    object(object(object(object(workflow.jobs).compatibility).strategy).matrix)[
      "node-version"
    ],
  );
  requireValue(
    nodes.length >= 2 &&
      nodes.length <= 8 &&
      new Set(nodes).size === nodes.length &&
      nodes.every(
        (node) =>
          typeof node === "string" &&
          semver.valid(node) === node &&
          semver.prerelease(node) === null,
      ),
    "CI must declare 2..8 unique exact stable Node versions.",
  );
  const api = `https://api.github.com/repos/${repo}/actions`;
  const history = object(
    await request(
      `${api}/workflows/ci.yaml/runs?event=push&branch=main&head_sha=${sha}&per_page=100`,
      token,
    ),
  );
  const runs = list(history.workflow_runs).map(object);
  requireValue(
    runs.length > 0 &&
      runs.length <= 100 &&
      history.total_count === runs.length &&
      runs.every((run) => Number.isSafeInteger(run.id) && Number(run.id) > 0),
    "Exact-commit CI history is missing or incomplete.",
  );
  const latest = runs.reduce((a, b) => (Number(a.id) > Number(b.id) ? a : b));
  const before = object(
    await request(`${api}/runs/${String(latest.id)}`, token),
  );
  verifyRun(before, sha);
  requireValue(before.id === latest.id, "CI run identity changed.");
  const page = object(
    await request(
      `${api}/runs/${String(before.id)}/attempts/${String(before.run_attempt)}/jobs?per_page=100`,
      token,
    ),
  );
  const jobs = list(page.jobs).map(object);
  requireValue(
    jobs.length <= 100 && page.total_count === jobs.length,
    "CI job pagination is incomplete.",
  );
  for (const name of [
    "Quality default",
    ...nodes.map((node) => `Node.js ${String(node)}`),
    "Release verification (v1)",
  ]) {
    const matches = jobs.filter((job) => job.name === name);
    requireValue(
      matches.length === 1 &&
        matches[0]?.status === "completed" &&
        matches[0].conclusion === "success",
      `Required CI job did not succeed uniquely: ${name}`,
    );
  }
  const aggregate = jobs.find(
    (job) => job.name === "Release verification (v1)",
  )!;
  const steps = list(aggregate.steps)
    .map(object)
    .filter((step) => step.name === "Confirm required checks succeeded");
  requireValue(
    steps.length === 1 &&
      steps[0]?.status === "completed" &&
      steps[0].conclusion === "success",
    "CI aggregate confirmation step did not succeed uniquely.",
  );
  const after = object(
    await request(`${api}/runs/${String(before.id)}`, token),
  );
  verifyRun(after, sha);
  requireValue(
    after.id === before.id && after.run_attempt === before.run_attempt,
    "CI attempt changed during verification; retry after CI is stable.",
  );
}

function unpublished(
  version: string,
  metadata: Record<string, unknown> | null,
) {
  const counter = semver.prerelease(version)?.[1];
  if (metadata === null) {
    requireValue(
      counter === undefined || counter === 0,
      "First RC must be rc.0.",
    );
    return;
  }
  const versions = object(metadata.versions);
  const time = object(metadata.time);
  requireValue(
    typeof time.created === "string" &&
      typeof time.modified === "string" &&
      !time.unpublished &&
      Object.keys(versions).every((v) => typeof time[v] === "string") &&
      Object.keys(time)
        .filter((v) => semver.valid(v))
        .every((v) => Object.hasOwn(versions, v)),
    "Registry publication history is incomplete.",
  );
  requireValue(
    !Object.hasOwn(versions, version) && !Object.hasOwn(time, version),
    "Version already exists on npm.",
  );
  if (counter === undefined) return;
  const base = `${version.split("-rc.")[0]}-rc.`;
  const prior = Object.keys(versions)
    .filter((v) => v.startsWith(base))
    .map((v) => {
      requireValue(versionPattern.test(v), "Invalid RC publication history.");
      return Number(v.slice(base.length));
    })
    .sort((a, b) => a - b);
  requireValue(
    prior.every((n, i) => n === i) && counter === prior.length,
    "RC history must be contiguous from zero.",
  );
}

export interface PublishContext {
  readonly name: string;
  readonly version: string;
  readonly channel: "latest" | "rc";
  readonly sha: string;
  readonly dryRun: boolean;
}

export async function checkPublishContext(
  cwd = process.cwd(),
  env = process.env,
): Promise<PublishContext> {
  requireValue(
    env.GITHUB_ACTIONS === "true" &&
      env.npm_command === "publish" &&
      env.npm_lifecycle_event === "prepublishOnly",
    "Run publish-gate check from npm/pnpm publish's prepublishOnly hook in GitHub Actions.",
  );
  requireValue(
    !env.NPM_TOKEN &&
      !env.NODE_AUTH_TOKEN &&
      env.ACTIONS_ID_TOKEN_REQUEST_URL &&
      env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    "npm Trusted Publishing OIDC is required; stored npm tokens are forbidden.",
  );
  const repo = env.GITHUB_REPOSITORY;
  requireValue(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "") &&
      repo &&
      env.GITHUB_TOKEN &&
      env.GITHUB_WORKFLOW_REF ===
        `${repo}/.github/workflows/publish-npm.yaml@${env.GITHUB_REF}`,
    "Expected the repository's publish-npm.yaml workflow and GITHUB_TOKEN.",
  );
  cwd = resolve(cwd);
  const root = resolve(git(cwd, "rev-parse", "--show-toplevel"));
  const directory = relative(root, cwd).split(sep).join("/") || ".";
  requireValue(
    directory !== ".." &&
      !directory.startsWith("../") &&
      !directory.includes(":") &&
      realpathSync(cwd) === cwd &&
      realpathSync(root) === root,
    "Publish from a non-redirected package directory inside the repository.",
  );
  requireValue(
    git(root, "status", "--porcelain", "--untracked-files=normal") === "",
    "Commit or remove tracked changes and untracked files before publishing.",
  );
  const sha = git(root, "rev-parse", "HEAD^{commit}");
  requireValue(
    /^[0-9a-f]{40}$/.test(sha) && env.GITHUB_SHA === sha,
    "Checkout HEAD must match the exact GitHub event SHA.",
  );
  git(root, "merge-base", "--is-ancestor", sha, "refs/remotes/origin/main");
  const { manifest, name, version, channel } = packageIdentity(cwd);
  requireValue(
    deliveryDeclaration(root, cwd)?.type === "npm",
    "Declare type: npm in this package's deliverable.yaml.",
  );
  const pnpm = env.npm_config_user_agent?.startsWith("pnpm/") === true;
  const option = (name: string) =>
    env[pnpm ? `PNPM_CONFIG_${name.toUpperCase()}` : `npm_config_${name}`];
  const config = object(manifest.publishConfig);
  requireValue(
    Object.keys(config).every((key) =>
      ["registry", "access", "tag"].includes(key),
    ) &&
      config.registry === registry &&
      config.access === "public" &&
      config.directory === undefined &&
      (config.tag === undefined || config.tag === channel) &&
      option("registry") === registry &&
      option("access") === "public" &&
      option("tag") === channel &&
      option("provenance") === "true" &&
      option("force") !== "true",
    `Use ${pnpm ? "PNPM_CONFIG_* publishing options" : "npm publish options"} for public ${registry}, --tag=${channel} and provenance, without --force; publishConfig must agree.`,
  );
  if (name.startsWith("@")) {
    requireValue(env.npm_execpath, "The lifecycle executable is unavailable.");
    const scopedRegistry = packageManager(
      cwd,
      env,
      "config",
      "get",
      `${name.split("/")[0]}:registry`,
    );
    requireValue(
      scopedRegistry === "undefined" || scopedRegistry === registry,
      "A scope-specific registry must not redirect publication away from public npm.",
    );
  }
  const dryRun = option("dry_run") === "true";
  if (env.GITHUB_EVENT_NAME === "push") {
    const tag = `${name}@${version}`;
    requireValue(
      env.GITHUB_REF_TYPE === "tag" &&
        env.GITHUB_REF === `refs/tags/${tag}` &&
        git(root, "rev-parse", `refs/tags/${tag}^{commit}`) === sha,
      "Release tag must be <full-package-name>@<version> and match the checkout SHA.",
    );
  } else {
    requireValue(
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
        dryRun &&
        env.PACKAGE_INPUT === name,
      "Manual dispatch is dry-run only and must select this full npm package name.",
    );
  }
  await verifyCi(root, sha, repo, env.GITHUB_TOKEN);
  const metadata = await request(
    `${registry}${encodeURIComponent(name)}`,
    undefined,
    true,
  );
  requireValue(
    metadata === null || metadata.name === name,
    "Registry package identity mismatch.",
  );
  unpublished(version, metadata);
  const resolvePnpmDependency = pnpmDependencyResolver(root, env);
  let queries = 0;
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const dependencies = manifest[field];
    if (dependencies === undefined) continue;
    for (const [dependency, declaration] of Object.entries(
      object(dependencies),
    )) {
      const range = pnpm
        ? resolvePnpmDependency(dependency, declaration)
        : declaration;
      requireValue(++queries <= 64, "Dependency verification budget exceeded.");
      requireValue(
        packagePattern.test(dependency) &&
          typeof range === "string" &&
          semver.validRange(range) &&
          !/^(?:workspace|file|link|portal|npm):/.test(range),
        `Dependency ${dependency} must use a registry SemVer range; only native pnpm supports catalog: and workspace:* here.`,
      );
      const published = await request(
        `${registry}${encodeURIComponent(dependency)}`,
        undefined,
        true,
      );
      requireValue(
        published?.name === dependency &&
          Object.keys(object(published.versions)).some((v) =>
            semver.satisfies(v, range),
          ),
        `Dependency ${dependency} must already be published separately.`,
      );
    }
  }
  return { name, version, channel, sha, dryRun };
}
