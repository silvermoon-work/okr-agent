import type { TaskContext } from "@silvermoon-work/task-sdk";

export { createCheckContract } from "./contracts.js";
export type { CheckContract } from "./contracts.js";
export type { JsonObject, JsonValue } from "./canonical.js";
export { defineChecker, mergeCheckerRegistries, failed } from "./checker.js";
export type {
  CheckerDefinition,
  Checker,
  CheckerRegistry,
  CheckItem,
  CheckerResult,
  Problem,
  ProblemSource,
} from "./checker.js";
export { executeCheck } from "./graph.js";
export type { CheckLimits, CheckOptions } from "./graph.js";
export { validateCheckReport } from "./report.js";
export type { CheckReport, ReportNode, ReportProblem } from "./report.js";
export { checkerFromBundle } from "./bundle.js";
export type { CheckExecutionPort } from "./bundle.js";
export { createCheckCallback, runCheck } from "./task.js";

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
