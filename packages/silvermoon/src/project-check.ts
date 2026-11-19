import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";
import { prerequisiteCheckpoints, type CheckExecution } from "./check.js";
import { ProjectTarget } from "./project-contract.js";
import { SilvermoonError } from "./domain.js";
import { withGitContext } from "./git-context.js";
import { preCommitHookPath, readRegular } from "./repository.js";

export function projectCheckpoints(execution: CheckExecution) {
  const prerequisites = prerequisiteCheckpoints(execution, ProjectTarget);
  const [, repository, , layout] = prerequisites;
  const preCommit = defineCheckpoint({
    id: "pre-commit",
    target: ProjectTarget,
    description: "有效 pre-commit hook 会检查暂存候选并阻止非法提交。",
    output: { description: "成功输出为 undefined，不安装或执行 hook。" },
    rules: [
      {
        code: "pre-commit-hook-configured",
        description:
          "Git 实际使用的可执行常规 pre-commit 文件必须以受管 shell 前缀执行 silvermoon check-changes --staged --audience agent，并在失败时退出。",
      },
    ],
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
  return [...prerequisites, preCommit] as const;
}
