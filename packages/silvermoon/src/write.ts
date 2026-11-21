import { randomBytes } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  SilvermoonError,
  canonical,
  digest,
  idea,
  invariant,
  language,
  newIdeaId,
  parseEvents,
  validateAppend,
  type Bootstrap,
  type Event,
  type Idea,
} from "./domain.js";
import {
  absent,
  draftChanges,
  primary,
  protectedPath,
  readProject,
  readRegular,
  git,
  selectIdea,
  snapshotDigest,
  observedIdeaState,
  localContext,
  localIdeaState,
  type Project,
} from "./repository.js";

async function transaction<T>(
  root: string,
  action: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const path = join(root, ".silvermoon", ".new.lock");
  await protectedPath(root, path, true);
  const token = `${process.pid}:${randomBytes(16).toString("hex")}\n`;
  let lock;
  try {
    lock = await open(path, "wx");
  } catch (cause) {
    throw new SilvermoonError(
      "locked",
      `Cannot acquire exclusive Silvermoon transaction lock; inspect the owning process before recovery: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  try {
    await lock.writeFile(token);
    await lock.sync();
    signal?.throwIfAborted();
    return await action();
  } finally {
    await lock.close();
    invariant(
      new TextDecoder().decode(await readRegular(path)) === token,
      "lock-changed",
      "Lock ownership changed; refusing to remove it.",
    );
    await rm(path);
  }
}
async function exclusiveWrite(path: string, bytes: string): Promise<void> {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function createIdea(
  root: string,
  cid: string,
  options: {
    readonly language?: string;
    readonly now?: () => Date;
    readonly random?: () => Uint8Array;
    readonly signal?: AbortSignal;
    readonly refresh?: boolean;
    readonly localRemote?: string;
  } = {},
): Promise<{
  readonly id: string;
  readonly checkCid: string;
  readonly path: string;
}> {
  if (options.language !== undefined) language(options.language);
  return transaction(
    root,
    async () => {
      const project = await readProject(root, "worktree", options.signal);
      const observed = await primary(project, {
        fetch: options.refresh ?? true,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.localRemote ? { localRemote: options.localRemote } : {}),
      });
      invariant(
        observed.changes.every((path) => path === ".silvermoon/.new.lock") &&
          observed.head === observed.tip,
        "repository",
        "Creation requires a clean branch synchronized with configured primary.",
      );
      const before = snapshotDigest(project);
      const base = join(root, ".silvermoon", "i");
      await protectedPath(root, join(base, ".path-check"), true);
      await mkdir(base, { recursive: true });
      const now = options.now?.() ?? new Date();
      for (let attempt = 0; attempt < 16; attempt++) {
        options.signal?.throwIfAborted();
        const id = newIdeaId(now, options.random);
        const path = join(base, id);
        try {
          await mkdir(path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
          throw error;
        }
        try {
          const bootstrap: Bootstrap = {
            version: 1,
            id,
            checkCid: cid,
            createdAt: now.toISOString(),
          };
          const created: Event = {
            version: 1,
            id: randomBytes(16).toString("hex"),
            at: bootstrap.createdAt,
            type: "created",
            idea: id,
            checkCid: cid,
            ...(options.language ? { language: options.language } : {}),
          };
          const files = new Map<string, Uint8Array>();
          const scaffold: Record<string, string> = {
            "idea.json": canonical(bootstrap) + "\n",
            "events.jsonl": canonical(created) + "\n",
            "requirements/Spec.md":
              "# Requirements\n\nDescribe the problem, intended outcome, examples, and boundaries before requesting signoff.\n",
            "technical/research.md":
              "# Research questions\n\nRecord the questions and human focus before research-scope signoff.\n",
            "technical/Spec.md":
              "# Technical specification\n\nDocument the complete researched decisions and supplementary design before signoff.\n",
            "tests/Spec.md":
              "# Test specification\n\nSpecify prerequisites, operations, expected outcomes and evidence for each approved case before signoff.\n",
            "tests/cases.json":
              canonical({
                version: 1,
                cases: [
                  {
                    id: "I-01",
                    phase: "implementation",
                  },
                  {
                    id: "D-01",
                    phase: "deployment",
                  },
                ],
              }) + "\n",
          };
          for (const [file, content] of Object.entries(scaffold))
            files.set(file, Buffer.from(content));
          idea(files, id);
          for (const directory of [
            "requirements",
            "technical",
            "tests",
            "evidence/deployment",
          ])
            await mkdir(join(path, directory), { recursive: true });
          for (const [file, content] of Object.entries(scaffold))
            await exclusiveWrite(join(path, file), content);
          options.signal?.throwIfAborted();
          const after = await readProject(root, "worktree", options.signal);
          const without = new Map(
            [...after.files].filter(
              ([file]) => !file.startsWith(`.silvermoon/i/${id}/`),
            ),
          );
          invariant(
            snapshotDigest({ ...after, files: without }) === before,
            "concurrent-edit",
            "Project changed during creation; owned scaffold was not retained.",
          );
          return { id, checkCid: cid, path };
        } catch (error) {
          await rm(path, { recursive: true, force: true });
          throw error;
        }
      }
      throw new SilvermoonError(
        "collision",
        "Idea ID collision retry limit (16) exhausted; no existing Idea was overwritten.",
      );
    },
    options.signal,
  );
}
export interface AppendOptions {
  readonly expectedDigest: string;
  readonly expectedPrimary: string;
  readonly confirmed?: boolean;
  readonly signal?: AbortSignal;
  readonly refresh?: boolean;
  readonly localRemote?: string;
}
function sameRetry(current: Idea, event: Event, expected: string): boolean {
  const last = current.events.at(-1);
  if (!last || canonical(last) !== canonical(event)) return false;
  const prefix = current.eventSource.slice(0, -canonical(last).length - 1);
  return digest(prefix) === expected;
}
export async function appendEvent(
  root: string,
  selector: string,
  event: Event,
  options: AppendOptions,
): Promise<{ readonly digest: string; readonly idempotent: boolean }> {
  return transaction(
    root,
    async () => {
      const project = await readProject(root, "worktree", options.signal);
      const current = selectIdea(project, selector);
      const observed = await primary(project, {
        fetch: options.refresh ?? true,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.localRemote ? { localRemote: options.localRemote } : {}),
      });
      invariant(
        options.expectedPrimary === observed.tip,
        "primary-conflict",
        "Expected primary changed; reobserve instead of replaying a stale decision.",
      );
      if (digest(current.eventSource) !== options.expectedDigest) {
        invariant(
          sameRetry(current, event, options.expectedDigest),
          "digest-conflict",
          "Event digest changed; no facts were overwritten.",
        );
        return { digest: digest(current.eventSource), idempotent: true };
      }
      const state = await observedIdeaState(
        project,
        current,
        {
          head: observed.head,
          primary: observed.project,
        },
        undefined,
        options.signal,
      );
      const changes = observed.changes.filter(
        (path) => path !== ".silvermoon/.new.lock",
      );
      invariant(
        draftChanges(changes, current.bootstrap.id, state.level),
        "repository",
        "Mixed/unrelated worktree changes block this write.",
      );
      if (event.type === "verify")
        invariant(
          "batch" in event
            ? event.batch.subject === observed.head
            : event.phase !== "implementation" || event.rev === observed.head,
          "evidence",
          "A new batch must bind the current exact Git HEAD.",
        );
      validateAppend(current, event, state, options.confirmed ?? false);
      const candidate = current.eventSource + canonical(event) + "\n";
      parseEvents(candidate, current.bootstrap);
      const updatedFiles = new Map(current.files);
      updatedFiles.set("events.jsonl", Buffer.from(candidate));
      const ideas = new Map(project.ideas);
      ideas.set(current.bootstrap.id, idea(updatedFiles, current.bootstrap.id));
      validateAliases({ ...project, ideas });
      const before = snapshotDigest(project);
      const path = join(
        root,
        ".silvermoon",
        "i",
        current.bootstrap.id,
        "events.jsonl",
      );
      await protectedPath(root, path);
      const temporary = join(
        root,
        ".silvermoon",
        `.event-${randomBytes(8).toString("hex")}`,
      );
      try {
        await exclusiveWrite(temporary, candidate);
        options.signal?.throwIfAborted();
        invariant(
          digest(await readRegular(path, options.signal)) ===
            options.expectedDigest,
          "concurrent-edit",
          "Event file changed during transaction.",
        );
        const latest = await readProject(root, "worktree", options.signal);
        invariant(
          snapshotDigest(latest) === before,
          "concurrent-edit",
          "Candidate changed while appending; the decision was not recorded.",
        );
        invariant(
          (await git(root, ["rev-parse", "HEAD"], options.signal)) ===
            observed.head,
          "concurrent-edit",
          "Git HEAD changed while appending.",
        );
        options.signal?.throwIfAborted();
        await rename(temporary, path);
      } finally {
        if (!(await absent(temporary))) await rm(temporary);
      }
      return { digest: digest(candidate), idempotent: false };
    },
    options.signal,
  );
}
function validateAliases(project: Project): void {
  const aliases = [...project.ideas.values()].flatMap((idea) => {
    const event = idea.events.findLast((event) => event.type === "setAlias");
    return event?.type === "setAlias" && event.alias ? [event.alias] : [];
  });
  invariant(
    new Set(aliases).size === aliases.length,
    "alias",
    "Alias is already used by another new Idea.",
  );
}
export async function replay(
  root: string,
  selector: string,
  cursor?: string,
  preference?: string,
): Promise<unknown> {
  const project = await readProject(root);
  const current = selectIdea(project, selector);
  let offset = 0;
  if (cursor) {
    const match = /^([0-9]+):(sha256:[a-f0-9]{64})$/.exec(cursor);
    invariant(match, "cursor", "Malformed replay cursor.");
    offset = Number(match[1]);
    invariant(
      Number.isSafeInteger(offset) &&
        offset <= current.events.length &&
        digest(
          current.events.slice(0, offset).map(canonical).join("\n") +
            (offset ? "\n" : ""),
        ) === match[2],
      "cursor",
      "Cursor does not identify an exact observed prefix.",
    );
  }
  const context = await localContext(project);
  const state = await localIdeaState(project, current, context, preference);
  return {
    idea: current.bootstrap.id,
    checkCid: current.bootstrap.checkCid,
    digest: digest(current.eventSource),
    cursor: `${current.events.length}:${digest(current.eventSource)}`,
    events: current.events.slice(offset),
    state,
    observation: context.observation,
  };
}
