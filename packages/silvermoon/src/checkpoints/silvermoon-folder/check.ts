import {
  defineCheckpoint,
  type CheckpointResult,
} from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import { join } from "node:path";
import type { Target } from "../../contract.js";
import type { ProjectTarget } from "../../project-contract.js";
import { SilvermoonError } from "../../domain.js";
import { regular, readRegular, absent } from "../../repository.js";
import { failure, nativeCode } from "../shared.js";
import type { repositoryCheckpoint } from "../repository/check.js";
import type { branchCheckpoint } from "../branch/check.js";
export function layoutCheckpoint(
  targetSchema: typeof Target | typeof ProjectTarget,
  repository: ReturnType<typeof repositoryCheckpoint>,
  branch: ReturnType<typeof branchCheckpoint>,
) {
  return defineCheckpoint({
    ...documentation,
    target: targetSchema,
    check: async (
      _target,
      context,
    ): Promise<
      CheckpointResult<
        undefined,
        | "silvermoon-folder-path-valid"
        | "silvermoon-folder-config-file-valid"
        | "silvermoon-folder-ideas-directory-valid"
      >
    > => {
      context.outputOf(branch);
      const { root } = context.outputOf(repository);
      const base = join(root, ".silvermoon");
      try {
        await regular(base, true);
      } catch (error) {
        if (
          error instanceof SilvermoonError ||
          ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
        )
          return failure("silvermoon-folder-path-valid", error);
        throw error;
      }
      try {
        await readRegular(join(base, "config.yaml"), context.signal);
      } catch (error) {
        if (
          error instanceof SilvermoonError &&
          error.code === "concurrent-edit"
        )
          throw error;
        if (
          error instanceof SilvermoonError ||
          ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
        )
          return failure("silvermoon-folder-config-file-valid", error);
        throw error;
      }
      const ideas = join(base, "i");
      try {
        if (!(await absent(ideas))) await regular(ideas, true);
      } catch (error) {
        if (
          error instanceof SilvermoonError ||
          ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
        )
          return failure("silvermoon-folder-ideas-directory-valid", error);
        throw error;
      }
      return { pass: true, output: undefined };
    },
  });
}
