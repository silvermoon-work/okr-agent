import type { Static, TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ProblemReporter } from "./index.js";

export type TargetSchemas = Record<string, TObject> & { $root: TObject };
export type Target<Schemas extends TargetSchemas> = {
  [Kind in keyof Schemas & string]: {
    readonly type: Kind;
    readonly selector: Static<Schemas[Kind]>;
  };
}[keyof Schemas & string];
export interface TargetProblem<Code extends string> {
  readonly code: Code;
  readonly brief: string;
}
export type TargetResult<Schemas extends TargetSchemas, Code extends string> =
  | { readonly pass: true; readonly targets: readonly Target<Schemas>[] }
  | {
      readonly pass: false;
      readonly problems: readonly [
        TargetProblem<Code>,
        ...TargetProblem<Code>[],
      ];
    };
export type TargetChecker<
  Schemas extends TargetSchemas,
  Code extends string,
  Kind extends keyof Schemas & string = keyof Schemas & string,
> = (
  target: Extract<Target<Schemas>, { readonly type: Kind }>,
) => Promise<TargetResult<Schemas, Code>> | TargetResult<Schemas, Code>;
export type RootTargetChecker<
  Schemas extends TargetSchemas,
  Code extends string,
> = TargetChecker<Schemas, Code, "$root">;
export type TargetCheckerRegistry<
  Schemas extends TargetSchemas,
  Code extends string,
> = {
  readonly [Kind in keyof Schemas & string]: TargetChecker<Schemas, Code, Kind>;
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fields(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

/** Bind author-owned rules; all traversal state belongs to a single invocation. */
export function createTargetCheckers<
  const Schemas extends TargetSchemas,
  Code extends string,
>(
  schemas: Schemas,
  registry: TargetCheckerRegistry<Schemas, Code>,
): (
  parameters: Static<Schemas["$root"]>,
  signal: AbortSignal,
  report: ProblemReporter<Code>,
) => Promise<void> {
  const types = Object.keys(schemas);
  if (
    !types.includes("$root") ||
    types.length !== Object.keys(registry).length ||
    types.some(
      (type) =>
        !Object.hasOwn(registry, type) || typeof registry[type] !== "function",
    )
  )
    throw new Error(
      "TargetChecker registry must match schemas and include $root.",
    );
  const definitions = { ...schemas };
  const checkers = { ...registry };
  const validate = (target: unknown): Target<Schemas> => {
    if (
      !object(target) ||
      !fields(target, ["type", "selector"]) ||
      typeof target.type !== "string"
    )
      throw new Error("Invalid target.");
    if (!Object.hasOwn(definitions, target.type))
      throw new Error(`Unknown target type: ${target.type}`);
    if (
      !object(target.selector) ||
      !Value.Check(definitions[target.type]!, target.selector)
    )
      throw new Error(`Invalid target selector: ${target.type}`);
    return target as Target<Schemas>;
  };
  return async (parameters, signal, report) => {
    const stack: Target<Schemas>[] = [
      validate({ type: "$root", selector: parameters }),
    ];
    while (stack.length) {
      signal.throwIfAborted();
      const target = stack.pop()!;
      // Validation establishes the correlation between type and selector.
      const checker = checkers[target.type] as (
        target: Target<Schemas>,
      ) => unknown;
      const result = await checker(target);
      signal.throwIfAborted();
      if (!object(result)) throw new Error("Invalid TargetChecker result.");
      if (result.pass === true && fields(result, ["pass", "targets"])) {
        if (!Array.isArray(result.targets))
          throw new Error("Invalid TargetChecker child targets.");
        const children = (result.targets as unknown[]).map(validate);
        for (const child of children.reverse()) stack.push(child);
      } else if (
        result.pass === false &&
        fields(result, ["pass", "problems"])
      ) {
        if (!Array.isArray(result.problems) || !result.problems.length)
          throw new Error("A failed TargetChecker requires nonempty problems.");
        for (const problem of result.problems as unknown[]) {
          if (
            !object(problem) ||
            !fields(problem, ["code", "brief"]) ||
            typeof problem.code !== "string" ||
            !problem.code.trim() ||
            typeof problem.brief !== "string" ||
            !problem.brief.trim()
          )
            throw new Error("Invalid TargetChecker problem.");
        }
        for (const problem of result.problems as TargetProblem<Code>[])
          report(problem.code, problem.brief);
      } else throw new Error("Invalid TargetChecker result.");
    }
    signal.throwIfAborted();
  };
}
