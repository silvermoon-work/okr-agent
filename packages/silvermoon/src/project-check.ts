import { prerequisiteCheckpoints, type CheckExecution } from "./check.js";
import { ProjectTarget } from "./project-contract.js";

export function projectCheckpoints(execution: CheckExecution) {
  return prerequisiteCheckpoints(execution, ProjectTarget);
}
