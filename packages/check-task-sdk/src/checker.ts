import type { Static, TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { types } from "node:util";
import { checkerName } from "./report.js";

export interface ProblemSource {
  readonly kind: "bundle";
  readonly bundleCid: string;
  readonly checker: string;
  readonly nodeKey: string;
}
export type Problem<Code extends string = string> = {
  readonly code: Code;
  readonly brief: string;
} & (
  | { readonly source?: never; readonly documentation?: never }
  | { readonly source: ProblemSource; readonly documentation: string }
);
export type CheckerResult<
  Item = { readonly checker: string; readonly target: object },
  Code extends string = string,
> =
  | { readonly pass: true; readonly children: readonly Item[] }
  | {
      readonly pass: false;
      readonly problems: readonly [Problem<Code>, ...Problem<Code>[]];
    };
export type Checker<Target, Result extends CheckerResult = CheckerResult> = (
  target: Target,
  signal: AbortSignal,
) => Promise<Result>;

export interface CheckerDefinition<
  Schema extends TObject = TObject,
  Result extends CheckerResult = CheckerResult,
> {
  readonly target: Schema;
  readonly check: Checker<Static<Schema>, Result>;
  readonly invoke: (target: unknown, signal: AbortSignal) => Promise<Result>;
  readonly accepts: (target: unknown) => boolean;
}
export type CheckerRegistry = Readonly<
  Record<
    string,
    {
      readonly target: TObject;
      readonly invoke: (
        target: unknown,
        signal: AbortSignal,
      ) => Promise<CheckerResult>;
      readonly accepts: (target: unknown) => boolean;
    }
  >
>;
export type CheckItem<R extends CheckerRegistry = CheckerRegistry> = {
  [K in keyof R & string]: {
    readonly checker: K;
    readonly target: Static<R[K]["target"]>;
  };
}[keyof R & string];
export type CheckedRegistry<R extends CheckerRegistry> = {
  readonly [K in keyof R]: Awaited<
    ReturnType<R[K]["invoke"]>
  > extends CheckerResult<CheckItem<R>>
    ? R[K]
    : never;
};
const definitions = new WeakSet<object>();
export function isCheckerDefinition(
  value: unknown,
): value is CheckerRegistry[string] {
  return value !== null && typeof value === "object" && definitions.has(value);
}
export function defineChecker<
  const Schema extends TObject,
  const Result extends CheckerResult,
>(definition: {
  readonly target: Schema;
  readonly check: (
    target: Static<Schema>,
    signal: AbortSignal,
  ) => Promise<Result>;
}): CheckerDefinition<Schema, Result> {
  const target = Value.Clone(definition.target);
  const freeze = (value: object) => {
    const children: unknown[] = Object.values(value);
    for (const child of children)
      if (child !== null && typeof child === "object") freeze(child);
    Object.freeze(value);
  };
  freeze(target);
  const check = definition.check;
  const result = Object.freeze({
    target,
    check,
    accepts: (input: unknown) => Value.Check(target, input),
    invoke: (input: unknown, signal: AbortSignal) => {
      if (!Value.Check(target, input))
        throw new Error("Invalid Checker target schema.");
      signal.throwIfAborted();
      const result = check(input, signal);
      if (!(result instanceof Promise))
        throw new Error("Checker must return a Promise.");
      return result;
    },
  });
  definitions.add(result);
  return result;
}

export function mergeCheckerRegistries<
  const A extends CheckerRegistry,
  const B extends CheckerRegistry,
>(
  left: A,
  right: B & (Extract<keyof A, keyof B> extends never ? unknown : never),
): A & B {
  const names = new Set<string>();
  for (const registry of [left, right]) {
    if (types.isProxy(registry))
      throw new Error("Unsupported Checker registry.");
    for (const key of Reflect.ownKeys(registry)) {
      const descriptor = Object.getOwnPropertyDescriptor(registry, key)!;
      if (
        !checkerName(key) ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        !isCheckerDefinition(descriptor.value)
      )
        throw new Error("Invalid Checker registry binding.");
      if (names.has(key)) throw new Error(`Duplicate Checker name: ${key}`);
      names.add(key);
    }
  }
  return Object.freeze(Object.assign({}, left, right));
}

export function failed<Code extends string>(
  problems: readonly Problem<Code>[],
): CheckerResult<never, Code> {
  const [first, ...rest] = problems;
  return first
    ? { pass: false, problems: [first, ...rest] }
    : { pass: true, children: [] };
}
