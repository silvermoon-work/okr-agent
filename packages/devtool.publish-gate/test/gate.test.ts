import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPublishContext, selectPublishTarget } from "../src/index.js";

const command = vi.hoisted(() =>
  vi.fn<(file: string, args: string[], options: unknown) => string>(),
);
vi.mock("node:child_process", () => ({ execFileSync: command }));

const sha = "a".repeat(40);
const name = "@silvermoon-work/widget";
const registry = "https://registry.npmjs.org/";
const version = "0.1.0-rc.0";
let root: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
let manifest: Record<string, unknown>;
let run: Record<string, unknown>;
let after: Record<string, unknown>;
let history: Record<string, unknown>;
let jobs: Record<string, unknown>[];
let metadata: Record<string, unknown> | null;
let dependency: Record<string, unknown> | null;
let dirty: string;
let tagSha: string;
let scopeRegistry: string;
let workspaceProjects: unknown[];
let runReads: number;
let responder: ((url: string) => Response) | undefined;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

function response(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { date: new Date().toUTCString(), ...headers },
  });
}

function published(versions: string[]): Record<string, unknown> {
  return {
    name,
    versions: Object.fromEntries(versions.map((v) => [v, {}])),
    time: {
      created: "2026-01-01",
      modified: "2026-11-01",
      ...Object.fromEntries(versions.map((v) => [v, "2026-11-01"])),
    },
  };
}

async function saveManifest() {
  await writeFile(join(cwd, "package.json"), JSON.stringify(manifest));
}

beforeEach(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), "publish-gate-test-")));
  cwd = join(root, "packages", "widget");
  await mkdir(cwd, { recursive: true });
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(cwd, "deliverable.yaml"), "type: npm\n");
  await writeFile(
    join(root, ".github", "workflows", "ci.yaml"),
    "jobs:\n  compatibility:\n    strategy:\n      matrix:\n        node-version: [22.15.0, 24.11.1]\n",
  );
  manifest = {
    name,
    version,
    publishConfig: { registry, access: "public" },
    dependencies: { semver: "^7.0.0" },
  };
  await saveManifest();
  env = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "silvermoon-work/okr-agent",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF: `refs/tags/${name}@${version}`,
    GITHUB_WORKFLOW_REF: `silvermoon-work/okr-agent/.github/workflows/publish-npm.yaml@refs/tags/${name}@${version}`,
    GITHUB_SHA: sha,
    GITHUB_TOKEN: "test-github-token",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.invalid/",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-oidc-capability",
    npm_command: "publish",
    npm_lifecycle_event: "prepublishOnly",
    npm_execpath: "npm-cli.js",
    npm_config_registry: registry,
    npm_config_access: "public",
    npm_config_tag: "rc",
    npm_config_provenance: "true",
  };
  run = {
    id: 7,
    run_attempt: 1,
    head_sha: sha,
    head_branch: "main",
    event: "push",
    path: ".github/workflows/ci.yaml",
    status: "completed",
    conclusion: "success",
  };
  after = run;
  history = { total_count: 1, workflow_runs: [{ id: 7 }] };
  jobs = [
    "Quality default",
    "Node.js 22.15.0",
    "Node.js 24.11.1",
    "Release verification (v1)",
  ].map((jobName) => ({
    name: jobName,
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
  metadata = null;
  dependency = { name: "semver", versions: { "7.8.6": {} } };
  dirty = "";
  tagSha = sha;
  scopeRegistry = "undefined";
  workspaceProjects = [{ name: "semver", version: "7.8.6" }];
  runReads = 0;
  responder = undefined;
  command.mockImplementation((file, args) => {
    if (file !== "git") {
      return args.includes("list")
        ? JSON.stringify(workspaceProjects)
        : scopeRegistry;
    }
    if (args[0] === "status") return dirty;
    if (args[0] === "merge-base") return "";
    if (args[1] === "--show-toplevel") return root;
    if (args[1] === "HEAD^{commit}") return sha;
    if (args[1]?.startsWith("refs/tags/")) return tagSha;
    throw new Error(`Unexpected command: ${file} ${args.join(" ")}`);
  });
  const dispatch = (url: string): Response => {
    if (responder) return responder(url);
    if (url.includes("/workflows/ci.yaml/runs?")) return response(history);
    if (url.endsWith("/jobs?per_page=100"))
      return response({ total_count: jobs.length, jobs });
    if (url.endsWith("/runs/7"))
      return response(runReads++ === 0 ? run : after);
    if (url === `${registry}${encodeURIComponent(name)}`)
      return metadata
        ? response(metadata)
        : response({ error: "Not found" }, 404);
    if (url === `${registry}semver`)
      return dependency
        ? response(dependency)
        : response({ error: "Not found" }, 404);
    throw new Error(`Unexpected request: ${url}`);
  };
  fetcher = vi.fn<typeof fetch>((input) => {
    if (typeof input !== "string")
      throw new Error("Expected a string request URL.");
    return Promise.resolve(dispatch(input));
  });
  vi.stubGlobal("fetch", fetcher);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  await rm(root, { recursive: true, force: true });
});

function pnpmContext(binary = "pnpm.cjs") {
  env.npm_config_user_agent = "pnpm/11.28.12 npm/? node/v26.13.1";
  env.npm_execpath = binary;
  for (const key of ["registry", "access", "tag", "provenance", "dry_run"]) {
    const value = env[`npm_config_${key}`];
    if (value !== undefined) env[`PNPM_CONFIG_${key.toUpperCase()}`] = value;
    delete env[`npm_config_${key}`];
  }
}

describe("workflow target selection", () => {
  beforeEach(async () => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ private: true }),
    );
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      "packages: [packages/*]\n",
    );
    workspaceProjects = [{ path: cwd, name, version }];
  });

  it("selects only the exact tag or explicit full name without approving publication", () => {
    const expected = {
      directory: "packages/widget",
      name,
      version,
      channel: "rc",
    };
    expect(selectPublishTarget(root, env)).toEqual(expected);
    env.GITHUB_EVENT_NAME = "workflow_dispatch";
    env.PACKAGE_INPUT = name;
    dirty = " M src/index.ts";
    expect(selectPublishTarget(root, env)).toEqual(expected);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["GITHUB_ACTIONS", "false"],
    ["GITHUB_EVENT_NAME", "pull_request"],
    ["GITHUB_REF", "refs/tags/widget-v9.0.0"],
    ["GITHUB_REF_TYPE", "branch"],
  ])("rejects an invalid selection context %s", (key, value) => {
    env[key] = value;
    expect(() => selectPublishTarget(root, env)).toThrow();
  });

  it("rejects unmapped manual names and selects stable packages on latest", async () => {
    env.GITHUB_EVENT_NAME = "workflow_dispatch";
    env.PACKAGE_INPUT = "missing";
    expect(() => selectPublishTarget(root, env)).toThrow("exactly one");
    env.PACKAGE_INPUT = name;
    manifest.version = "1.0.0";
    await saveManifest();
    expect(selectPublishTarget(root, env)).toMatchObject({
      version: "1.0.0",
      channel: "latest",
    });
  });

  it("selects a root single package without pnpm or workspace discovery", async () => {
    await rm(join(root, "pnpm-workspace.yaml"));
    cwd = root;
    await saveManifest();
    await writeFile(join(root, "deliverable.yaml"), "type: npm\n");
    delete env.npm_execpath;
    expect(selectPublishTarget(root, env)).toEqual({
      directory: ".",
      name,
      version,
      channel: "rc",
    });
    expect(command.mock.calls.every(([file]) => file === "git")).toBe(true);
  });

  it("does not inherit declarations and rejects duplicate full names", async () => {
    await rm(join(cwd, "deliverable.yaml"));
    expect(() => selectPublishTarget(root, env)).toThrow("exactly one");
    await writeFile(join(cwd, "deliverable.yaml"), "type: task-bundle\n");
    expect(() => selectPublishTarget(root, env)).toThrow("exactly one");
    await writeFile(join(cwd, "deliverable.yaml"), "type: npm\n");
    await saveManifest();
    await writeFile(join(root, "package.json"), JSON.stringify(manifest));
    await writeFile(join(root, "deliverable.yaml"), "type: npm\n");
    expect(() => selectPublishTarget(root, env)).toThrow(
      "Duplicate npm delivery name",
    );
  });

  it("rejects workspace paths outside the repository and incomplete discovery", () => {
    workspaceProjects = [{ path: join(root, "..") }];
    expect(() => selectPublishTarget(root, env)).toThrow(
      "inside the repository",
    );
    workspaceProjects = [{}];
    expect(() => selectPublishTarget(root, env)).toThrow("path is unavailable");
  });
});

describe("native pnpm publishing context", () => {
  it.each(["pnpm.cjs", "pnpm.exe"])(
    "supports lifecycle executable %s and catalog declarations",
    async (binary) => {
      pnpmContext(binary);
      await writeFile(
        join(root, "pnpm-workspace.yaml"),
        "catalog:\n  semver: ^7.0.0\n",
      );
      manifest.dependencies = { semver: "catalog:" };
      manifest.peerDependencies = { semver: "catalog:" };
      await saveManifest();
      await expect(checkPublishContext(cwd, env)).resolves.toMatchObject({
        name,
        channel: "rc",
      });
      expect(
        command.mock.calls.some(
          ([, args]) => args.includes("pack") || args.includes("publish"),
        ),
      ).toBe(false);
      expect(
        command.mock.calls.some(
          ([file]) =>
            file === (binary.endsWith(".cjs") ? process.execPath : binary),
        ),
      ).toBe(true);
    },
  );

  it("resolves workspace:* with pnpm membership and queries published versions, not local build output", async () => {
    pnpmContext();
    manifest.dependencies = { semver: "workspace:*" };
    manifest.optionalDependencies = { semver: "workspace:*" };
    await saveManifest();
    await expect(checkPublishContext(cwd, env)).resolves.toMatchObject({
      name,
    });
    expect(
      command.mock.calls.filter(([, args]) => args.includes("list")),
    ).toHaveLength(1);
    workspaceProjects = [];
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "exactly one member",
    );
    workspaceProjects = [{ name: "semver", version: "not-semver" }];
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "exact version",
    );
    workspaceProjects = [{ name: "semver", version: "6.0.0" }];
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "already be published",
    );
  });

  it("requires explicit native options and preserves manual dry-run protection", async () => {
    pnpmContext();
    delete env.PNPM_CONFIG_TAG;
    env.npm_config_tag = "rc";
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("PNPM_CONFIG");
    env.PNPM_CONFIG_TAG = "rc";
    env.GITHUB_EVENT_NAME = "workflow_dispatch";
    env.PACKAGE_INPUT = name;
    env.PNPM_CONFIG_DRY_RUN = "true";
    await expect(checkPublishContext(cwd, env)).resolves.toMatchObject({
      dryRun: true,
    });
    env.PNPM_CONFIG_DRY_RUN = "false";
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("dry-run only");
  });

  it.each(["catalog:named", "workspace:^", "workspace:../other"])(
    "rejects unsupported protocol %s",
    async (range) => {
      pnpmContext();
      manifest.dependencies = { semver: range };
      await saveManifest();
      await expect(checkPublishContext(cwd, env)).rejects.toThrow(
        "registry SemVer range",
      );
    },
  );

  it("rejects missing catalog entries rather than inventing a dependency range", async () => {
    pnpmContext();
    manifest.dependencies = { semver: "catalog:" };
    await saveManifest();
    await writeFile(join(root, "pnpm-workspace.yaml"), "catalog: {}\n");
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "registry SemVer range",
    );
  });
});

describe("authorized release context", () => {
  it("checks a tagged package and exact CI evidence without building, packing or publishing", async () => {
    expect(await checkPublishContext(cwd, env)).toEqual({
      name,
      version,
      channel: "rc",
      sha,
      dryRun: false,
    });
    expect(
      command.mock.calls.every(
        ([file, args]) =>
          file === "git" ||
          (file === process.execPath &&
            args.slice(1).join(" ") === "config get @silvermoon-work:registry"),
      ),
    ).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(6);
    const [, options] = fetcher.mock.calls[0]!;
    expect(options).toMatchObject({
      redirect: "error",
      headers: { authorization: "Bearer test-github-token" },
    });
    expect(fetcher.mock.calls[4]?.[1]?.headers).not.toHaveProperty(
      "authorization",
    );
    expect(await readFile(join(cwd, "package.json"), "utf8")).toBe(
      JSON.stringify(manifest),
    );
  });

  it("permits explicitly selected manual dry runs but never a manual real publication", async () => {
    env.GITHUB_EVENT_NAME = "workflow_dispatch";
    env.PACKAGE_INPUT = name;
    env.npm_config_dry_run = "true";
    expect(await checkPublishContext(cwd, env)).toMatchObject({ dryRun: true });
    delete env.npm_config_dry_run;
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("dry-run only");
  });

  it("supports a single package at the Git root without workspace configuration", async () => {
    cwd = root;
    await saveManifest();
    await writeFile(join(cwd, "deliverable.yaml"), "type: npm\n");
    await expect(checkPublishContext(cwd, env)).resolves.toEqual({
      name,
      version,
      channel: "rc",
      sha,
      dryRun: false,
    });
  });

  it("does not inherit a root declaration or accept the legacy root registry", async () => {
    await rm(join(cwd, "deliverable.yaml"));
    await writeFile(join(root, "deliverable.yaml"), "type: npm\n");
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "Declare type: npm",
    );
    await writeFile(join(root, "silvermoon.yaml"), "deliverables: []");
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("Migrate");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects short manual selectors and legacy release tags", async () => {
    env.GITHUB_REF = `refs/tags/widget-v${version}`;
    env.GITHUB_WORKFLOW_REF = `${env.GITHUB_REPOSITORY}/.github/workflows/publish-npm.yaml@${env.GITHUB_REF}`;
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("Release tag");
    env.GITHUB_EVENT_NAME = "workflow_dispatch";
    env.npm_config_dry_run = "true";
    env.PACKAGE_INPUT = "widget";
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "full npm package name",
    );
  });

  it.each([
    ["GITHUB_ACTIONS", "false", "GitHub Actions"],
    ["npm_command", "run-script", "prepublishOnly"],
    ["npm_lifecycle_event", "prepare", "prepublishOnly"],
    ["NPM_TOKEN", "test-token", "stored npm tokens"],
    ["NODE_AUTH_TOKEN", "test-token", "stored npm tokens"],
    ["ACTIONS_ID_TOKEN_REQUEST_TOKEN", "", "OIDC"],
    ["GITHUB_REPOSITORY", "../invalid", "publish-npm.yaml"],
    ["GITHUB_TOKEN", "", "GITHUB_TOKEN"],
    ["GITHUB_WORKFLOW_REF", "other-workflow", "publish-npm.yaml"],
    ["GITHUB_SHA", "b".repeat(40), "event SHA"],
    ["npm_config_registry", "https://mirror.invalid/", "publishConfig"],
    ["npm_config_access", "restricted", "publishConfig"],
    ["npm_config_tag", "latest", "publishConfig"],
    ["npm_config_provenance", "false", "publishConfig"],
    ["npm_config_force", "true", "without --force"],
    ["npm_execpath", "", "lifecycle executable"],
    ["GITHUB_REF_TYPE", "branch", "Release tag"],
    ["GITHUB_REF", "refs/tags/widget-v9.0.0", "Release tag"],
    ["GITHUB_EVENT_NAME", "pull_request", "dry-run only"],
  ])("blocks invalid %s", async (key, value, message) => {
    env[key] = value;
    if (key === "GITHUB_REF")
      env.GITHUB_WORKFLOW_REF = `${env.GITHUB_REPOSITORY}/.github/workflows/publish-npm.yaml@${value}`;
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects dirty sources, mismatching tags and non-main ancestry", async () => {
    dirty = " M src/index.ts";
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "tracked changes",
    );
    dirty = "";
    tagSha = "b".repeat(40);
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("Release tag");
    command
      .mockImplementationOnce(() => root)
      .mockImplementationOnce(() => "")
      .mockImplementationOnce(() => sha)
      .mockImplementationOnce(() => {
        throw new Error("not reachable from main");
      });
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "not reachable",
    );
  });

  it("rejects scope registry overrides instead of assuming --registry wins", async () => {
    scopeRegistry = "https://private.invalid/";
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "scope-specific registry",
    );
    scopeRegistry = registry;
    await expect(checkPublishContext(cwd, env)).resolves.toMatchObject({
      name,
    });
  });

  it.each([
    { private: true },
    { name: "@workspace/template" },
    { name: "bad name" },
    { version: "1.0.0-beta.0" },
    { version: "01.0.0" },
    { publishConfig: { registry, access: "public", provenance: false } },
    { publishConfig: { registry, access: "public", directory: "dist" } },
    { publishConfig: { registry, access: "public", tag: "latest" } },
  ])("rejects unsupported package metadata %j", async (change) => {
    Object.assign(manifest, change);
    await saveManifest();
    await expect(checkPublishContext(cwd, env)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "{}",
    "type: task-bundle",
    "type: npm\npath: .",
    "type: npm\npackageId: widget",
    "deliverables: []",
    "type: [",
    "type: npm\ntype: npm",
    "null",
  ])(
    "requires an unambiguous valid delivery declaration: %s",
    async (source) => {
      await writeFile(join(cwd, "deliverable.yaml"), source);
      await expect(checkPublishContext(cwd, env)).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});

describe("explicit workflow AND evidence", () => {
  interface Evidence {
    workflow: Record<string, unknown>;
    runs: Record<string, unknown>[];
    afterRun?: Record<string, unknown>;
    afterHistory?: Record<string, unknown>[];
    afterWorkflow?: Record<string, unknown>;
  }

  const filenames = ["ci.yaml", "release-validation.yaml"];
  let evidence: Evidence[];
  let override: ((url: string) => Response | undefined) | undefined;

  const checkWorkflows = (workflows = filenames) =>
    checkPublishContext(cwd, env, workflows);
  const requestUrls = () =>
    fetcher.mock.calls.map(([url]) => {
      if (typeof url !== "string")
        throw new Error("Expected a string request URL.");
      return url;
    });

  beforeEach(() => {
    evidence = filenames.map((filename, index) => ({
      workflow: {
        id: 11 + index,
        path: `.github/workflows/${filename}`,
        name: "Same display name",
      },
      runs: [
        {
          id: 7 + index,
          run_attempt: 2,
          workflow_id: 11 + index,
          path: `.github/workflows/${filename}`,
          repository: { full_name: env.GITHUB_REPOSITORY },
          head_repository: { full_name: env.GITHUB_REPOSITORY },
          head_sha: sha,
          head_branch: index === 0 ? "main" : "release-candidate",
          event: index === 0 ? "push" : "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
      ],
    }));
    override = undefined;
    const reads = new Map<string, number>();
    responder = (url) => {
      const overridden = override?.(url);
      if (overridden) return overridden;
      const count = reads.get(url) ?? 0;
      reads.set(url, count + 1);
      for (const [index, filename] of filenames.entries()) {
        const entry = evidence[index]!;
        const api = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions`;
        if (url === `${api}/workflows/${filename}`)
          return response(
            count > 0 && entry.afterWorkflow
              ? entry.afterWorkflow
              : entry.workflow,
          );
        if (url.startsWith(`${api}/workflows/${11 + index}/runs?`)) {
          const runs =
            count > 0 && entry.afterHistory ? entry.afterHistory : entry.runs;
          return response({ total_count: runs.length, workflow_runs: runs });
        }
        if (url.startsWith(`${api}/runs/`)) {
          const run = entry.runs.find(
            (run) => url === `${api}/runs/${String(run.id)}`,
          );
          if (run)
            return response(count > 0 && entry.afterRun ? entry.afterRun : run);
        }
      }
      if (url === `${registry}${encodeURIComponent(name)}`)
        return response({ error: "Not found" }, 404);
      if (url === `${registry}semver`) return response(dependency);
      throw new Error(`Unexpected configured-workflow request: ${url}`);
    };
  });

  it("requires both exact-SHA workflows, without restricting event/branch or inspecting jobs", async () => {
    await rm(join(root, ".github", "workflows", "ci.yaml"));
    jobs = [];
    await expect(checkWorkflows()).resolves.toMatchObject({ sha, name });
    const urls = requestUrls();
    expect(urls.some((url) => url.includes("/jobs"))).toBe(false);
    const historyUrls = urls.filter((url) => url.includes("/runs?"));
    expect(historyUrls).toHaveLength(4);
    for (const url of historyUrls) {
      const parameters = new URL(url).searchParams;
      expect(parameters.get("head_sha")).toBe(sha);
      expect(parameters.has("event")).toBe(false);
      expect(parameters.has("branch")).toBe(false);
      expect(parameters.has("status")).toBe(false);
    }
    expect(urls.slice(-2)).toEqual([
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/8`,
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/12/runs?head_sha=${sha}&per_page=100`,
    ]);
    expect(
      urls.indexOf(`${registry}semver`) <
        urls.lastIndexOf(
          `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/11/runs?head_sha=${sha}&per_page=100`,
        ),
    ).toBe(true);
  });

  it("accepts a single full workflow path and ignores display names", async () => {
    await expect(
      checkWorkflows([".github/workflows/release-validation.yaml"]),
    ).resolves.toMatchObject({ name });
    expect(
      requestUrls().some(
        (url) =>
          url.endsWith("/workflows/ci.yaml") || url.includes("/workflows/11/"),
      ),
    ).toBe(false);
  });

  it.each([
    [],
    ["ci.yaml", ".github/workflows/ci.yaml"],
    ["CI"],
    [""],
    ["ci.yaml "],
    ["../ci.yaml"],
    [".github/workflows/../ci.yaml"],
    ["ci.yaml@main"],
    ["https://github.com/owner/repo/ci.yaml"],
    ["ci\\workflow.yaml"],
    ["12"],
    [`${"a".repeat(251)}.yaml`],
    Array.from({ length: 9 }, (_, index) => `ci-${index}.yaml`),
  ])(
    "rejects invalid or duplicate requirements %j before network access",
    async (...workflows) => {
      await expect(checkWorkflows(workflows)).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("blocks missing workflow evidence even when daily CI succeeds", async () => {
    evidence[1]!.runs = [];
    await expect(checkWorkflows()).rejects.toThrow("history is missing");
    expect(requestUrls().some((url) => url.startsWith(registry))).toBe(false);
  });

  it.each([{ id: 0 }, { id: 11, path: ".github/workflows/other.yaml" }])(
    "rejects workflow metadata identity %j",
    async (change) => {
      Object.assign(evidence[1]!.workflow, change);
      await expect(checkWorkflows()).rejects.toThrow("Workflow identity");
    },
  );

  it.each([
    { head_sha: "b".repeat(40) },
    { repository: { full_name: "other/repository" } },
    { head_repository: { full_name: "fork/repository" } },
    { workflow_id: 11 },
    { path: ".github/workflows/ci.yaml" },
    { id: 0 },
    { run_attempt: 0 },
    { run_attempt: 1.5 },
  ])("rejects mismatching or invalid exact-SHA evidence %j", async (change) => {
    Object.assign(evidence[1]!.runs[0]!, change);
    await expect(checkWorkflows()).rejects.toThrow("run identity");
  });

  it.each([
    { conclusion: "failure" },
    { conclusion: "skipped" },
    { conclusion: "cancelled" },
    { conclusion: "neutral" },
    { conclusion: null },
    { status: "in_progress" },
    { status: "queued" },
  ])("blocks one unsuccessful workflow %j", async (change) => {
    Object.assign(evidence[1]!.runs[0]!, change);
    await expect(checkWorkflows()).rejects.toThrow("must have succeeded");
  });

  it("does not fall back to an old successful run when the newest run fails", async () => {
    const entry = evidence[1]!;
    entry.runs = [
      { ...entry.runs[0], id: 3 },
      { ...entry.runs[0], id: 9, conclusion: "failure" },
      { ...entry.runs[0], id: 8 },
    ];
    await expect(checkWorkflows()).rejects.toThrow("must have succeeded");
    expect(requestUrls().some((url) => url.endsWith("/runs/3"))).toBe(false);
  });

  it("blocks a mismatching run detail rather than trusting the history response", async () => {
    override = (url) =>
      url.endsWith("/runs/8")
        ? response({ ...evidence[1]!.runs[0], head_sha: "b".repeat(40) })
        : undefined;
    await expect(checkWorkflows()).rejects.toThrow("run identity");
  });

  it("rejects a rerun between history selection and the initial run read", async () => {
    override = (url) =>
      url.endsWith("/runs/8")
        ? response({ ...evidence[1]!.runs[0], run_attempt: 3 })
        : undefined;
    await expect(checkWorkflows()).rejects.toThrow("run/attempt changed");
  });

  it.each([
    { run_attempt: 3 },
    { id: 9 },
    { status: "in_progress", conclusion: null },
    { conclusion: "failure" },
  ])("rejects evidence changing during registry checks %j", async (change) => {
    evidence[0]!.afterRun = { ...evidence[0]!.runs[0], ...change };
    await expect(checkWorkflows()).rejects.toThrow();
  });

  it("blocks a newly created run even when the selected old run still succeeds", async () => {
    evidence[0]!.afterHistory = [
      ...evidence[0]!.runs,
      { ...evidence[0]!.runs[0], id: 99, conclusion: "failure" },
    ];
    await expect(checkWorkflows()).rejects.toThrow("run/attempt changed");
  });

  it("blocks an attempt change observed only by the final history read", async () => {
    evidence[1]!.afterHistory = [{ ...evidence[1]!.runs[0], run_attempt: 3 }];
    await expect(checkWorkflows()).rejects.toThrow("run/attempt changed");
  });

  it("blocks a workflow deleted and recreated under the same filename", async () => {
    evidence[1]!.afterWorkflow = { ...evidence[1]!.workflow, id: 99 };
    await expect(checkWorkflows()).rejects.toThrow("identity changed");
  });

  it.each([
    ["partial count", 2, false],
    ["duplicate runs", 2, true],
  ])("rejects %s history", async (_label, totalCount, duplicate) => {
    override = (url) =>
      url.includes("/workflows/12/runs?")
        ? response({
            total_count: totalCount,
            workflow_runs: duplicate
              ? [evidence[1]!.runs[0], evidence[1]!.runs[0]]
              : evidence[1]!.runs,
          })
        : undefined;
    await expect(checkWorkflows()).rejects.toThrow("history");
  });

  it("accepts the complete 100-run budget but refuses 101 runs", async () => {
    evidence[0]!.runs = Array.from({ length: 100 }, (_, index) => ({
      ...evidence[0]!.runs[0],
      id: 100 + index,
    }));
    await expect(checkWorkflows()).resolves.toMatchObject({ name });
    evidence[0]!.runs.push({ ...evidence[0]!.runs[0], id: 200 });
    await expect(checkWorkflows()).rejects.toThrow("history");
  });

  it.each([
    [() => response({}, 403), "HTTP 403"],
    [() => response({}, 404), "HTTP 404"],
    [
      () =>
        new Response("invalid JSON", {
          headers: { date: new Date().toUTCString() },
        }),
      "JSON",
    ],
    [
      () => response({ workflow_runs: null, total_count: 1 }),
      "Expected a list",
    ],
    [() => response({}, 200, { age: "3601" }), "freshness"],
    [
      () =>
        response({ total_count: 1, workflow_runs: [] }, 200, {
          link: '<https://api.github.com/next>; rel="next"',
        }),
      "pagination",
    ],
  ])(
    "fails closed on unavailable or incomplete workflow responses",
    async (reply, message) => {
      override = (url) =>
        url.includes("/workflows/12/runs?") ? reply() : undefined;
      await expect(checkWorkflows()).rejects.toThrow(message);
    },
  );

  it("propagates network errors in configured mode", async () => {
    fetcher.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(checkWorkflows()).rejects.toThrow("network unavailable");
  });

  it("does not waive main ancestry or manual dry-run requirements", async () => {
    env.GITHUB_EVENT_NAME = "workflow_dispatch";
    env.PACKAGE_INPUT = name;
    await expect(checkWorkflows()).rejects.toThrow("dry-run only");
    env.npm_config_dry_run = "true";
    await expect(checkWorkflows()).resolves.toMatchObject({ dryRun: true });
    command.mockImplementation((file, args) => {
      if (file !== "git") return scopeRegistry;
      if (args[1] === "--show-toplevel") return root;
      if (args[0] === "status") return "";
      if (args[1] === "HEAD^{commit}") return sha;
      throw new Error("not reachable from main");
    });
    await expect(checkWorkflows()).rejects.toThrow("not reachable from main");
  });
});

describe("exact-commit CI evidence", () => {
  it("selects the latest CI run rather than accepting an older success", async () => {
    history = { total_count: 2, workflow_runs: [{ id: 2 }, { id: 7 }] };
    run.conclusion = "failure";
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "latest exact-commit",
    );
  });

  it.each([
    { head_sha: "b".repeat(40) },
    { head_branch: "feature" },
    { event: "pull_request" },
    { path: ".github/workflows/other.yaml" },
    { status: "in_progress" },
    { conclusion: "skipped" },
    { id: 0 },
    { run_attempt: 0 },
  ])("rejects wrong or unsuccessful run %j", async (change) => {
    Object.assign(run, change);
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "latest exact-commit",
    );
  });

  it("rejects incomplete history, job pagination, missing/duplicate jobs and skipped aggregate steps", async () => {
    history.total_count = 2;
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("history");
    history.total_count = 1;
    responder = () =>
      response({ total_count: 2, jobs: [], workflow_runs: [{ id: 7 }] });
    await expect(checkPublishContext(cwd, env)).rejects.toThrow();
    responder = undefined;
    jobs.pop();
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "Required CI job",
    );
    jobs.push({ ...jobs[0] });
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("uniquely");
    jobs.pop();
    jobs.push({
      name: "Release verification (v1)",
      status: "completed",
      conclusion: "success",
      steps: [],
    });
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "confirmation step",
    );
  });

  it("rejects a rerun starting during verification", async () => {
    after = { ...run, run_attempt: 2 };
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "attempt changed",
    );
  });

  it.each([
    "[22.15.0]",
    "[22.15.0, 22.15.0]",
    "[lts, 24.11.1]",
    "[22.15.0, 24.0.0-rc.0]",
  ])("rejects an unsupported CI matrix %s", async (nodes) => {
    await writeFile(
      join(root, ".github", "workflows", "ci.yaml"),
      `jobs:\n  compatibility:\n    strategy:\n      matrix:\n        node-version: ${nodes}\n`,
    );
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "Node versions",
    );
  });
});

describe("registry eligibility and trustworthy responses", () => {
  it("accepts contiguous RC history and published runtime, optional and peer dependencies", async () => {
    manifest.version = "0.1.0-rc.2";
    manifest.optionalDependencies = { semver: "^7.0.0" };
    manifest.peerDependencies = { semver: "^7.0.0" };
    metadata = published(["0.0.0", "0.1.0-rc.1", "0.1.0-rc.0"]);
    env.GITHUB_REF = `refs/tags/${name}@0.1.0-rc.2`;
    env.GITHUB_WORKFLOW_REF = `${env.GITHUB_REPOSITORY}/.github/workflows/publish-npm.yaml@${env.GITHUB_REF}`;
    await saveManifest();
    await expect(checkPublishContext(cwd, env)).resolves.toMatchObject({
      version: "0.1.0-rc.2",
    });
  });

  it("supports stable unscoped packages on latest without dependencies", async () => {
    manifest.name = "widget";
    manifest.version = "1.0.0";
    delete manifest.dependencies;
    env.npm_config_tag = "latest";
    env.GITHUB_REF = "refs/tags/widget@1.0.0";
    env.GITHUB_WORKFLOW_REF = `${env.GITHUB_REPOSITORY}/.github/workflows/publish-npm.yaml@${env.GITHUB_REF}`;
    await saveManifest();
    responder = (url) => {
      if (url.includes("/workflows/")) return response(history);
      if (url.includes("/jobs?"))
        return response({ total_count: jobs.length, jobs });
      if (url.includes("/runs/")) return response(run);
      return response({ error: "Not found" }, 404);
    };
    await expect(checkPublishContext(cwd, env)).resolves.toMatchObject({
      channel: "latest",
    });
    responder = (url) => {
      if (url.includes("/workflows/")) return response(history);
      if (url.includes("/jobs?"))
        return response({ total_count: jobs.length, jobs });
      if (url.includes("/runs/")) return response(run);
      return response({ ...published(["0.0.0"]), name: "widget" });
    };
    await expect(checkPublishContext(cwd, env)).resolves.toMatchObject({
      channel: "latest",
    });
  });

  it.each([
    ["already published", published([version]), "already exists"],
    [
      "missing timestamps",
      { name, versions: {}, time: {} },
      "history is incomplete",
    ],
    [
      "unpublished history",
      {
        name,
        versions: {},
        time: { created: "x", modified: "x", unpublished: true },
      },
      "history is incomplete",
    ],
    [
      "wrong identity",
      { ...published([]), name: "other" },
      "identity mismatch",
    ],
    ["RC gap", published(["0.1.0-rc.1"]), "contiguous"],
    ["malformed RC", published(["0.1.0-rc.bad"]), "Invalid RC"],
    [
      "missing version data",
      { ...published(["0.1.0-rc.0"]), versions: {} },
      "history is incomplete",
    ],
  ])("rejects %s", async (_label, value, message) => {
    metadata = value;
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(message);
  });

  it("requires rc.0 for a new package", async () => {
    manifest.version = "0.1.0-rc.1";
    env.GITHUB_REF = `refs/tags/${name}@0.1.0-rc.1`;
    env.GITHUB_WORKFLOW_REF = `${env.GITHUB_REPOSITORY}/.github/workflows/publish-npm.yaml@${env.GITHUB_REF}`;
    await saveManifest();
    await expect(checkPublishContext(cwd, env)).rejects.toThrow("First RC");
  });

  it.each([
    "catalog:",
    "workspace:*",
    "file:../other",
    "npm:other@1",
    "latest",
    "not a range",
  ])("rejects unresolved dependency range %s", async (range) => {
    manifest.dependencies = { semver: range };
    await saveManifest();
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "registry SemVer range",
    );
  });

  it("rejects missing and incompatible dependency versions", async () => {
    dependency = null;
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "already be published",
    );
    dependency = { name: "semver", versions: { "6.0.0": {} } };
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "already be published",
    );
  });

  it.each([
    [() => response({}, 403), "HTTP 403"],
    [() => response({ error: "permission denied" }, 404), "HTTP 404"],
    [() => response({}, 200, { date: "invalid" }), "freshness"],
    [() => response({}, 200, { age: "3601" }), "freshness"],
    [() => response({}, 200, { date: new Date(0).toUTCString() }), "freshness"],
    [
      () => new Response(null, { headers: { date: new Date().toUTCString() } }),
      "body is missing",
    ],
    [() => response(null), "Expected an object"],
    [
      () =>
        new Response("not JSON", {
          headers: { date: new Date().toUTCString() },
        }),
      "JSON",
    ],
  ])("fails explicitly for unusable API responses", async (reply, message) => {
    responder = reply;
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(message);
  });

  it("does not interpret registry failures as absence", async () => {
    fetcher.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "network unavailable",
    );
    responder = (url) => {
      if (url.includes("/workflows/")) return response(history);
      if (url.includes("/jobs?"))
        return response({ total_count: jobs.length, jobs });
      if (url.includes("/runs/")) return response(run);
      return response({ error: "permission denied" }, 404);
    };
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "Unconfirmed registry absence",
    );
  });

  it("enforces the 16MiB response budget before parsing oversized content", async () => {
    responder = () =>
      new Response(new Uint8Array(16_777_217), {
        headers: { date: new Date().toUTCString() },
      });
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "exceeds 16MiB",
    );
  });

  it("accepts 64 dependency declarations and refuses a 65th query", async () => {
    const dependencies = Object.fromEntries(
      Array.from({ length: 64 }, (_, index) => [`module-${index}`, "^1.0.0"]),
    );
    manifest.dependencies = dependencies;
    await saveManifest();
    responder = (url) => {
      if (url.includes("/workflows/")) return response(history);
      if (url.includes("/jobs?"))
        return response({ total_count: jobs.length, jobs });
      if (url.includes("/runs/")) return response(run);
      const requested = decodeURIComponent(new URL(url).pathname.slice(1));
      if (requested === name) return response({ error: "Not found" }, 404);
      return response({ name: requested, versions: { "1.0.0": {} } });
    };
    await expect(checkPublishContext(cwd, env)).resolves.toMatchObject({
      name,
    });
    manifest.peerDependencies = { "module-64": "^1.0.0" };
    await saveManifest();
    await expect(checkPublishContext(cwd, env)).rejects.toThrow(
      "budget exceeded",
    );
    expect(
      fetcher.mock.calls.some(
        ([url]) => typeof url === "string" && url.endsWith("module-64"),
      ),
    ).toBe(false);
  });
});
