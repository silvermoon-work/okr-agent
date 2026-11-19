import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import { runTask } from "@silvermoon-work/task-sdk";
import { lifecycleContract, type Input } from "./contract.js";
import { silvermoonCheckpoints } from "./check.js";

runTask(async (request: Input, context) => {
  return createCheckCallback(lifecycleContract, {
    checkpoints: silvermoonCheckpoints(
      context.bundle,
      {
        runtime: request.runtime,
        ...(request.refresh === undefined ? {} : { refresh: request.refresh }),
      },
      request.target,
    ),
  })(request.target, context);
});
