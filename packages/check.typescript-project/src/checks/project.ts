import {
  defineChecker,
  type CheckItem,
  type CheckerResult,
} from "@silvermoon-work/check-task-sdk";
import { Input, type ProblemCode } from "../contract.js";
import { identifyRepository } from "../repository.js";
import type { repositories } from "./repositories.js";

export const project = defineChecker({
  target: Input,
  check: async (
    target,
    signal,
  ): Promise<CheckerResult<CheckItem<typeof repositories>, ProblemCode>> => {
    const identity = await identifyRepository(target.projectDirectory, signal);
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
      children: [{ checker: identity.kind, target }],
    };
  },
});
