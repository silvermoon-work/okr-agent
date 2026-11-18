import { execFile } from "node:child_process";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { gitEnvironment } from "./git-context.js";
import {
  SilvermoonError,
  digest,
  idea,
  ideaFacts,
  invariant,
  language,
  maxBytes,
  projectConfig,
  requiredText,
  repositoryIdentity,
  reduce,
  safeRelative,
  validIdeaId,
  type Files,
  type Idea,
  type ProjectConfig,
  type State,
} from "./domain.js";

const execute = promisify(execFile);
export type Snapshot = string;
export interface Project {
  readonly root: string;
  readonly files: Files;
  readonly config: ProjectConfig;
  readonly ideas: ReadonlyMap<string, Idea>;
}
export async function git(
  root: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  const { stdout } = await execute(
    "git",
    [
      "--no-pager",
      "-c",
      "core.quotepath=false",
      "-c",
      "core.fsmonitor=false",
      "-c",
      `core.hooksPath=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
      "-c",
      "diff.external=",
      "-c",
      "core.sshCommand=ssh",
      "-c",
      "credential.helper=",
      "-c",
      "core.askPass=",
      "-c",
      "protocol.ext.allow=never",
      ...args,
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: maxBytes,
      timeout: 30_000,
      env: gitEnvironment(),
      ...(signal ? { signal } : {}),
    },
  );
  return stdout.trimEnd();
}
export async function absent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}
export async function regular(path: string, directory = false): Promise<void> {
  const stat = await lstat(path);
  invariant(
    !stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()),
    "path",
    `Expected a regular ${directory ? "directory" : "file"}: ${path}`,
  );
}
export async function protectedPath(
  root: string,
  path: string,
  allowMissing = false,
): Promise<void> {
  const target = resolve(path);
  const rel = relative(root, target);
  invariant(
    rel && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel),
    "path",
    "Path escapes the selected project.",
  );
  let current = root;
  const parts = rel.split(sep);
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    if (allowMissing && (await absent(current))) return;
    await regular(current, index < parts.length - 1);
  }
}
export async function readRegular(
  path: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  await regular(path);
  const handle = await open(path, "r");
  try {
    const before = await handle.stat({ bigint: true });
    invariant(
      before.isFile() && before.size <= BigInt(maxBytes),
      "capacity",
      "Invalid or oversized regular file.",
    );
    signal?.throwIfAborted();
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    invariant(
      before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs,
      "concurrent-edit",
      `File changed while reading: ${path}`,
    );
    await regular(path);
    return bytes;
  } finally {
    await handle.close();
  }
}
async function worktree(root: string, signal?: AbortSignal): Promise<Files> {
  const files = new Map<string, Uint8Array>();
  const config = join(root, ".silvermoon", "config.yaml");
  await protectedPath(root, config);
  files.set(".silvermoon/config.yaml", await readRegular(config, signal));
  const base = join(root, ".silvermoon", "i");
  if (await absent(base)) return files;
  await regular(base, true);
  let total = 0;
  const walk = async (directory: string, path: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      signal?.throwIfAborted();
      const child = `${path}/${entry.name}`;
      invariant(
        safeRelative(child) && !entry.isSymbolicLink(),
        "path",
        `Unsafe new Idea path: ${child}`,
      );
      if (entry.isDirectory()) await walk(join(directory, entry.name), child);
      else {
        invariant(
          files.size < 2048,
          "capacity",
          "Snapshot exceeds 2048 files.",
        );
        const bytes = await readRegular(join(directory, entry.name), signal);
        total += bytes.byteLength;
        invariant(total <= maxBytes, "capacity", "Snapshot exceeds 16 MiB.");
        files.set(child, bytes);
      }
    }
  };
  await walk(base, ".silvermoon/i");
  return files;
}
async function gitSnapshot(
  root: string,
  snapshot: string,
  signal?: AbortSignal,
): Promise<Files> {
  invariant(
    snapshot === "staged" ||
      snapshot === "HEAD" ||
      /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(snapshot),
    "snapshot",
    "Use HEAD, --staged, --worktree or an exact commit ID.",
  );
  const args =
    snapshot === "staged"
      ? [
          "ls-files",
          "--stage",
          "-z",
          "--",
          ".silvermoon/config.yaml",
          ".silvermoon/i",
        ]
      : [
          "ls-tree",
          "-r",
          "-z",
          snapshot,
          "--",
          ".silvermoon/config.yaml",
          ".silvermoon/i",
        ];
  const entries = (await git(root, args, signal)).split("\0").filter(Boolean);
  invariant(entries.length <= 2048, "capacity", "Snapshot exceeds 2048 files.");
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const entry of entries) {
    const match = /^(100644|100755) (?:blob )?([a-f0-9]+)(?: 0)?\t(.+)$/.exec(
      entry,
    );
    invariant(
      match,
      "path",
      "Snapshot includes a link, conflict or nonregular path.",
    );
    const [, , object, path] = match;
    invariant(
      path && object && safeRelative(path),
      "path",
      "Invalid snapshot path.",
    );
    const { stdout } = await execute("git", ["cat-file", "blob", object], {
      cwd: root,
      encoding: "buffer",
      maxBuffer: maxBytes,
      timeout: 30_000,
      ...(signal ? { signal } : {}),
    });
    total += stdout.byteLength;
    invariant(total <= maxBytes, "capacity", "Snapshot exceeds 16 MiB.");
    files.set(path, stdout);
  }
  return files;
}
export async function readProject(
  root: string,
  snapshot: Snapshot = "worktree",
  signal?: AbortSignal,
): Promise<Project> {
  invariant(
    isAbsolute(root) && resolve(root) === root,
    "root",
    "Target root must be an absolute normalized path.",
  );
  await regular(root, true);
  invariant(
    (await realpath(root)).toLowerCase() === root.toLowerCase(),
    "path",
    "Project root cannot be redirected.",
  );
  const top = await git(root, ["rev-parse", "--show-toplevel"], signal);
  invariant(
    resolve(top).toLowerCase() === root.toLowerCase(),
    "root",
    "Select the repository root, not a subdirectory.",
  );
  const files =
    snapshot === "worktree"
      ? await worktree(root, signal)
      : await gitSnapshot(root, snapshot, signal);
  const config = projectConfig(requiredText(files, ".silvermoon/config.yaml"));
  const grouped = new Map<string, Map<string, Uint8Array>>();
  for (const [path, bytes] of files) {
    if (path === ".silvermoon/config.yaml") continue;
    const [, , id, ...tail] = path.split("/");
    invariant(
      id && validIdeaId(id) && tail.length,
      "layout",
      `Invalid new Idea path: ${path}`,
    );
    let group = grouped.get(id);
    if (!group) {
      group = new Map();
      grouped.set(id, group);
    }
    group.set(tail.join("/"), bytes);
  }
  const ideas = new Map(
    [...grouped].map(([id, files]) => [id, idea(files, id)]),
  );
  const aliases = [...ideas.values()].flatMap((idea) => {
    const event = idea.events.findLast((event) => event.type === "setAlias");
    return event?.type === "setAlias" && event.alias ? [event.alias] : [];
  });
  invariant(
    new Set(aliases).size === aliases.length,
    "alias",
    "New Idea aliases must be unique.",
  );
  return { root, files, config, ideas };
}
export function selectIdea(project: Project, selector: string): Idea {
  const found =
    project.ideas.get(selector) ??
    [...project.ideas.values()].find((idea) => {
      const event = idea.events.findLast((event) => event.type === "setAlias");
      return event?.type === "setAlias" && event.alias === selector;
    });
  invariant(
    found,
    "selector",
    "No matching new Idea; archived .silvermoon/ideas is never read.",
  );
  return found;
}
export function snapshotDigest(project: Project): string {
  return digest(
    [...project.files]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([path, bytes]) => `${path}\0${digest(bytes)}\n`)
      .join(""),
  );
}
export interface Primary {
  readonly head: string;
  readonly tip: string;
  readonly remote: string;
  readonly project: Project;
  readonly changes: readonly string[];
}
export async function primary(
  project: Project,
  options: { fetch?: boolean; signal?: AbortSignal; localRemote?: string } = {},
): Promise<Primary> {
  const { root, config } = project;
  const signal = options.signal;
  const head = await git(root, ["rev-parse", "--verify", "HEAD"], signal);
  const branch = await git(root, ["symbolic-ref", "--short", "HEAD"], signal);
  const remote = await git(
    root,
    ["config", "--get", `branch.${branch}.remote`],
    signal,
  );
  const merge = await git(
    root,
    ["config", "--get", `branch.${branch}.merge`],
    signal,
  );
  invariant(
    remote &&
      remote !== "." &&
      !remote.startsWith("-") &&
      merge === `refs/heads/${config.primaryBranch}`,
    "primary",
    "Branch upstream must identify the configured primary branch.",
  );
  const url = await git(root, ["remote", "get-url", remote], signal);
  invariant(
    repositoryIdentity(url) === config.primaryRepository ||
      (!!options.localRemote && resolve(url) === resolve(options.localRemote)),
    "primary",
    "Upstream remote does not identify configured primaryRepository.",
  );
  if (options.fetch)
    await git(
      root,
      [
        "fetch",
        "--no-tags",
        "--",
        remote,
        `refs/heads/${config.primaryBranch}`,
      ],
      signal,
    );
  const tip = await git(
    root,
    [
      "rev-parse",
      "--verify",
      options.fetch ? "FETCH_HEAD" : `${remote}/${config.primaryBranch}`,
    ],
    signal,
  );
  await git(root, ["merge-base", "--is-ancestor", tip, head], signal);
  const committed = await readProject(root, tip, signal);
  invariant(
    project.config.primaryRepository === committed.config.primaryRepository &&
      project.config.primaryBranch === committed.config.primaryBranch,
    "primary",
    "Primary configuration changes require explicit review outside this protocol.",
  );
  for (const [id, past] of committed.ideas) {
    const current = project.ideas.get(id);
    invariant(
      current &&
        JSON.stringify(current.bootstrap) === JSON.stringify(past.bootstrap) &&
        current.eventSource.startsWith(past.eventSource),
      "history",
      "Primary Idea identity/history must be preserved as an exact append-only prefix.",
    );
  }
  const status = await git(
    root,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    signal,
  );
  const records = status.split("\0").filter(Boolean);
  invariant(
    records.every(
      (entry) =>
        !/^(?:.. )?$/.test(entry) &&
        !/[RU?]/.test(entry.slice(0, 2).replaceAll("?", "")),
    ),
    "git-status",
    "Renames, conflicts or unmerged paths require explicit repair.",
  );
  const changes = records.map((entry) => entry.slice(3).replaceAll("\\", "/"));
  return { head, tip, remote, project: committed, changes };
}
export async function validSubjects(
  root: string,
  current: Idea,
  head: string,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const subjects = [
    ...new Set(
      current.events.flatMap((event) =>
        event.type === "verify" ? [event.batch.subject] : [],
      ),
    ),
  ];
  invariant(
    subjects.length <= 64,
    "capacity",
    "Evidence history exceeds 64 distinct subjects.",
  );
  const accepted: string[] = [head];
  for (const subject of subjects) {
    if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(subject)) continue;
    try {
      await git(root, ["merge-base", "--is-ancestor", subject, head], signal);
      const diff = await git(
        root,
        [
          "diff",
          "--name-only",
          subject,
          head,
          "--",
          ".",
          `:(exclude).silvermoon/i/${current.bootstrap.id}/**`,
        ],
        signal,
      );
      if (!diff) accepted.push(subject);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof SilvermoonError) throw error;
    }
  }
  return accepted;
}
export async function observedIdeaState(
  project: Project,
  current: Idea,
  context: { readonly head: string; readonly primary: Project },
  preference?: string,
  signal?: AbortSignal,
): Promise<State> {
  const past = context.primary.ideas.get(current.bootstrap.id);
  return reduce(current, {
    head: context.head,
    ...(past ? { primary: past } : {}),
    ...(project.config.preferredLanguage
      ? { projectLanguage: project.config.preferredLanguage }
      : {}),
    ...(preference ? { userLanguage: language(preference) } : {}),
    subjects: await validSubjects(project.root, current, context.head, signal),
  });
}
export type LocalState =
  State | (ReturnType<typeof ideaFacts> & { readonly level: "unknown" });
export interface LocalContext {
  readonly head?: string;
  readonly primary?: Project;
  readonly observation: {
    readonly scope: "local";
    readonly fresh: false;
    readonly head?: string;
    readonly primary:
      | {
          readonly status: "available";
          readonly tip: string;
          readonly remote: string;
          readonly ref: string;
        }
      | { readonly status: "unavailable"; readonly diagnostic: string };
  };
}
export async function localContext(
  project: Project,
  signal?: AbortSignal,
): Promise<LocalContext> {
  let head: string | undefined;
  try {
    head = await git(project.root, ["rev-parse", "--verify", "HEAD"], signal);
    const refs = (
      await git(
        project.root,
        ["for-each-ref", "--format=%(refname)", "refs/remotes"],
        signal,
      )
    ).split("\n");
    const candidates: { tip: string; remote: string; ref: string }[] = [];
    for (const ref of refs) {
      const match = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(ref);
      if (!match || match[2] !== project.config.primaryBranch) continue;
      const remote = match[1]!;
      const url = await git(
        project.root,
        ["remote", "get-url", remote],
        signal,
      );
      if (repositoryIdentity(url) !== project.config.primaryRepository)
        continue;
      candidates.push({
        tip: await git(project.root, ["rev-parse", "--verify", ref], signal),
        remote,
        ref,
      });
    }
    const [tracked] = candidates;
    invariant(
      tracked,
      "local-primary",
      "No local remote-tracking ref matches configured primary; fetch it explicitly before relying on lifecycle state.",
    );
    invariant(
      candidates.every((candidate) => candidate.tip === tracked.tip),
      "local-primary",
      "Matching primary tracking refs disagree; refresh/reconcile them explicitly.",
    );
    const primary = await readProject(project.root, tracked.tip, signal);
    return {
      head,
      primary,
      observation: {
        scope: "local",
        fresh: false,
        head,
        primary: { status: "available", ...tracked },
      },
    };
  } catch (error) {
    signal?.throwIfAborted();
    return {
      ...(head ? { head } : {}),
      observation: {
        scope: "local",
        fresh: false,
        ...(head ? { head } : {}),
        primary: {
          status: "unavailable",
          diagnostic: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
}
export async function localIdeaState(
  project: Project,
  current: Idea,
  context: LocalContext,
  preference?: string,
  signal?: AbortSignal,
): Promise<LocalState> {
  if (context.head && context.primary)
    return observedIdeaState(
      project,
      current,
      { head: context.head, primary: context.primary },
      preference,
      signal,
    );
  return {
    ...ideaFacts(current, {
      ...(project.config.preferredLanguage
        ? { projectLanguage: project.config.preferredLanguage }
        : {}),
      ...(preference ? { userLanguage: language(preference) } : {}),
    }),
    level: "unknown",
  };
}
export async function snapshotHistory(
  project: Project,
  snapshot: string,
  signal?: AbortSignal,
): Promise<void> {
  const refs = (
    await git(
      project.root,
      ["for-each-ref", "--format=%(refname)", "refs/remotes"],
      signal,
    )
  ).split("\n");
  let tip: string | undefined;
  for (const ref of refs) {
    const match = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(ref);
    if (!match || match[2] !== project.config.primaryBranch) continue;
    const url = await git(
      project.root,
      ["remote", "get-url", match[1]!],
      signal,
    );
    if (repositoryIdentity(url) === project.config.primaryRepository) {
      tip = await git(project.root, ["rev-parse", ref], signal);
      break;
    }
  }
  if (!tip) {
    invariant(
      !project.ideas.size,
      "history",
      "Configured primary history is unavailable; establish/fetch its tracking reference explicitly.",
    );
    return;
  }
  const past = await readProject(project.root, tip, signal);
  let historical = false;
  if (snapshot !== "worktree" && snapshot !== "staged") {
    try {
      await git(
        project.root,
        ["merge-base", "--is-ancestor", snapshot, tip],
        signal,
      );
      historical = true;
    } catch {
      signal?.throwIfAborted();
    }
  }
  for (const [id, before] of past.ideas) {
    const current = project.ideas.get(id);
    if (!current && historical) continue;
    invariant(
      current &&
        JSON.stringify(current.bootstrap) ===
          JSON.stringify(before.bootstrap) &&
        (current.eventSource.startsWith(before.eventSource) ||
          (historical && before.eventSource.startsWith(current.eventSource))),
      "history",
      "Snapshot rewrites primary Idea identity or append-only event history.",
    );
  }
}
export async function remoteTip(
  root: string,
  signal?: AbortSignal,
): Promise<string> {
  invariant(
    (await discoverRoot(root)) === root,
    "root",
    "Select the repository root before fetching.",
  );
  const path = join(root, ".silvermoon", "config.yaml");
  await protectedPath(root, path);
  const config = projectConfig(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readRegular(path, signal),
    ),
  );
  const remotes = (await git(root, ["remote"], signal))
    .split("\n")
    .filter(Boolean);
  for (const remote of remotes) {
    const url = await git(root, ["remote", "get-url", remote], signal);
    if (repositoryIdentity(url) !== config.primaryRepository) continue;
    await git(
      root,
      [
        "fetch",
        "--no-tags",
        "--",
        remote,
        `refs/heads/${config.primaryBranch}`,
      ],
      signal,
    );
    return git(root, ["rev-parse", "--verify", "FETCH_HEAD"], signal);
  }
  throw new SilvermoonError(
    "primary",
    "No configured remote identifies primaryRepository.",
  );
}
export function draftChanges(
  changes: readonly string[],
  id: string,
  level: string,
): boolean {
  const prefix = `.silvermoon/i/${id}/`;
  const ranges: Record<string, readonly string[]> = {
    requirements: ["requirements/"],
    research: ["technical/research.md"],
    technical: ["technical/"],
    cases: ["tests/cases.json"],
    tests: ["tests/"],
    synchronization: ["requirements/", "technical/", "tests/"],
    implementation: ["evidence/implementation/"],
    deployment: ["evidence/implementation/", "evidence/deployment/"],
    completed: ["evidence/implementation/", "evidence/deployment/"],
    abandoned: [],
  };
  return changes.every(
    (path) =>
      path.startsWith(prefix) &&
      (["events.jsonl", "idea.json"].includes(path.slice(prefix.length)) ||
        (ranges[level] ?? []).some((range) =>
          path.slice(prefix.length).startsWith(range),
        )),
  );
}
export async function discoverRoot(cwd: string): Promise<string | undefined> {
  try {
    return resolve(await git(cwd, ["rev-parse", "--show-toplevel"]));
  } catch {
    return undefined;
  }
}
export async function ensureParent(root: string, path: string): Promise<void> {
  await protectedPath(root, join(dirname(path), ".path-check"), true);
}
