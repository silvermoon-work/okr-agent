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
export const SnapshotTarget = Type.Object(
  {
    ...Target.properties,
    snapshot: Type.String({ minLength: 1 }),
  },
  closed,
);
export type SnapshotTarget = Static<typeof SnapshotTarget>;
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
  "environment-runtime",
  "environment-skill",
  "environment-configuration",
  "repository-root-invalid",
  "project-configuration-invalid",
  "project-layout-invalid",
  "primary-branch-missing",
  "branch-detached",
  "branch-upstream-mismatch",
  "primary-sync-required",
  "worktree-uncommitted",
  "event-history-rewritten",
  "idea-identity-modified",
  "idea-invalid",
  "completion-unsynchronized",
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
export const RuleCode = ProblemCode;
export type RuleCode = Static<typeof RuleCode>;
export const checkpointIds = [
  "environment",
  "repository",
  "observation",
  "requirements",
  "research",
  "technical",
  "cases",
  "tests",
  "implementation",
  "deployment",
  "completion",
] as const;
export const lifecycleContract = createCheckContract(
  Target,
  RuleCode,
  checkpointIds,
);
export const snapshotContract = createCheckContract(
  SnapshotTarget,
  ProblemCode,
  ["snapshot"],
);
export default createCheckContract(Input, RuleCode, [
  ...checkpointIds,
  "snapshot",
]);
