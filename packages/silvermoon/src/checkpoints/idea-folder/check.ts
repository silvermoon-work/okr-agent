import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";
import { documentation } from "./documentation.js";
import { Target } from "../../contract.js";
import { canonical, digest, invariant, SilvermoonError } from "../../domain.js";
import { isFlatIdea, type FlatIdea } from "../../flat.js";
import { withGitContext } from "../../git-context.js";
import {
  readIdeaProject,
  selectIdea,
  verifyIdeaHistory,
  observedIdeaState,
} from "../../repository.js";
import { failure, type CheckExecution } from "../shared.js";
import type { environmentCheckpoint } from "../global/check.js";
import type { branchCheckpoint } from "../branch/check.js";
import type { layoutCheckpoint } from "../silvermoon-folder/check.js";

export function ideaCheckpoint(
  bundleCid: string,
  execution: CheckExecution,
  environment: ReturnType<typeof environmentCheckpoint>,
  branch: ReturnType<typeof branchCheckpoint>,
  silvermoonLayout: ReturnType<typeof layoutCheckpoint>,
) {
  const inGit = <T>(target: Target, action: () => Promise<T>) =>
    withGitContext({ userHome: target.userHome, ...execution.runtime }, action);
  return defineCheckpoint({
    ...documentation,
    target: Target,
    check: async (target, context) => {
      context.outputOf(silvermoonLayout);
      const { observed } = context.outputOf(branch);
      let project;
      let current: FlatIdea;
      let previous;
      try {
        project = await inGit(target, () =>
          readIdeaProject(
            target.repoRoot,
            target.idea,
            observed.head,
            context.signal,
          ),
        );
        const selected = selectIdea(project, target.idea);
        invariant(
          isFlatIdea(selected),
          "migration-required",
          "Historical Idea remains read-only/checkable; explicit migration is required before navigation.",
        );
        current = selected;
        previous = await inGit(target, () =>
          readIdeaProject(
            target.repoRoot,
            current.bootstrap.id,
            observed.tip,
            context.signal,
          ),
        );
        const before = previous.ideas.get(current.bootstrap.id);
        invariant(
          before && isFlatIdea(before),
          "identity",
          "Selected flat Idea must exist with the same data contract in primary.",
        );
        verifyIdeaHistory(current, before);
      } catch (error) {
        context.signal.throwIfAborted();
        if (error instanceof SilvermoonError) {
          if (
            [
              "git-context",
              "concurrent-edit",
              "internal",
              "protocol",
              "migration-required",
            ].includes(error.code)
          )
            throw error;
          if (error.code === "identity")
            return failure("idea-folder-identity-immutable", error);
          if (error.code === "history")
            return failure("idea-folder-event-history-append-only", error);
          return failure("idea-folder-data-valid", error);
        }
        if (error instanceof SyntaxError || error instanceof TypeError)
          return failure("idea-folder-data-valid", error);
        throw error;
      }
      const state = await inGit(target, () =>
        observedIdeaState(
          project,
          current,
          { head: observed.head, primary: previous },
          context.outputOf(environment).userLanguage,
          context.signal,
        ),
      );
      invariant(
        "acceptanceModes" in state,
        "internal",
        "Flat lifecycle state required.",
      );
      if (state.level === "abandoned")
        return failure(
          "idea-folder-active",
          "Idea is explicitly abandoned; authorized resume is required.",
        );
      const brief = canonical({
        idea: current.bootstrap.id,
        ...state,
        eventDigest: digest(current.eventSource),
        primary: observed.tip,
        subject: observed.head,
        executionCheckCid: bundleCid,
      });
      return { pass: true as const, output: { state, brief } };
    },
  });
}
