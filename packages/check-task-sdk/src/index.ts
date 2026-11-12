import {
  runTask,
  type TaskCallback,
  type TaskContext,
} from "@silvermoon-work/task-sdk";
import type { Static, TSchema } from "@sinclair/typebox";
import {
  problemCodes,
  type CheckContract,
  type CheckProblem,
  type CheckResult,
} from "./contracts.js";

export { createCheckContract } from "./contracts.js";
export type { CheckContract, CheckProblem, CheckResult } from "./contracts.js";

export interface CheckContext {
  readonly signal: TaskContext["signal"];
  readonly log: TaskContext["log"];
  readonly progress: TaskContext["progress"];
  readonly bundle: TaskContext["bundle"];
  readonly space: TaskContext["space"];
  readonly invokeTask: TaskContext["invokeTask"];
}
export type ProblemReporter<Code extends string> = (
  code: Code,
  brief: string,
) => void;
export interface CheckOutputOptions {
  readonly assets?: boolean;
}
export type CheckCallback<Input, Code extends string> = (
  input: Input,
  context: CheckContext,
  reportProblem: ProblemReporter<Code>,
) => Promise<void>;

/** Adapt a check without starting a Worker, for composition with upstream runTask. */
export function createCheckCallback<
  Input extends TSchema,
  Code extends TSchema,
>(
  contract: CheckContract<Input, Code>,
  callback: CheckCallback<Static<Input>, Extract<Static<Code>, string>>,
  options: CheckOutputOptions = {},
): TaskCallback<Static<Input>, CheckResult<Extract<Static<Code>, string>>> {
  type ProblemCode = Extract<Static<Code>, string>;
  const assets = options.assets ?? false;
  if (typeof assets !== "boolean")
    throw new Error("Check output assets option must be a boolean.");
  const codes = new Set(problemCodes(contract.schemas["check-problem-code"]));
  return async (input, context) => {
    const problems: CheckProblem<ProblemCode>[] = [];
    let open = true;
    let reportFailure: Error | undefined;
    const report: ProblemReporter<ProblemCode> = (code, brief) => {
      const error = !open
        ? new Error("Problem reporter is closed.")
        : !codes.has(code) || typeof brief !== "string" || !brief.trim()
          ? new Error(
              "A problem requires a declared code and a nonempty brief.",
            )
          : undefined;
      if (error) {
        reportFailure ??= error;
        throw error;
      }
      problems.push(
        Object.freeze({
          code,
          brief,
          documentation: `references/problems/${code}.md`,
        }),
      );
    };
    const restricted = Object.freeze<CheckContext>({
      signal: context.signal,
      log: (value) => context.log(value),
      progress: (value) => context.progress(value),
      bundle: context.bundle,
      space: (cid) => context.space(cid),
      invokeTask: (request) => context.invokeTask(request),
    });
    try {
      context.signal.throwIfAborted();
      await callback(input, restricted, report);
    } finally {
      open = false;
    }
    if (reportFailure) throw reportFailure;
    context.signal.throwIfAborted();
    await context.output.link(
      "references",
      context.bundle.root.resolve("resources/references"),
    );
    if (assets) {
      context.signal.throwIfAborted();
      await context.output.link(
        "assets",
        context.bundle.root.resolve("resources/assets"),
      );
    }
    context.signal.throwIfAborted();
    const documentation = "references/check.md";
    if (!problems.length) return Object.freeze({ pass: true, documentation });
    return Object.freeze({
      pass: false,
      documentation,
      problems: Object.freeze([...problems]) as readonly [
        CheckProblem<ProblemCode>,
        ...CheckProblem<ProblemCode>[],
      ],
    });
  };
}

export function runCheck<Input extends TSchema, Code extends TSchema>(
  contract: CheckContract<Input, Code>,
  callback: CheckCallback<Static<Input>, Extract<Static<Code>, string>>,
  options: CheckOutputOptions = {},
): void {
  runTask(createCheckCallback(contract, callback, options));
}
