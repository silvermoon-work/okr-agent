import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

const closed = { additionalProperties: false };
export const Input = Type.Object(
  {
    mode: Type.Union([Type.Literal("lifecycle"), Type.Literal("snapshot")]),
    root: Type.Optional(Type.String({ minLength: 1 })),
    idea: Type.Optional(Type.String({ minLength: 1 })),
    snapshot: Type.Optional(Type.String({ minLength: 1 })),
    refresh: Type.Optional(Type.Boolean()),
    device: Type.Object(
      { entry: Type.String(), home: Type.String(), path: Type.String() },
      closed,
    ),
  },
  closed,
);
export type Input = Static<typeof Input>;
export const codes = [
  "device",
  "project",
  "repository",
  "snapshot",
  "requirements",
  "research",
  "technical",
  "cases",
  "tests",
  "synchronization",
  "implementation",
  "deployment",
  "abandoned",
] as const;
export const ProblemCode = Type.Union(codes.map((code) => Type.Literal(code)));
export default createCheckContract(Input, ProblemCode);
