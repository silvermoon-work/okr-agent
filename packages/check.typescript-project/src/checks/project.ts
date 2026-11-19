import {
  defineCheckpoint,
  type CheckpointResult,
} from "@silvermoon-work/check-task-sdk";
import { Input } from "../contract.js";
import { identifyRepository, type RepositoryIdentity } from "../repository.js";

export const project = defineCheckpoint({
  id: "project",
  target: Input,
  description: "确认目标是 TypeScript 项目，并识别单仓库或 monorepo。",
  rules: [
    {
      code: "typescript-project-invalid",
      description: "目标必须具备有效根清单及明确的 TypeScript 依据。",
    },
  ],
  check: async (
    target,
    context,
  ): Promise<
    CheckpointResult<
      Exclude<RepositoryIdentity, { kind: "invalid" }>,
      "typescript-project-invalid"
    >
  > => {
    const identity = await identifyRepository(
      target.projectDirectory,
      context.signal,
    );
    if (identity.kind === "invalid")
      return {
        pass: false,
        problems: [
          {
            code: "typescript-project-invalid",
            brief: `${target.projectDirectory}: ${identity.reason}`,
          },
        ],
      };
    return {
      pass: true,
      output: identity,
    };
  },
});
