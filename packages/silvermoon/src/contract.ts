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
    runtime: Runtime,
    refresh: Type.Optional(Type.Boolean()),
  },
  closed,
);
export type Input = Static<typeof Input>;
export const consensusCheckpointIds = {
  requirements: "requirements",
  research: "research",
  technical: "technical",
  cases: "test-index",
  tests: "test-cases",
} as const;
export const consensusRuleCodes = {
  requirements: "requirements-consensus-confirmed",
  research: "research-consensus-confirmed",
  technical: "technical-consensus-confirmed",
  cases: "test-index-consensus-confirmed",
  tests: "test-cases-consensus-confirmed",
} as const;
export type ConsensusRuleCode =
  (typeof consensusRuleCodes)[keyof typeof consensusRuleCodes];
export type ConsensusSynchronizationRuleCode =
  `${(typeof consensusCheckpointIds)[keyof typeof consensusCheckpointIds]}-synchronized`;
export const codes = [
  "global-runtime-ready",
  "global-skill-linked",
  "global-configuration-valid",
  "repository-root-valid",
  "repository-branch-attached",
  "repository-worktree-clean",
  "branch-silvermoon-config-valid",
  "branch-primary-present",
  "branch-upstream-aligned",
  "branch-primary-synchronized",
  "silvermoon-folder-path-valid",
  "silvermoon-folder-config-file-valid",
  "silvermoon-folder-ideas-directory-valid",
  "idea-folder-event-history-append-only",
  "idea-folder-identity-immutable",
  "idea-folder-data-valid",
  "idea-folder-active",
  ...Object.values(consensusRuleCodes),
  ...Object.values(consensusCheckpointIds).map(
    (id) => `${id}-synchronized` as const,
  ),
  "implementation-evidence-valid",
  "implementation-synchronized",
  "deployment-evidence-valid",
  "deployment-synchronized",
] as const;
export const RuleCode = Type.Union(codes.map((code) => Type.Literal(code)));
export type RuleCode = Static<typeof RuleCode>;
export const checkpointIds = [
  "global",
  "repository",
  "branch",
  "silvermoon-folder",
  "idea-folder",
  ...Object.values(consensusCheckpointIds),
  "implementation",
  "deployment",
] as const;
export const lifecycleContract = createCheckContract(
  Target,
  RuleCode,
  checkpointIds,
);
export default createCheckContract(Input, RuleCode, checkpointIds);
