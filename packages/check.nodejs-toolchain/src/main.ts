import { runCheck, type CheckContext } from "@silvermoon-work/check-task-sdk";
import contract, { type Input } from "./contract.js";
import { toolchainCheckpoints } from "./inspect.js";

const checkpoints = (context: CheckContext, input: Input) =>
  toolchainCheckpoints(input, context.signal);
runCheck(contract, { checkpoints });
