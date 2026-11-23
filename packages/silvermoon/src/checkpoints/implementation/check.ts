import {
  defineCheckpoint,
  type CheckpointResult,
} from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import { Target } from "../../contract.js";
import { invariant } from "../../domain.js";
import { failure, synchronized, type CheckExecution } from "../shared.js";
import type { legacyIdeaCheckpoint as ideaCheckpoint } from "../idea-folder/legacy-check.js";
import type { branchCheckpoint } from "../branch/check.js";
export function implementationCheckpoint(
  execution: CheckExecution,
  observation: ReturnType<typeof ideaCheckpoint>,
  branch: ReturnType<typeof branchCheckpoint>,
) {
  return defineCheckpoint({
    ...documentation,
    target: Target,
    check: async (
      target,
      context,
    ): Promise<
      CheckpointResult<
        undefined,
        "implementation-evidence-valid" | "implementation-synchronized"
      >
    > => {
      const { state, brief } = context.outputOf(observation);
      if (state.level === "implementation")
        return failure(
          state.implementation
            ? "implementation-synchronized"
            : "implementation-evidence-valid",
          brief,
        );
      invariant(
        ["deployment", "user-acceptance", "completed"].includes(state.level) ||
          (state.level === "synchronization" &&
            state.next === "user-acceptance"),
        "internal",
        "Prior checkpoints did not establish implementation lifecycle facts.",
      );
      const { observed } = context.outputOf(branch);
      return (await synchronized(
        execution,
        target,
        observed.tip,
        context.signal,
      ))
        ? { pass: true, output: undefined }
        : failure("implementation-synchronized", brief);
    },
  });
}
