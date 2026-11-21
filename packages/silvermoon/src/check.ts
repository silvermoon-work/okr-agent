import { Target } from "./contract.js";
import type { ProjectTarget } from "./project-contract.js";
import { gates } from "./domain.js";
import { environmentCheckpoint } from "./checkpoints/global/check.js";
import { repositoryCheckpoint } from "./checkpoints/repository/check.js";
import { branchCheckpoint } from "./checkpoints/branch/check.js";
import { layoutCheckpoint } from "./checkpoints/silvermoon-folder/check.js";
import { ideaCheckpoint } from "./checkpoints/idea-folder/check.js";
import { consensusCheckpoint } from "./checkpoints/consensus.js";
import { implementationCheckpoint } from "./checkpoints/implementation/check.js";
import { deploymentCheckpoint } from "./checkpoints/deployment/check.js";
import { userAcceptanceCheckpoint } from "./checkpoints/user-acceptance/check.js";
import type { CheckExecution } from "./checkpoints/shared.js";

export { environmentCheckpoint } from "./checkpoints/global/check.js";
export type { CheckExecution } from "./checkpoints/shared.js";
export { Target } from "./contract.js";

export function prerequisiteCheckpoints(
  execution: CheckExecution,
  targetSchema: typeof Target | typeof ProjectTarget,
) {
  const environment = environmentCheckpoint(execution.runtime, targetSchema);
  const repository = repositoryCheckpoint(execution, targetSchema, environment);
  const branch = branchCheckpoint(execution, targetSchema, repository);
  const layout = layoutCheckpoint(targetSchema, repository, branch);
  return [environment, repository, branch, layout] as const;
}

export function silvermoonCheckpoints(
  bundleCid: string,
  execution: CheckExecution,
) {
  const prerequisites = prerequisiteCheckpoints(execution, Target);
  const [environment, , branch, layout] = prerequisites;
  const observation = ideaCheckpoint(
    bundleCid,
    execution,
    environment,
    branch,
    layout,
  );
  const deployment = deploymentCheckpoint(execution, observation, branch);
  return [
    ...prerequisites,
    observation,
    ...gates.map((gate) => consensusCheckpoint(gate, observation)),
    implementationCheckpoint(execution, observation, branch),
    deployment,
    userAcceptanceCheckpoint(execution, observation, branch, deployment),
  ] as const;
}
