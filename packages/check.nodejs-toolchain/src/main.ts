import { runCheck } from "@silvermoon-work/check-task-sdk";
import contract from "./contract.js";
import { inspect } from "./inspect.js";

runCheck(contract, (input, context, report) =>
  inspect(input, context.signal, report),
);
