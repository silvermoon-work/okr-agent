import { Type } from "@sinclair/typebox";
import {
  defineChecker,
  type CheckerResult,
  type Problem,
} from "@silvermoon-work/check-task-sdk/legacy";
import type { ProblemCode } from "../contract.js";
import { FindingGroup } from "./rules.js";

export const configurationTargetSchema = Type.Object(
  {
    path: Type.String(),
    directories: Type.Array(Type.String(), { minItems: 1, uniqueItems: true }),
  },
  { additionalProperties: false },
);
export type ConfigurationKind =
  "typescript" | "lint" | "vitest" | "testing" | "coverage";
export function configurationRegistry<
  Item extends { readonly checker: string; readonly target: object },
>(
  signal: AbortSignal,
  path: (kind: ConfigurationKind, directory: string) => string,
  checks: Readonly<
    Record<
      ConfigurationKind,
      (
        target: { directory: string },
        group: FindingGroup,
      ) => Promise<CheckerResult<Item, ProblemCode>>
    >
  >,
) {
  const definition = (kind: ConfigurationKind) =>
    defineChecker({
      target: configurationTargetSchema,
      check: async (target): Promise<CheckerResult<Item, ProblemCode>> => {
        const group = new FindingGroup();
        const problems: Problem<ProblemCode>[] = [];
        const children: Item[] = [];
        for (const directory of target.directories) {
          signal.throwIfAborted();
          if (path(kind, directory) !== target.path)
            throw new Error(
              "Configuration target does not match its member scope.",
            );
          const result = await checks[kind]({ directory }, group);
          if (result.pass) children.push(...result.children);
          else problems.push(...result.problems);
        }
        const [first, ...rest] = group.finish(problems);
        return first
          ? { pass: false, problems: [first, ...rest] }
          : { pass: true, children };
      },
    });
  return {
    typescript: definition("typescript"),
    lint: definition("lint"),
    vitest: definition("vitest"),
    testing: definition("testing"),
    coverage: definition("coverage"),
  };
}
