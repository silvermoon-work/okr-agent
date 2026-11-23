import { setTimeout as yieldLoop } from "node:timers/promises";
import { types } from "node:util";
import { exactCid } from "./legacy-report.js";
import {
  canonicalSnapshot,
  compare,
  fields,
  jsonObject,
  type JsonObject,
} from "./canonical.js";
import {
  isCheckerDefinition,
  type CheckedRegistry,
  type CheckerRegistry,
  type CheckItem,
} from "./checker.js";
import {
  checkerName,
  documentPath,
  outputSource,
  portableCode,
  freezeReport,
  type CheckReport,
  type ReportNode,
  type ReportProblem,
} from "./legacy-report.js";

export interface CheckLimits {
  readonly concurrency: number;
  readonly nodes: number;
  readonly children: number;
  readonly targetBytes: number;
  readonly encodingBytes: number;
  readonly depth: number;
  readonly values: number;
  readonly resultBytes: number;
  readonly problems: number;
  readonly timeoutMs: number;
}
const defaults: CheckLimits = {
  concurrency: 4,
  nodes: 4096,
  children: 16_384,
  targetBytes: 65_536,
  encodingBytes: 16_777_216,
  depth: 64,
  values: 16_384,
  resultBytes: 16_777_216,
  problems: 16_384,
  timeoutMs: 60_000,
};
const maximum: CheckLimits = {
  concurrency: 64,
  nodes: 16_384,
  children: 65_536,
  targetBytes: 1_048_576,
  encodingBytes: 67_108_864,
  depth: 64,
  values: 16_384,
  resultBytes: 67_108_864,
  problems: 65_536,
  timeoutMs: 2_147_483_647,
};
interface Node {
  readonly key: string;
  readonly item: { readonly checker: string; readonly target: JsonObject };
  readonly parent?: string;
  pass?: boolean;
  readonly problems: ReportProblem[];
}
export interface CheckOptions<R extends CheckerRegistry> {
  readonly registry:
    | (R & CheckedRegistry<R>)
    | ((
        signal: AbortSignal,
      ) => (R & CheckedRegistry<R>) | Promise<R & CheckedRegistry<R>>);
  readonly root: CheckItem<R>;
  readonly signal: AbortSignal;
  readonly limits?: Partial<CheckLimits>;
  readonly problemCodes?: readonly string[];
  readonly log?: (node: ReportNode) => void | Promise<void>;
}

export async function executeCheck<const R extends CheckerRegistry>(
  options: CheckOptions<R>,
): Promise<CheckReport> {
  return executeCheckInput(options);
}

export async function executeCheckInput(options: {
  readonly registry:
    | CheckerRegistry
    | ((signal: AbortSignal) => CheckerRegistry | Promise<CheckerRegistry>);
  readonly root: unknown;
  readonly signal: AbortSignal;
  readonly limits?: Partial<CheckLimits>;
  readonly problemCodes?: readonly string[];
  readonly log?: (node: ReportNode) => void | Promise<void>;
}): Promise<CheckReport> {
  const limits = { ...defaults, ...options.limits };
  for (const key of Object.keys(limits) as (keyof CheckLimits)[])
    if (
      !Object.hasOwn(maximum, key) ||
      !Number.isSafeInteger(limits[key]) ||
      limits[key] <= 0 ||
      limits[key] > maximum[key]
    )
      throw new Error(`Invalid Check limit: ${key}`);
  options.signal.throwIfAborted();
  const controller = new AbortController();
  const signal = controller.signal;
  const errors: unknown[] = [];
  let stopping = false;
  const isStopping = () => stopping;
  const stop = (error: unknown) => {
    if (
      stopping &&
      (error === signal.reason ||
        (error instanceof Error &&
          error.name === "AbortError" &&
          error.cause === signal.reason))
    )
      return;
    errors.push(error);
    if (!stopping) {
      stopping = true;
      controller.abort(error);
    }
  };
  const abort = () => {
    stop(options.signal.reason);
  };
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  const timer = setTimeout(() => {
    stop(new Error("Check execution time budget exceeded."));
  }, limits.timeoutMs);
  const nodes = new Map<string, Node>();
  const queue: Node[] = [];
  const running = new Set<Promise<void>>();
  const codes = options.problemCodes
    ? new Set(options.problemCodes)
    : undefined;
  let encodedBytes = 0;
  let resultBytes = 0;
  let childCount = 0;
  let problemCount = 0;
  let completed = 0;
  let cursor = 0;
  try {
    const supplied: unknown =
      typeof options.registry === "function"
        ? await options.registry(signal)
        : options.registry;
    signal.throwIfAborted();
    if (!supplied || typeof supplied !== "object" || types.isProxy(supplied))
      throw new Error("Invalid Checker registry.");
    const registry = new Map<string, CheckerRegistry[string]>();
    for (const key of Reflect.ownKeys(supplied)) {
      const descriptor = Object.getOwnPropertyDescriptor(supplied, key)!;
      if (
        !checkerName(key) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      )
        throw new Error("Invalid Checker registry binding.");
      const definition: unknown = descriptor.value;
      if (!isCheckerDefinition(definition))
        throw new Error("Registry requires CheckerDefinitions.");
      registry.set(key, definition);
    }
    const register = (raw: unknown, parent?: Node): Node => {
      signal.throwIfAborted();
      const snapshot = canonicalSnapshot(raw, {
        bytes: limits.targetBytes + 256,
        depth: limits.depth + 1,
        values: limits.values + 3,
      });
      const item = snapshot.value;
      if (
        !jsonObject(item) ||
        !fields(item, ["checker", "target"]) ||
        !checkerName(item.checker) ||
        !jsonObject(item.target)
      )
        throw new Error("Invalid CheckItem.");
      const definition = registry.get(item.checker);
      if (!definition) throw new Error(`Unknown Checker: ${item.checker}`);
      const target = canonicalSnapshot(item.target, {
        bytes: limits.targetBytes,
        depth: limits.depth,
        values: limits.values,
      });
      if (!definition.accepts(target.value))
        throw new Error(`Invalid Checker target schema: ${item.checker}`);
      encodedBytes += target.bytes;
      if (encodedBytes > limits.encodingBytes)
        throw new Error("Check total encoding budget exceeded.");
      const key = `[${JSON.stringify(item.checker)},${target.encoded}]`;
      let node = nodes.get(key);
      if (!node) {
        if (nodes.size === limits.nodes)
          throw new Error("Check node budget exceeded.");
        node = {
          key,
          item: { checker: item.checker, target: item.target },
          ...(parent ? { parent: parent.key } : {}),
          problems: [],
        };
        nodes.set(key, node);
        queue.push(node);
      }
      return node;
    };
    register(options.root);
    const execute = async (node: Node) => {
      const raw: unknown = await registry
        .get(node.item.checker)!
        .invoke(node.item.target, signal);
      if (stopping) return;
      const snapshot = canonicalSnapshot(raw, {
        bytes: limits.resultBytes - resultBytes,
        depth: limits.depth + 5,
        values: 262_144,
      });
      resultBytes += snapshot.bytes;
      const result = snapshot.value;
      if (!jsonObject(result)) throw new Error("Invalid Checker result.");
      if (
        result.pass === true &&
        fields(result, ["pass", "children"]) &&
        Array.isArray(result.children)
      ) {
        childCount += result.children.length;
        if (childCount > limits.children)
          throw new Error("Check child attempt budget exceeded.");
        node.pass = true;
        for (const child of result.children) register(child, node);
      } else if (
        result.pass === false &&
        fields(result, ["pass", "problems"]) &&
        Array.isArray(result.problems) &&
        result.problems.length
      ) {
        for (const problem of result.problems) {
          if (++problemCount > limits.problems)
            throw new Error("Check problem budget exceeded.");
          if (
            !jsonObject(problem) ||
            !portableCode(problem.code) ||
            typeof problem.brief !== "string" ||
            !problem.brief.trim()
          )
            throw new Error("Invalid Checker problem.");
          let source: ReportProblem["source"];
          let documentation: string;
          if (Object.hasOwn(problem, "source")) {
            if (
              !fields(problem, ["code", "brief", "source", "documentation"]) ||
              !documentPath(problem.documentation)
            )
              throw new Error("Invalid external Checker problem.");
            source = outputSource(problem.source);
            exactCid(problem.documentation);
            documentation = problem.documentation;
          } else {
            if (
              !fields(problem, ["code", "brief"]) ||
              (codes && !codes.has(problem.code))
            )
              throw new Error(
                "Checker problem requires a declared local code.",
              );
            source = {
              kind: "local",
              checker: node.item.checker,
              nodeKey: node.key,
            };
            documentation = `references/problems/${problem.code}.md`;
          }
          node.problems.push({
            code: problem.code,
            brief: problem.brief,
            documentation,
            nodeKey: node.key,
            source,
          });
        }
        node.pass = false;
      } else throw new Error("Invalid Checker result.");
      if (options.log) {
        const record: ReportNode = Object.freeze({
          key: node.key,
          item: Object.freeze(node.item),
          ...(node.parent ? { parent: node.parent } : {}),
          pass: node.pass,
        });
        await options.log(record);
        signal.throwIfAborted();
      }
    };
    while (!isStopping() && (cursor < queue.length || running.size)) {
      if (completed >= 64) {
        completed = 0;
        await yieldLoop(0);
      }
      while (
        !isStopping() &&
        running.size < limits.concurrency &&
        cursor < queue.length
      ) {
        const node = queue[cursor++]!;
        const work = execute(node)
          .catch(stop)
          .finally(() => {
            running.delete(work);
            completed++;
          });
        running.add(work);
      }
      if (running.size) await Promise.race(running);
    }
    await Promise.all(running);
    if (isStopping()) throw errors[0];
    const ordered = [...nodes.values()].sort((a, b) => compare(a.key, b.key));
    const problems = ordered.flatMap((node) => node.problems);
    const base = {
      documentation: "references/check.md",
    };
    const [first, ...rest] = problems;
    const report: CheckReport = first
      ? { ...base, pass: false, problems: [first, ...rest] }
      : { ...base, pass: true };
    canonicalSnapshot(report, {
      bytes: limits.resultBytes,
      depth: limits.depth + 8,
      values: 1_048_576,
    });
    return freezeReport(report);
  } catch (error) {
    if (!errors.includes(error)) stop(error);
    await Promise.all(running);
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        `Check execution and cleanup failed: ${errors[0] instanceof Error ? errors[0].message : String(errors[0])}`,
        { cause: error },
      );
    throw errors[0];
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
  }
}
