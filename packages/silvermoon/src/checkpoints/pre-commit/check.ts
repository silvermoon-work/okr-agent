import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { ProjectTarget } from "../../project-contract.js";
import { SilvermoonError } from "../../domain.js";
import { withGitContext } from "../../git-context.js";
import { preCommitHookPath, readRegular } from "../../repository.js";
import type { CheckExecution } from "../shared.js";
import type { repositoryCheckpoint } from "../repository/check.js";
import type { layoutCheckpoint } from "../silvermoon-folder/check.js";
export function preCommitCheckpoint(
  execution: CheckExecution,
  repository: ReturnType<typeof repositoryCheckpoint>,
  layout: ReturnType<typeof layoutCheckpoint>,
) {
  return defineCheckpoint({
    ...documentation,
    target: ProjectTarget,
    check: async (target, context) => {
      context.outputOf(layout);
      const { root } = context.outputOf(repository);
      const path = await withGitContext(
        { userHome: target.userHome, ...execution.runtime },
        () => preCommitHookPath(root, context.signal),
      );
      try {
        const content = new TextDecoder("utf-8", { fatal: true }).decode(
          await readRegular(path, context.signal),
        );
        if (process.platform !== "win32") await access(path, constants.X_OK);
        const prefix =
          "#!/bin/sh\n" +
          "# BEGIN Silvermoon check-changes\n" +
          "silvermoon check-changes --staged --audience agent || exit $?\n" +
          "# END Silvermoon check-changes\n";
        const normalized =
          process.platform === "win32"
            ? content.replaceAll("\r\n", "\n")
            : content;
        if (normalized.startsWith(prefix))
          return { pass: true, output: undefined };
      } catch (error) {
        context.signal.throwIfAborted();
        if (
          !(
            error instanceof SilvermoonError &&
            ["path", "capacity"].includes(error.code)
          ) &&
          !(error instanceof TypeError) &&
          !(
            error instanceof Error &&
            "code" in error &&
            ["ENOENT", "ENOTDIR", "EACCES"].includes(String(error.code))
          )
        )
          throw error;
      }
      return {
        pass: false,
        problems: [
          {
            code: "pre-commit-hook-configured",
            brief: `Configure the effective executable pre-commit hook at ${path} with the documented fail-closed Silvermoon prefix; preserve existing hook logic.`,
          },
        ],
      };
    },
  });
}
