import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";
import { Runtime } from "./contract.js";
import { commitDocumentation } from "./checkpoints/catalog.js";

const closed = { additionalProperties: false };
export const CommitTarget = Type.Object(
  {
    userHome: Type.String({ minLength: 1 }),
    repoRoot: Type.String({ minLength: 1 }),
    snapshot: Type.String({ minLength: 1 }),
    allowDelete: Type.Optional(
      Type.Array(Type.String({ pattern: "^[0-9]{12}[a-f0-9]{4}$" }), {
        uniqueItems: true,
      }),
    ),
  },
  closed,
);
export type CommitTarget = Static<typeof CommitTarget>;
export const CommitRuleCode = Type.Union(
  commitDocumentation.flatMap((checkpoint) =>
    checkpoint.rules.map((rule) => Type.Literal(rule.code)),
  ),
);
export type CommitRuleCode = Static<typeof CommitRuleCode>;
export const checkpointIds = commitDocumentation.map(
  (checkpoint) => checkpoint.id,
);
export const commitContract = createCheckContract(
  CommitTarget,
  CommitRuleCode,
  checkpointIds,
);
export const Input = Type.Object(
  { target: CommitTarget, runtime: Runtime },
  closed,
);
export type Input = Static<typeof Input>;
export default createCheckContract(Input, CommitRuleCode, checkpointIds);
