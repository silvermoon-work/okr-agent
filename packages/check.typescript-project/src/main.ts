import { runCheck } from "@silvermoon-work/check-task-sdk";
import contract from "./contract.js";
import { checkpoints } from "./checkpoints.js";

runCheck(contract, { checkpoints }, { assets: true });
