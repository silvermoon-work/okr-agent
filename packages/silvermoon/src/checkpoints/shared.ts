import type { CheckpointResult } from "@silvermoon-work/check-task-sdk";
import type { Runtime, Target } from "../contract.js";
import { withGitContext } from "../git-context.js";
import { git } from "../repository.js";

export interface CheckExecution {
  readonly runtime: Runtime;
  readonly refresh?: boolean;
  readonly localRemote?: string;
}
export function failure<const Code extends string>(
  code: Code,
  error: unknown,
): Extract<CheckpointResult<never, Code>, { pass: false }> {
  return {
    pass: false,
    problems: [
      { code, brief: error instanceof Error ? error.message : String(error) },
    ],
  };
}
export function nativeCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}
export function synchronized(
  execution: CheckExecution,
  target: Target,
  tip: string,
  signal: AbortSignal,
) {
  return withGitContext(
    { userHome: target.userHome, ...execution.runtime },
    async () => {
      const changes = await git(
        target.repoRoot,
        ["status", "--porcelain=v1", "--untracked-files=all"],
        signal,
      );
      const head = await git(
        target.repoRoot,
        ["rev-parse", "--verify", "HEAD"],
        signal,
      );
      return !changes && head === tip;
    },
  );
}
