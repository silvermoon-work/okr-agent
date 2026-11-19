import { environmentCheckpoint, type CheckExecution } from "./check.js";
import { SetupTarget } from "./setup-contract.js";

export function setupCheckpoints(runtime: CheckExecution["runtime"]) {
  return [environmentCheckpoint(runtime, SetupTarget)] as const;
}
