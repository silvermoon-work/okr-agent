import { prerequisiteCheckpoints, type CheckExecution } from "./check.js";
import { CreationTarget } from "./create-contract.js";

export function creationCheckpoints(execution: CheckExecution) {
  return prerequisiteCheckpoints(execution, CreationTarget);
}
