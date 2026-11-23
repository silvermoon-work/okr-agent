import {
  isCheckpointDefinition,
  type CheckpointContext,
  type CheckpointDefinition,
} from "./checkpoint.js";
import type { CheckReport } from "./report.js";

export interface CheckpointLog {
  readonly checkpoint: string;
  readonly pass: boolean;
}
export type ReportNode = CheckpointLog;
export interface CheckOptions {
  readonly checkpoints: readonly CheckpointDefinition[];
  readonly target: object;
  readonly signal: AbortSignal;
  readonly log?: (step: CheckpointLog) => void | Promise<void>;
}

export async function executeCheck(
  options: CheckOptions,
): Promise<CheckReport> {
  options.signal.throwIfAborted();
  const checkpoints = [...options.checkpoints];
  const ids = new Set<string>();
  for (const checkpoint of checkpoints) {
    if (!isCheckpointDefinition(checkpoint) || ids.has(checkpoint.id))
      throw new Error("Invalid or duplicate checkpoint definition.");
    ids.add(checkpoint.id);
  }
  const outputs = new Map<CheckpointDefinition, unknown>();
  const context = Object.freeze<CheckpointContext>({
    signal: options.signal,
    outputOf: (checkpoint) => {
      options.signal.throwIfAborted();
      if (!outputs.has(checkpoint))
        throw new Error(
          "Checkpoint output is not available in this invocation.",
        );
      return outputs.get(checkpoint) as never;
    },
  });
  try {
    for (const checkpoint of checkpoints) {
      options.signal.throwIfAborted();
      const result = await checkpoint.invoke(options.target, context);
      options.signal.throwIfAborted();
      if (options.log) {
        await options.log({ checkpoint: checkpoint.id, pass: result.pass });
        options.signal.throwIfAborted();
      }
      if (!result.pass) {
        const [first, ...rest] = result.problems.map((problem) => ({
          checkpoint: checkpoint.id,
          code: problem.code,
          brief: problem.brief,
        }));
        return {
          pass: false,
          documentation: "references/check.md",
          references: [
            {
              checkpoint: checkpoint.id,
              documentation: `references/checkpoints/${checkpoint.id}.md`,
            },
          ],
          problems: [first!, ...rest],
        };
      }
      outputs.set(checkpoint, result.output);
    }
    return { pass: true, documentation: "references/check.md", references: [] };
  } finally {
    outputs.clear();
  }
}
