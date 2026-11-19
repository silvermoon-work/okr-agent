import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";
import {
  RepositoryTarget,
  Runtime,
  prerequisiteCodes,
  prerequisiteCheckpointIds,
} from "./contract.js";

export const ProjectTarget = RepositoryTarget;
export type ProjectTarget = Static<typeof ProjectTarget>;
export const projectCheckpointIds = [
  ...prerequisiteCheckpointIds,
  "pre-commit",
] as const;
export const ProjectRuleCode = Type.Union(
  [...prerequisiteCodes, "pre-commit-hook-configured"].map((code) =>
    Type.Literal(code),
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
