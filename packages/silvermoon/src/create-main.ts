import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import { runTask } from "@silvermoon-work/task-sdk";
import { creationContract, type Input } from "./create-contract.js";
import { creationCheckpoints } from "./create-check.js";

runTask(async (request: Input, context) =>
  createCheckCallback(creationContract, {
    checkpoints: creationCheckpoints({
      runtime: request.runtime,
      ...(request.refresh === undefined ? {} : { refresh: request.refresh }),
    }),
  })(request.target, context),
);
