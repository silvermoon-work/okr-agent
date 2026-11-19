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
  output: {
    description: "已确认的仓库形态，供 workspace 检查点决定适用性。",
    fields: [
      {
        name: "kind",
        description:
          "single-repo 或 monorepo；只表示当前身份识别结果，不代表完整工程规则通过。",
      },
    ],
  },
  rules: [
    {
      code: "typescript-project-valid",
      description: "目标必须具备有效根清单及明确的 TypeScript 依据。",
    },
  ],
  check: async (
    target,
    context,
  ): Promise<
    CheckpointResult<
      Exclude<RepositoryIdentity, { kind: "invalid" }>,
      "typescript-project-valid"
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
            code: "typescript-project-valid",
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
