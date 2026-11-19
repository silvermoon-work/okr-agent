import type { Static, TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { portableIdentifier } from "./contracts.js";

export interface Rule<Code extends string = string> {
  readonly code: Code;
  readonly description: string;
}
export interface RuleFailure<Code extends string = string> {
  readonly code: Code;
  readonly brief: string;
}
export type Problem<Code extends string = string> = RuleFailure<Code>;
export type CheckpointResult<Output = unknown, Code extends string = string> =
  | { readonly pass: true; readonly output: Output }
  | {
      readonly pass: false;
      readonly problems: readonly [RuleFailure<Code>, ...RuleFailure<Code>[]];
    };

export interface CheckpointContext {
  readonly signal: AbortSignal;
  readonly outputOf: <Schema extends TObject, Output, Code extends string>(
    checkpoint: CheckpointDefinition<Schema, Output, Code>,
  ) => Readonly<Output>;
}
export interface CheckpointDefinition<
  Schema extends TObject = TObject,
  Output = unknown,
  Code extends string = string,
> {
  readonly id: string;
  readonly target: Schema;
  readonly description: string;
  readonly rules: readonly [Rule<Code>, ...Rule<Code>[]];
  readonly accepts: (target: unknown) => boolean;
  readonly invoke: (
    target: unknown,
    context: CheckpointContext,
  ) => Promise<CheckpointResult<Output, Code>>;
}

const definitions = new WeakSet<object>();
export function isCheckpointDefinition(
  value: unknown,
): value is CheckpointDefinition {
  return typeof value === "object" && value !== null && definitions.has(value);
}
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const exactFields = (value: object, fields: readonly string[]) =>
  Reflect.ownKeys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));

export function validateCheckpointResult(
  value: unknown,
  rules: readonly Rule[],
): asserts value is CheckpointResult {
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid checkpoint result.");
  if (
    "pass" in value &&
    value.pass === true &&
    exactFields(value, ["pass", "output"])
  )
    return;
  if (
    !("pass" in value) ||
    value.pass !== false ||
    !exactFields(value, ["pass", "problems"]) ||
    !("problems" in value) ||
    !Array.isArray(value.problems) ||
    value.problems.length === 0
  )
    throw new Error("Invalid checkpoint result.");
  for (const entry of value.problems) {
    const problem: unknown = entry;
    if (
      typeof problem !== "object" ||
      problem === null ||
      !exactFields(problem, ["code", "brief"]) ||
      !("code" in problem) ||
      !rules.some((rule) => rule.code === problem.code) ||
      !("brief" in problem) ||
      !nonempty(problem.brief)
    )
      throw new Error("Invalid or undeclared checkpoint rule failure.");
  }
}

export function defineCheckpoint<
  const Schema extends TObject,
  const Rules extends readonly [Rule, ...Rule[]],
  Output,
>(definition: {
  readonly id: string;
  readonly target: Schema;
  readonly description: string;
  readonly rules: Rules;
  readonly check: (
    target: Static<Schema>,
    context: CheckpointContext,
  ) => Promise<CheckpointResult<Output, Rules[number]["code"]>>;
}): CheckpointDefinition<Schema, Output, Rules[number]["code"]> {
  if (!portableIdentifier(definition.id) || !nonempty(definition.description))
    throw new Error("Invalid checkpoint ID or description.");
  if (
    !Array.isArray(definition.rules) ||
    !definition.rules.length ||
    definition.rules.some(
      (rule) => !portableIdentifier(rule.code) || !nonempty(rule.description),
    ) ||
    new Set(definition.rules.map((rule) => rule.code)).size !==
      definition.rules.length
  )
    throw new Error("Invalid or duplicate checkpoint rules.");
  const target = Value.Clone(definition.target);
  const rules = Object.freeze(
    definition.rules.map((rule) => Object.freeze({ ...rule })),
  ) as unknown as Rules;
  const check = definition.check;
  const result = Object.freeze({
    id: definition.id,
    description: definition.description,
    target,
    rules,
    accepts: (input: unknown) => Value.Check(target, input),
    invoke: async (input: unknown, context: CheckpointContext) => {
      context.signal.throwIfAborted();
      if (!Value.Check(target, input))
        throw new Error("Invalid checkpoint target schema.");
      const pending = check(input, context);
      if (!(pending instanceof Promise))
        throw new Error("Checkpoint must return a Promise.");
      const value = await pending;
      context.signal.throwIfAborted();
      validateCheckpointResult(value, rules);
      return value;
    },
  });
  definitions.add(result);
  return result;
}

export function failed<const Code extends string = never>(
  problems: readonly RuleFailure<Code>[],
): CheckpointResult<undefined, Code> {
  const [first, ...rest] = problems;
  return first
    ? { pass: false, problems: [first, ...rest] }
    : { pass: true, output: undefined };
}
