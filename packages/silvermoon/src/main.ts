import { runCheck, type CheckContext } from "@silvermoon-work/check-task-sdk";
import contract from "./contract.js";
import { silvermoonRegistry } from "./check.js";

runCheck(contract, {
  root: "device",
  registry: (context: CheckContext) => silvermoonRegistry(context.bundle),
});
