import { runCheck } from "@silvermoon-work/check-task-sdk/legacy";
import contract from "./contract.js";
import { projectCheck } from "./callback.js";

runCheck(
  contract,
  { registry: projectCheck(), root: "project" },
  { assets: true },
);
