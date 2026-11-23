import { randomBytes } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { CID } from "multiformats/cid";
import {
  SilvermoonError,
  canonical,
  digest,
  invariant,
  language,
  newIdeaId,
  type Event,
} from "./domain.js";
import {
  checkpoints,
  eventSchemaCid,
  flatIdea,
  isFlatIdea,
  jcs,
  type FlatEvent,
} from "./flat.js";
import {
  primary,
  protectedPath,
  readProject,
  readRegular,
  selectIdea,
  snapshotDigest,
  localContext,
  localIdeaState,
  git,
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
  readonly eventSchemaCid: string;
  readonly path: string;
}> {
  if (options.language !== undefined) language(options.language);
  CID.parse(cid);
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
          const created: FlatEvent = {
            at: now.toISOString(),
            type: "created",
            idea: id,
            eventSchemaCid,
            ...(options.language ? { language: options.language } : {}),
          };
          const files = new Map<string, Uint8Array>();
          const scaffold: Record<string, string> = {
            "events.jsonl": jcs(created) + "\n",
            "requirements/Spec.md":
              "# Requirements\n\nDescribe the problem, outcome, boundaries and acceptance criteria.\n",
            "research-scope/Spec.md":
              "# Research scope\n\nIdentify questions, risks and facts to investigate.\n",
            "technical-spec/Spec.md":
              "# Technical specification\n\nRecord researched decisions and design.\n",
            "test-scope/Spec.md":
              "# Test scope\n\nDescribe the cases and outcomes to cover.\n",
            "test-spec/Spec.md":
              "# Test specification\n\nDescribe prerequisites, operations and expected outcomes.\n",
            "implementation/Spec.md":
              "# Implementation deliverables\n\nRecord delivery and supporting material. Before delegated acceptance, verify passing local tests or CI including the submitted commit.\n",
            "implementation/Submission.md":
              "# Submission details\n\nRecord which test cases were added, deleted or modified, and which commit they were submitted to. This material guides Agent review; Check does not validate test execution or commit binding.\n",
            "deployment/Spec.md":
              "# Deployment deliverables\n\nSelf-test the actual deployed result, then obtain the user's explicit hands-on acceptance through deployment accept. Check does not judge deployment reports or outcomes.\n",
          };
          for (const [file, content] of Object.entries(scaffold))
            files.set(file, Buffer.from(content));
          flatIdea(files, id);
          for (const directory of [...checkpoints])
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
          invariant(
            (await git(
              root,
              ["rev-parse", "--verify", "HEAD"],
              options.signal,
            )) === observed.head,
            "concurrent-edit",
            "Git HEAD changed during creation; owned scaffold was not retained.",
          );
          return { id, checkCid: cid, eventSchemaCid, path };
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
export async function appendEvent(
  root: string,
  selector: string,
  _event: Event,
  options: AppendOptions,
): Promise<{ readonly digest: string; readonly idempotent: boolean }> {
  const project = await readProject(root, "worktree", options.signal);
  const current = selectIdea(project, selector);
  invariant(
    !isFlatIdea(current),
    "event-write",
    "Flat events are appended directly as canonical JSONL; no event mutation command exists.",
  );
  throw new SilvermoonError(
    "migration-required",
    "Historical Ideas are read-only; explicit migration is required before advancement.",
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
    ...(isFlatIdea(current)
      ? { eventSchemaCid: current.bootstrap.eventSchemaCid }
      : { checkCid: current.bootstrap.checkCid }),
    digest: digest(current.eventSource),
    cursor: `${current.events.length}:${digest(current.eventSource)}`,
    events: current.events.slice(offset),
    state,
    observation: context.observation,
  };
}
