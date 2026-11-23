import { runTask } from "@silvermoon-work/task-sdk";
import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import contract from "./contract.js";
import { withDevice } from "./device.js";
import { toolchainCheckpoints } from "./inspect.js";
import { resolvePolicy } from "./policy.js";

runTask(async (input, context) => {
  const policy = resolvePolicy(input);
  return withDevice(context.signal, async (device) => {
    const callback = createCheckCallback(contract, {
      checkpoints: toolchainCheckpoints(policy.input, context.signal, device),
    });
    return callback(policy.input, context);
  });
});
