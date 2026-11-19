import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import { runTask } from "@silvermoon-work/task-sdk";
import { lifecycleContract, snapshotContract, type Input } from "./contract.js";
import { silvermoonCheckpoints, snapshotCheckpoints } from "./check.js";

runTask(async (request: Input, context) => {
  if (request.operation.mode === "snapshot")
    return createCheckCallback(snapshotContract, {
      checkpoints: snapshotCheckpoints(request.runtime),
    })(
      { ...request.target, snapshot: request.operation.snapshot ?? "HEAD" },
      context,
    );
  return createCheckCallback(lifecycleContract, {
    checkpoints: silvermoonCheckpoints(
      context.bundle,
      {
        runtime: request.runtime,
        refresh: request.operation.refresh ?? true,
      },
      request.target,
    ),
  })(request.target, context);
});
