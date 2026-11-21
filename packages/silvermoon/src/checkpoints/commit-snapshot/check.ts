import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import { CommitTarget } from "../../commit-contract.js";
import type { Runtime } from "../../contract.js";
import { invariant, SilvermoonError, validIdeaId } from "../../domain.js";
import { withGitContext } from "../../git-context.js";
import { git, readProject, verifyRepositoryRoot } from "../../repository.js";
import { failure } from "../shared.js";
async function baseline(root: string, snapshot: string, signal: AbortSignal) {
  let revision: string | undefined;
  if (snapshot === "staged" || snapshot === "worktree") {
    try {
      revision = await git(
        root,
        ["rev-parse", "--verify", "--quiet", "HEAD"],
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof Error && "code" in error && error.code === 1))
        throw error;
    }
  } else {
    const parents = (
      await git(
        root,
        ["rev-list", "--parents", "--max-count=1", snapshot],
        signal,
      )
    ).split(/\s+/);
    revision = parents[1];
  }
  if (!revision) return undefined;
  const config = await git(
    root,
    ["ls-tree", "--name-only", revision, "--", ".silvermoon/config.yaml"],
    signal,
  );
  return config ? revision : undefined;
}

async function changedIdeas(
  root: string,
  snapshot: string,
  previous: string | undefined,
  signal: AbortSignal,
): Promise<ReadonlySet<string>> {
  const paths = previous
    ? await git(
        root,
        [
          "diff",
          "--name-only",
          "--no-renames",
          "-z",
          ...(snapshot === "staged" ? ["--cached"] : []),
          previous,
          ...(snapshot === "staged" || snapshot === "worktree"
            ? []
            : [snapshot]),
          "--",
          ".silvermoon/i",
        ],
        signal,
      )
    : snapshot === "worktree" || snapshot === "staged"
      ? await git(root, ["ls-files", "-z", "--", ".silvermoon/i"], signal)
      : await git(
          root,
          [
            "ls-tree",
            "-r",
            "--name-only",
            "-z",
            snapshot,
            "--",
            ".silvermoon/i",
          ],
          signal,
        );
  const untracked =
    snapshot === "worktree"
      ? await git(
          root,
          [
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            ".silvermoon/i",
          ],
          signal,
        )
      : "";
  const ids = new Set<string>();
  for (const path of (paths + "\0" + untracked).split("\0").filter(Boolean)) {
    const id = path.split("/")[2];
    invariant(
      id && validIdeaId(id),
      "layout",
      `Invalid new Idea path: ${path}`,
    );
    ids.add(id);
  }
  return ids;
}

export function snapshotCheckpoint(runtime: Runtime) {
  const inGit = <T>(target: CommitTarget, action: () => Promise<T>) =>
    withGitContext({ userHome: target.userHome, ...runtime }, action);
  return defineCheckpoint({
    ...documentation,
    target: CommitTarget,
    check: async (target, context) => {
      try {
        const observation = await inGit(target, async () => {
          await verifyRepositoryRoot(target.repoRoot, context.signal);
          invariant(
            ["HEAD", "staged", "worktree"].includes(target.snapshot) ||
              /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(target.snapshot),
            "snapshot",
            "Select HEAD, staged, worktree or an exact commit ID.",
          );
          const snapshot =
            target.snapshot === "HEAD"
              ? await git(
                  target.repoRoot,
                  ["rev-parse", "--verify", "HEAD"],
                  context.signal,
                )
              : target.snapshot;
          const revision = await baseline(
            target.repoRoot,
            snapshot,
            context.signal,
          );
          const ids = await changedIdeas(
            target.repoRoot,
            snapshot,
            revision,
            context.signal,
          );
          const previous = revision
            ? await readProject(target.repoRoot, revision, context.signal, ids)
            : undefined;
          const project = await readProject(
            target.repoRoot,
            snapshot,
            context.signal,
            ids,
          );
          for (const current of project.ideas.values())
            for (const event of current.events)
              if (
                event.type === "verify" &&
                "phase" in event &&
                event.phase === "implementation"
              )
                invariant(
                  (await git(
                    target.repoRoot,
                    ["cat-file", "-t", event.rev],
                    context.signal,
                  )) === "commit",
                  "evidence",
                  "Implementation verification must reference an existing exact commit.",
                );
          for (const id of target.allowDelete ?? [])
            invariant(
              previous?.ideas.has(id) && !project.ideas.has(id),
              "deletion",
              `Deletion exception requires a whole existing Idea to be removed: ${id}`,
            );
          return { project, previous };
        });
        return { pass: true as const, output: observation };
      } catch (error) {
        context.signal.throwIfAborted();
        if (
          error instanceof SilvermoonError &&
          ["git-context", "concurrent-edit", "internal", "protocol"].includes(
            error.code,
          )
        )
          throw error;
        const code =
          error instanceof Error && "code" in error ? error.code : undefined;
        if (
          error instanceof SilvermoonError ||
          error instanceof SyntaxError ||
          error instanceof TypeError ||
          code === "ENOENT" ||
          code === "ENOTDIR" ||
          code === 128
        )
          return failure("commit-snapshot-valid", error);
        throw error;
      }
    },
  });
}
