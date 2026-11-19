import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";
import {
  RepositoryTarget,
  Runtime,
  prerequisiteCodes,
  prerequisiteCheckpointIds,
} from "./contract.js";

export const CreationTarget = RepositoryTarget;
export type CreationTarget = Static<typeof CreationTarget>;
export const CreationRuleCode = Type.Union(
  prerequisiteCodes.map((code) => Type.Literal(code)),
);
export const creationContract = createCheckContract(
  CreationTarget,
  CreationRuleCode,
  prerequisiteCheckpointIds,
);
export const Input = Type.Object(
  {
    target: CreationTarget,
    runtime: Runtime,
    refresh: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type Input = Static<typeof Input>;
export default createCheckContract(
  Input,
  CreationRuleCode,
  prerequisiteCheckpointIds,
);
