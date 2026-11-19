import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import { runTask } from "@silvermoon-work/task-sdk";
import { projectContract, type Input } from "./project-contract.js";
import { projectCheckpoints } from "./project-check.js";

runTask(async (request: Input, context) =>
  createCheckCallback(projectContract, {
    checkpoints: projectCheckpoints({
      runtime: request.runtime,
      ...(request.refresh === undefined ? {} : { refresh: request.refresh }),
    }),
  })(request.target, context),
);
