import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";
import { RepositoryTarget, Runtime } from "./contract.js";
import { projectDocumentation } from "./checkpoints/catalog.js";

export const ProjectTarget = RepositoryTarget;
export type ProjectTarget = Static<typeof ProjectTarget>;
export const projectCheckpointIds = projectDocumentation.map(
  (checkpoint) => checkpoint.id,
);
export const ProjectRuleCode = Type.Union(
  projectDocumentation.flatMap((checkpoint) =>
    checkpoint.rules.map((rule) => Type.Literal(rule.code)),
  ),
);
export const projectContract = createCheckContract(
  ProjectTarget,
  ProjectRuleCode,
  projectCheckpointIds,
);
export const Input = Type.Object(
  {
    target: ProjectTarget,
    runtime: Runtime,
    refresh: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type Input = Static<typeof Input>;
export default createCheckContract(
  Input,
  ProjectRuleCode,
  projectCheckpointIds,
);
