import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import type { Target, RepositoryTarget } from "../../contract.js";
import type { ProjectTarget } from "../../project-contract.js";
import { withGitContext } from "../../git-context.js";
import { invariant, SilvermoonError } from "../../domain.js";
import { failure, nativeCode, type CheckExecution } from "../shared.js";
import { git, readRepository, observeRepository } from "../../repository.js";
import type { repositoryCheckpoint } from "../repository/check.js";
export function branchCheckpoint(
  execution: CheckExecution,
  targetSchema: typeof Target | typeof ProjectTarget,
  repository: ReturnType<typeof repositoryCheckpoint>,
) {
  const inGit = <T>(target: RepositoryTarget, action: () => Promise<T>) =>
    withGitContext({ userHome: target.userHome, ...execution.runtime }, action);
  return defineCheckpoint({
    ...documentation,
    target: targetSchema,
    check: async (target, context) => {
      const { signal } = context;
      const { root, head } = context.outputOf(repository);
      return inGit(target, async () => {
        let project;
        try {
          project = await readRepository(root, "worktree", signal);
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof SilvermoonError) {
            if (["git-context", "concurrent-edit", "root"].includes(error.code))
              throw error;
            return failure("branch-silvermoon-config-valid", error);
          }
          if (
            error instanceof SyntaxError ||
            error instanceof TypeError ||
            ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
          )
            return failure("branch-silvermoon-config-valid", error);
          throw error;
        }
        try {
          await git(
            root,
            [
              "rev-parse",
              "--abbrev-ref",
              "--symbolic-full-name",
              "@{upstream}",
            ],
            signal,
          );
        } catch (error) {
          signal.throwIfAborted();
          if (nativeCode(error) === 128)
            return failure("branch-upstream-aligned", error);
          throw error;
        }
        let observed;
        try {
          observed = await observeRepository(project, {
            fetch: execution.refresh ?? true,
            checkBranch: true,
            ...(execution.localRemote
              ? { localRemote: execution.localRemote }
              : {}),
            signal,
          });
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof SilvermoonError) {
            if (
              ["git-context", "concurrent-edit", "git-status"].includes(
                error.code,
              )
            )
              throw error;
            const code =
              error.code === "primary-branch-missing"
                ? "branch-primary-present"
                : "branch-upstream-aligned";
            return failure(code, error);
          }
          throw error;
        }
        invariant(
          observed.head === head && !observed.changes.length,
          "concurrent-edit",
          "Repository changed during checkpoint observation.",
        );
        return observed.head !== observed.tip
          ? failure(
              "branch-primary-synchronized",
              "Synchronize current HEAD to the observed primary tip.",
            )
          : { pass: true as const, output: { project, observed } };
      });
    },
  });
}
