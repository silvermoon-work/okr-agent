import type {
  ProblemReporter,
  Problem,
  CheckerResult,
} from "@silvermoon-work/check-task-sdk";
import {
  ProblemCode as ProblemCodeSchema,
  type ProblemCode,
} from "../contract.js";
import { Value } from "@sinclair/typebox/value";
import { Unconfirmed } from "../files.js";

export interface Scope {
  readonly member: string;
  path: string | undefined;
  details: string;
}
export type Domain =
  | "scope"
  | "dependency"
  | "typescript"
  | "lint"
  | "formatting"
  | "testing"
  | "coverage"
  | "gate"
  | "ci";
export type Status = "missing" | "mismatch" | "unconfirmed";
export interface Findings {
  issue(this: void, domain: Domain, status: Status, evidence: string): void;
  scopeIssue(
    this: void,
    domain: Domain,
    status: Status,
    path: string,
    reason: string,
    member: string,
    evidence: string,
  ): void;
}
/** One configuration node owns these scope findings; this never merges graph nodes. */
export class FindingGroup {
  private readonly scoped = new Set<Problem>();
  private readonly roots = new Map<
    string,
    { code: ProblemCode; brief: string; members: string[] }
  >();
  add(
    problem: Problem<ProblemCode>,
    path: string,
    reason: string,
    evidence: string,
  ): void {
    this.scoped.add(problem);
    const key = JSON.stringify([problem.code, path, reason]);
    const existing = this.roots.get(key);
    if (existing) existing.members.push(evidence);
    else
      this.roots.set(key, {
        code: problem.code,
        brief: `${path}: ${reason}`,
        members: [evidence],
      });
  }
  finish(problems: readonly Problem<ProblemCode>[]): Problem<ProblemCode>[] {
    return [
      ...problems.filter((problem) => !this.scoped.has(problem)),
      ...[...this.roots]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, entry]) => ({
          code: entry.code,
          brief: `${entry.brief}；影响范围: ${entry.members.join("；")}`,
        })),
    ];
  }
}
export function ruleScope<Item>(
  signal: AbortSignal,
  member?: string,
  group?: FindingGroup,
) {
  const scopeContext: Scope | undefined =
    member === undefined ? undefined : { member, path: undefined, details: "" };
  return {
    scopeContext,
    section: async (
      domain: Domain,
      action: (findings: Findings) => Promise<void> | void,
    ): Promise<CheckerResult<Item, ProblemCode>> => {
      signal.throwIfAborted();
      const problems: Problem<ProblemCode>[] = [];
      const issue: Findings["issue"] = (domain, status, brief) => {
        const code = `${domain}-${status}`;
        if (!Value.Check(ProblemCodeSchema, code))
          throw new Error("Undeclared project problem.");
        problems.push({ code, brief });
      };
      const scopeIssue: Findings["scopeIssue"] = (
        domain,
        status,
        path,
        reason,
        member,
        evidence,
      ) => {
        issue(
          domain,
          status,
          `${path}: ${reason}；影响范围: ${evidence || member}`,
        );
        group?.add(
          problems[problems.length - 1]!,
          path,
          reason,
          evidence || member,
        );
      };
      try {
        await action({ issue, scopeIssue });
      } catch (error) {
        if (!(error instanceof Unconfirmed)) throw error;
        if (scopeContext?.path)
          scopeIssue(
            domain,
            "unconfirmed",
            scopeContext.path,
            error.message,
            scopeContext.member,
            `成员=${scopeContext.member}；配置=${scopeContext.path}；实际 root=${scopeContext.member}；${scopeContext.details}`,
          );
        else
          issue(
            domain,
            "unconfirmed",
            `${scopeContext ? `成员=${scopeContext.member}；实际 root=${scopeContext.member}；` : ""}${error.message}`,
          );
      }
      signal.throwIfAborted();
      const [first, ...rest] = problems;
      return first
        ? { pass: false, problems: [first, ...rest] }
        : { pass: true, children: [] };
    },
  };
}

export async function collectProblems<Item>(
  action: (report: ProblemReporter<ProblemCode>) => Promise<void>,
): Promise<CheckerResult<Item, ProblemCode>> {
  const problems: Problem<ProblemCode>[] = [];
  await action((code, brief) => problems.push({ code, brief }));
  const [first, ...rest] = problems;
  return first
    ? { pass: false, problems: [first, ...rest] }
    : { pass: true, children: [] };
}
