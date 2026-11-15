import { Type } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

export const Input = Type.Object({
  mode: Type.Union(["pass", "fail", "wait"].map((mode) => Type.Literal(mode))),
  marker: Type.String({ minLength: 1 }),
}, { additionalProperties: false });
export default createCheckContract(Input, Type.Literal("child-only"));
