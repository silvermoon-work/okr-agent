import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";
import { Runtime, setupCodes } from "./contract.js";

export const SetupTarget = Type.Object(
  { userHome: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type SetupTarget = Static<typeof SetupTarget>;
export const SetupRuleCode = Type.Union(
  setupCodes.map((code) => Type.Literal(code)),
);
export const setupContract = createCheckContract(SetupTarget, SetupRuleCode, [
  "global",
]);
export const Input = Type.Object(
  { target: SetupTarget, runtime: Runtime },
  { additionalProperties: false },
);
export type Input = Static<typeof Input>;
export default createCheckContract(Input, SetupRuleCode, ["global"]);
