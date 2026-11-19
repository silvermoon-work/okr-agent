import {
  defineCheckpoint,
  type CheckpointResult,
} from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import type { RuleFailure } from "@silvermoon-work/check-task-sdk";
import { CommitTarget } from "../../commit-contract.js";
import { SilvermoonError } from "../../domain.js";
import { verifyIdeaHistory } from "../../repository.js";
import type { snapshotCheckpoint } from "../commit-snapshot/check.js";
export function historyCheckpoint(
  structure: ReturnType<typeof snapshotCheckpoint>,
) {
  return defineCheckpoint({
    ...documentation,
    target: CommitTarget,
    check: async (
      target,
      context,
    ): Promise<
      CheckpointResult<
        undefined,
        | "commit-history-idea-identity-immutable"
        | "commit-history-event-history-append-only"
      >
    > => {
      await Promise.resolve();
      const { project: current, previous } = context.outputOf(structure);
      const problems: RuleFailure<
        | "commit-history-idea-identity-immutable"
        | "commit-history-event-history-append-only"
      >[] = [];
      for (const [id, before] of previous?.ideas ?? []) {
        if (!current.ideas.has(id) && target.allowDelete?.includes(id))
          continue;
        try {
          verifyIdeaHistory(current.ideas.get(id), before);
        } catch (error) {
          if (!(error instanceof SilvermoonError)) throw error;
          if (error.code !== "identity" && error.code !== "history")
            throw error;
          problems.push({
            code:
              error.code === "identity"
                ? "commit-history-idea-identity-immutable"
                : "commit-history-event-history-append-only",
            brief: `${id}: ${error.message}`,
          });
        }
      }
      const [first, ...rest] = problems;
      return first
        ? { pass: false, problems: [first, ...rest] }
        : { pass: true, output: undefined };
    },
  });
}
