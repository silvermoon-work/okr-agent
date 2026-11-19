import { prerequisiteCheckpoints, type CheckExecution } from "./check.js";
import { ProjectTarget } from "./project-contract.js";
import { preCommitCheckpoint } from "./checkpoints/pre-commit/check.js";

export function projectCheckpoints(execution: CheckExecution) {
  const prerequisites = prerequisiteCheckpoints(execution, ProjectTarget);
  const [, repository, , layout] = prerequisites;
  return [
    ...prerequisites,
    preCommitCheckpoint(execution, repository, layout),
  ] as const;
}
