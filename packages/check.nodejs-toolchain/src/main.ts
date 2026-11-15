import { runCheck, type CheckContext } from "@silvermoon-work/check-task-sdk";
import contract, { type Input } from "./contract.js";
import { toolchainRegistry } from "./inspect.js";

const registry = (context: CheckContext, input: Input) =>
  toolchainRegistry(input, context.signal);
runCheck(contract, { registry, root: "toolchain" });
