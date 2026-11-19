import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

export const Input = Type.Object(
  { projectDirectory: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type Input = Static<typeof Input>;
export const RuleCode = Type.Union([
  Type.Literal("typescript-project-valid"),
  Type.Literal("workspace-configuration-valid"),
]);
export type RuleCode = Static<typeof RuleCode>;

export default createCheckContract(Input, RuleCode, ["project", "workspace"]);
