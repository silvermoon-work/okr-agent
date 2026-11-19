import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

export const Input = Type.Object(
  { projectDirectory: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type Input = Static<typeof Input>;
export const ProblemCode = Type.Union([
  Type.Literal("typescript-project-invalid"),
  Type.Literal("workspace-configuration-invalid"),
]);
export type ProblemCode = Static<typeof ProblemCode>;

export default createCheckContract(Input, ProblemCode, [
  "project",
  "workspace",
]);
