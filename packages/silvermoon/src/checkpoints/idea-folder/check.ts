import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import { Target } from "../../contract.js";
import {
  canonical,
  digest,
  invariant,
  SilvermoonError,
  type Idea,
} from "../../domain.js";
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
      invariant(
        target.idea,
        "internal",
        "Idea observation requires a selector.",
      );
      invariant(
        target.repoRoot,
        "internal",
        "Idea observation requires a repository.",
      );
      const root = target.repoRoot;
      let project;
      let current: Idea;
      let previous;
      try {
        project = await inGit(target, () =>
          readIdeaProject(root, target.idea, observed.head, context.signal),
        );
        current = selectIdea(project, target.idea);
        previous = await inGit(target, () =>
          readIdeaProject(
            root,
            current.bootstrap.id,
            observed.tip,
            context.signal,
          ),
        );
        const before = previous.ideas.get(current.bootstrap.id);
        invariant(
          before,
          "identity",
          "The selected Idea must exist in the observed primary snapshot.",
        );
        verifyIdeaHistory(current, before);
      } catch (error) {
        context.signal.throwIfAborted();
        if (error instanceof SilvermoonError) {
          if (
            ["git-context", "concurrent-edit", "internal", "protocol"].includes(
              error.code,
            )
          )
            throw error;
          if (error.code === "identity")
            return failure("idea-folder-identity-immutable", error);
          if (error.code === "history")
            return failure("idea-folder-event-history-append-only", error);
          if (error.code === "report-history")
            return failure("idea-folder-deployment-report-append-only", error);
          return failure("idea-folder-data-valid", error);
        }
        if (error instanceof SyntaxError || error instanceof TypeError)
          return failure("idea-folder-data-valid", error);
        throw error;
      }
      invariant(
        current.bootstrap.checkCid === bundleCid,
        "check-identity",
        "The executing Check CID does not match the Idea's immutable bootstrap.",
      );
      let state;
      try {
        state = await inGit(target, () =>
          observedIdeaState(
            project,
            current,
            { head: observed.head, primary: previous, paired: true },
            context.outputOf(environment).userLanguage,
            context.signal,
          ),
        );
      } catch (error) {
        context.signal.throwIfAborted();
        if (
          error instanceof SilvermoonError &&
          ["evidence", "layout", "events", "cases"].includes(error.code)
        )
          return failure("idea-folder-data-valid", error);
        if (error instanceof Error && "code" in error && error.code === 128)
          return failure("idea-folder-data-valid", error);
        throw error;
      }
      if (state.level === "abandoned")
        return failure(
          "idea-folder-active",
          "Idea is explicitly abandoned; only an authorized resume event can restore it.",
        );
      const brief = canonical({
        idea: current.bootstrap.id,
        ...state,
        eventDigest: digest(current.eventSource),
        primary: observed.tip,
        subject: observed.head,
      });
      return { pass: true as const, output: { state, brief } };
    },
  });
}
