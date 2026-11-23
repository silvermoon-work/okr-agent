import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";
import { Target } from "../../contract.js";
import { invariant } from "../../domain.js";
import { documentation } from "./documentation.js";
import { failure, synchronized, type CheckExecution } from "../shared.js";
import type { legacyIdeaCheckpoint as ideaCheckpoint } from "../idea-folder/legacy-check.js";
import type { branchCheckpoint } from "../branch/check.js";
import type { deploymentCheckpoint } from "../deployment/check.js";

export function userAcceptanceCheckpoint(
  execution: CheckExecution,
  observation: ReturnType<typeof ideaCheckpoint>,
  branch: ReturnType<typeof branchCheckpoint>,
  deployment: ReturnType<typeof deploymentCheckpoint>,
) {
  return defineCheckpoint({
    ...documentation,
    target: Target,
    check: async (target, context) => {
      context.outputOf(deployment);
      const { state, brief } = context.outputOf(observation);
      if (state.level === "user-acceptance")
        return failure("user-acceptance-confirmed", brief);
      if (state.level === "synchronization" && state.next === "user-acceptance")
        return failure("user-acceptance-synchronized", brief);
      invariant(
        state.level === "completed",
        "internal",
        "User acceptance and reducer completion disagree.",
      );
      const { observed } = context.outputOf(branch);
      return (await synchronized(
        execution,
        target,
        observed.tip,
        context.signal,
      ))
        ? { pass: true as const, output: undefined }
        : failure("user-acceptance-synchronized", brief);
    },
  });
}
