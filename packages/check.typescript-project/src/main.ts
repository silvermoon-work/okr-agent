import { runCheck } from "@silvermoon-work/check-task-sdk";
import contract from "./contract.js";
import { projectCheck } from "./callback.js";

runCheck(contract, projectCheck(), { assets: true });
