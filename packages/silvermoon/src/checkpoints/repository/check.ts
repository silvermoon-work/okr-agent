import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import type { Target, RepositoryTarget } from "../../contract.js";
import type { ProjectTarget } from "../../project-contract.js";
import { withGitContext } from "../../git-context.js";
import { SilvermoonError } from "../../domain.js";
import { failure, nativeCode, type CheckExecution } from "../shared.js";
import { git, verifyRepositoryRoot } from "../../repository.js";
import type { environmentCheckpoint } from "../global/check.js";
export function repositoryCheckpoint(
  execution: CheckExecution,
  targetSchema: typeof Target | typeof ProjectTarget,
  environment: ReturnType<typeof environmentCheckpoint>,
) {
  const inGit = <T>(target: RepositoryTarget, action: () => Promise<T>) =>
    withGitContext({ userHome: target.userHome, ...execution.runtime }, action);
  return defineCheckpoint({
    ...documentation,
    target: targetSchema,
    check: async (target, context) => {
      const { signal } = context;
      context.outputOf(environment);
      if (!target.repoRoot)
        return failure(
          "repository-root-valid",
          "Select a Git repository root.",
        );
      const root = target.repoRoot;
      return inGit(target, async () => {
        let head: string;
        try {
          await verifyRepositoryRoot(root, signal);
          head = await git(root, ["rev-parse", "--verify", "HEAD"], signal);
        } catch (error) {
          signal.throwIfAborted();
          const code = nativeCode(error);
          if (
            error instanceof SilvermoonError ||
            code === "ENOENT" ||
            code === "ENOTDIR" ||
            code === 128
          )
            return failure("repository-root-valid", error);
          throw error;
        }
        try {
          await git(
            root,
            ["symbolic-ref", "--quiet", "--short", "HEAD"],
            signal,
          );
        } catch (error) {
          signal.throwIfAborted();
          if (nativeCode(error) === 1)
            return failure("repository-branch-attached", error);
          throw error;
        }
        const status = await git(
          root,
          ["status", "--porcelain=v1", "--untracked-files=all"],
          signal,
        );
        return status
          ? failure(
              "repository-worktree-clean",
              "Commit all staged, unstaged and untracked content before continuing.",
            )
          : { pass: true as const, output: { root, head } };
      });
    },
  });
}
