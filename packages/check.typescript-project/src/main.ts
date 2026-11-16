import { runCheck } from "@silvermoon-work/check-task-sdk";
import contract from "./contract.js";
import { registry } from "./registry.js";

runCheck(contract, { registry, root: "project" }, { assets: true });
