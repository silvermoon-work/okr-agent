import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import { runTask } from "@silvermoon-work/task-sdk";
import { commitContract, type Input } from "./commit-contract.js";
import { commitCheckpoints } from "./commit-check.js";

runTask(async (request: Input, context) =>
  createCheckCallback(commitContract, {
    checkpoints: commitCheckpoints(request.runtime),
  })(request.target, context),
);
