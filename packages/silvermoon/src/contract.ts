import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";
import {
  ideaDocumentation,
  prerequisiteDocumentation,
  setupDocumentation,
  consensusDocumentation,
} from "./checkpoints/catalog.js";

const closed = { additionalProperties: false };
const path = Type.String({ maxLength: 65_536, pattern: "^[^\\u0000\\r\\n]*$" });
export const RepositoryTarget = Type.Object(
  {
    userHome: Type.String({ minLength: 1 }),
    repoRoot: Type.String({ minLength: 1 }),
  },
  closed,
);
export type RepositoryTarget = Static<typeof RepositoryTarget>;
export const Target = Type.Object(
  {
    ...RepositoryTarget.properties,
    idea: Type.String({ minLength: 1 }),
  },
  closed,
);
export type Target = Static<typeof Target>;
export const Operation = Type.Object(
  {
    mode: Type.Union([
      Type.Literal("lifecycle"),
      Type.Literal("snapshot"),
      Type.Literal("project"),
      Type.Literal("setup"),
    ]),
    snapshot: Type.Optional(Type.String({ minLength: 1 })),
    refresh: Type.Optional(Type.Boolean()),
    allowDelete: Type.Optional(
      Type.Array(Type.String({ pattern: "^[0-9]{12}[a-f0-9]{4}$" }), {
        uniqueItems: true,
      }),
    ),
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
  requirements: consensusDocumentation.requirements.id,
  research: consensusDocumentation.research.id,
  technical: consensusDocumentation.technical.id,
  cases: consensusDocumentation.cases.id,
  tests: consensusDocumentation.tests.id,
} as const;
export const consensusRuleCodes = {
  requirements: consensusDocumentation.requirements.rules[0].code,
  research: consensusDocumentation.research.rules[0].code,
  technical: consensusDocumentation.technical.rules[0].code,
  cases: consensusDocumentation.cases.rules[0].code,
  tests: consensusDocumentation.tests.rules[0].code,
} as const;
export type ConsensusRuleCode =
  (typeof consensusRuleCodes)[keyof typeof consensusRuleCodes];
export type ConsensusSynchronizationRuleCode =
  `${(typeof consensusCheckpointIds)[keyof typeof consensusCheckpointIds]}-synchronized`;
export const setupCodes = setupDocumentation.flatMap((checkpoint) =>
  checkpoint.rules.map((rule) => rule.code),
);
export const prerequisiteCodes = prerequisiteDocumentation.flatMap(
  (checkpoint) => checkpoint.rules.map((rule) => rule.code),
);
export const codes = ideaDocumentation.flatMap((checkpoint) =>
  checkpoint.rules.map((rule) => rule.code),
);
export const RuleCode = Type.Union(codes.map((code) => Type.Literal(code)));
export type RuleCode = Static<typeof RuleCode>;
export const prerequisiteCheckpointIds = prerequisiteDocumentation.map(
  (checkpoint) => checkpoint.id,
);
export const checkpointIds = ideaDocumentation.map(
  (checkpoint) => checkpoint.id,
);
export const lifecycleContract = createCheckContract(
  Target,
  RuleCode,
  checkpointIds,
);
export default createCheckContract(Input, RuleCode, checkpointIds);
