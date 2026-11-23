import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import { runTask } from "@silvermoon-work/task-sdk";
import { setupContract, type Input } from "./setup-contract.js";
import { setupCheckpoints } from "./setup-check.js";

runTask(async (request: Input, context) =>
  createCheckCallback(setupContract, {
    checkpoints: setupCheckpoints(request.runtime),
  })(request.target, context),
);
