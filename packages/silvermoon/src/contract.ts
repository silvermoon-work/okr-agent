import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

const closed = { additionalProperties: false };
const path = Type.String({ maxLength: 65_536, pattern: "^[^\\u0000\\r\\n]*$" });
export const Target = Type.Object(
  {
    userHome: Type.String({ minLength: 1 }),
    repoRoot: Type.Optional(Type.String({ minLength: 1 })),
    idea: Type.Optional(Type.String({ minLength: 1 })),
  },
  closed,
);
export type Target = Static<typeof Target>;
export const Operation = Type.Object(
  {
    mode: Type.Union([Type.Literal("lifecycle"), Type.Literal("snapshot")]),
    snapshot: Type.Optional(Type.String({ minLength: 1 })),
    refresh: Type.Optional(Type.Boolean()),
  },
  closed,
);
export type Operation = Static<typeof Operation>;
export const Runtime = Type.Object(
  {
    entry: path,
    path,
    sshAuthSock: Type.Optional(path),
  },
  closed,
);
export type Runtime = Static<typeof Runtime>;
export const Input = Type.Object(
  {
    target: Target,
    operation: Operation,
    runtime: Runtime,
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
