import { validateBundleReference } from "@silvermoon-work/task-protocol";
import {
  canonicalSnapshot,
  compare,
  fields,
  jsonObject,
  type JsonObject,
} from "./canonical.js";
import type { ProblemSource } from "./checker.js";

export const reportProtocol = "check-report/v2";
export const checkerName = (name: unknown): name is string =>
  typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(name);
export const portableCode = (code: unknown): code is string =>
  typeof code === "string" &&
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(code) &&
  !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(code);
export interface ReportNode {
  readonly key: string;
  readonly item: { readonly checker: string; readonly target: JsonObject };
  readonly pass: boolean;
}
export interface ReportProblem {
  readonly code: string;
  readonly brief: string;
  readonly documentation: string;
  readonly nodeKey: string;
  readonly source:
    | ProblemSource
    | {
        readonly kind: "local";
        readonly checker: string;
        readonly nodeKey: string;
      };
}
interface ReportBody {
  readonly protocol: typeof reportProtocol;
  readonly documentation: string;
  readonly root: string;
  readonly nodes: readonly ReportNode[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
}
export type CheckReport = ReportBody &
  (
    | { readonly pass: true }
    | {
        readonly pass: false;
        readonly problems: readonly [ReportProblem, ...ReportProblem[]];
      }
  );
export function freezeReport(report: CheckReport): CheckReport {
  for (const node of report.nodes) {
    Object.freeze(node.item);
    Object.freeze(node);
  }
  for (const edge of report.edges) Object.freeze(edge);
  Object.freeze(report.nodes);
  Object.freeze(report.edges);
  if (!report.pass) {
    for (const problem of report.problems) {
      Object.freeze(problem.source);
      Object.freeze(problem);
    }
    Object.freeze(report.problems);
  }
  return Object.freeze(report);
}

export function exactCid(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected an exact CID.");
  const reference = validateBundleReference(value);
  if (typeof reference !== "string") throw new Error("Expected an exact CID.");
  return reference;
}
export function documentPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !/[\\:]/.test(value) &&
    ![...value].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) &&
    value
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..")
  );
}
export function outputSource(value: unknown): ProblemSource {
  const parsed = canonicalSnapshot(value).value;
  if (
    !jsonObject(parsed) ||
    !fields(parsed, ["kind", "bundleCid", "outputCid", "checker", "nodeKey"]) ||
    parsed.kind !== "output" ||
    !checkerName(parsed.checker) ||
    typeof parsed.nodeKey !== "string" ||
    !parsed.nodeKey
  )
    throw new Error("Invalid Check problem output source.");
  let identity: unknown;
  try {
    identity = JSON.parse(parsed.nodeKey) as unknown;
  } catch (cause) {
    throw new Error("Invalid source node key.", { cause });
  }
  const snapshot = canonicalSnapshot(identity, {
    bytes: 65_536,
    depth: 66,
    values: 16_386,
  });
  if (
    !Array.isArray(snapshot.value) ||
    snapshot.value.length !== 2 ||
    snapshot.value[0] !== parsed.checker ||
    !jsonObject(snapshot.value[1]) ||
    snapshot.encoded !== parsed.nodeKey
  )
    throw new Error("Invalid source node key.");
  return {
    kind: "output",
    bundleCid: exactCid(parsed.bundleCid),
    outputCid: exactCid(parsed.outputCid),
    checker: parsed.checker,
    nodeKey: parsed.nodeKey,
  };
}

/** Validate the complete graph, not just a Task's arbitrary pass boolean. */
export function validateCheckReport(
  input: unknown,
  maxBytes = 65_536,
): CheckReport {
  const report = canonicalSnapshot(input, {
    bytes: maxBytes,
    depth: 72,
    values: 262_144,
  }).value;
  if (
    !jsonObject(report) ||
    report.protocol !== reportProtocol ||
    !documentPath(report.documentation) ||
    typeof report.root !== "string" ||
    typeof report.pass !== "boolean" ||
    !Array.isArray(report.nodes) ||
    !Array.isArray(report.edges) ||
    !fields(report, [
      "protocol",
      "documentation",
      "root",
      "nodes",
      "edges",
      "pass",
      ...(!report.pass ? ["problems"] : []),
    ])
  )
    throw new Error("Invalid check-report/v2 protocol.");
  const nodes: ReportNode[] = [];
  const indexed = new Map<string, ReportNode>();
  for (const raw of report.nodes) {
    if (
      !jsonObject(raw) ||
      !fields(raw, ["key", "item", "pass"]) ||
      typeof raw.key !== "string" ||
      typeof raw.pass !== "boolean" ||
      !jsonObject(raw.item) ||
      !fields(raw.item, ["checker", "target"]) ||
      !checkerName(raw.item.checker) ||
      !jsonObject(raw.item.target) ||
      canonicalSnapshot([raw.item.checker, raw.item.target], {
        bytes: maxBytes,
        depth: 66,
        values: 16_386,
      }).encoded !== raw.key ||
      indexed.has(raw.key)
    )
      throw new Error("Invalid Check report node identity.");
    const node = {
      key: raw.key,
      item: { checker: raw.item.checker, target: raw.item.target },
      pass: raw.pass,
    };
    indexed.set(raw.key, node);
    nodes.push(node);
  }
  if (!indexed.has(report.root))
    throw new Error("Check report root is absent.");
  const edges: { from: string; to: string }[] = [];
  const edgeKeys = new Set<string>();
  for (const raw of report.edges) {
    if (
      !jsonObject(raw) ||
      !fields(raw, ["from", "to"]) ||
      typeof raw.from !== "string" ||
      typeof raw.to !== "string" ||
      !indexed.get(raw.from)?.pass ||
      !indexed.has(raw.to)
    )
      throw new Error("Invalid Check report edge.");
    const key = JSON.stringify([raw.from, raw.to]);
    if (edgeKeys.has(key)) throw new Error("Duplicate Check report edge.");
    edgeKeys.add(key);
    edges.push({ from: raw.from, to: raw.to });
  }
  const reachable = new Set([report.root]);
  for (let changed = true; changed;) {
    changed = false;
    for (const edge of edges)
      if (reachable.has(edge.from) && !reachable.has(edge.to)) {
        reachable.add(edge.to);
        changed = true;
      }
  }
  if (reachable.size !== nodes.length)
    throw new Error("Unreachable Check report node.");
  const problems: ReportProblem[] = [];
  const failedNodes = new Set<string>();
  if (!report.pass) {
    if (!Array.isArray(report.problems) || !report.problems.length)
      throw new Error("Failed Check report requires nonempty problems.");
    for (const raw of report.problems) {
      if (
        !jsonObject(raw) ||
        !fields(raw, ["code", "brief", "documentation", "nodeKey", "source"]) ||
        !portableCode(raw.code) ||
        typeof raw.brief !== "string" ||
        !raw.brief.trim() ||
        !documentPath(raw.documentation) ||
        typeof raw.nodeKey !== "string" ||
        !indexed.has(raw.nodeKey) ||
        indexed.get(raw.nodeKey)!.pass ||
        !jsonObject(raw.source)
      )
        throw new Error("Invalid Check report problem.");
      const node = indexed.get(raw.nodeKey)!;
      let source: ReportProblem["source"];
      if (raw.source.kind === "local") {
        if (
          !fields(raw.source, ["kind", "checker", "nodeKey"]) ||
          raw.source.checker !== node.item.checker ||
          raw.source.nodeKey !== node.key ||
          raw.documentation !== `references/problems/${raw.code}.md`
        )
          throw new Error("Invalid local Check problem provenance.");
        source = {
          kind: "local",
          checker: node.item.checker,
          nodeKey: node.key,
        };
      } else source = outputSource(raw.source);
      failedNodes.add(raw.nodeKey);
      problems.push({
        code: raw.code,
        brief: raw.brief,
        documentation: raw.documentation,
        nodeKey: raw.nodeKey,
        source,
      });
    }
  }
  if (
    nodes.some((node) => node.pass === failedNodes.has(node.key)) ||
    report.pass !== (failedNodes.size === 0)
  )
    throw new Error("Inconsistent Check report pass state.");
  if (
    nodes.some(
      (node, index) =>
        index > 0 && compare(nodes[index - 1]!.key, node.key) >= 0,
    ) ||
    edges.some(
      (edge, index) =>
        index > 0 &&
        (compare(edges[index - 1]!.from, edge.from) ||
          compare(edges[index - 1]!.to, edge.to)) >= 0,
    ) ||
    problems.some(
      (problem, index) =>
        index > 0 && compare(problems[index - 1]!.nodeKey, problem.nodeKey) > 0,
    )
  )
    throw new Error("Unstable Check report order.");
  const base: ReportBody = {
    protocol: reportProtocol,
    documentation: report.documentation,
    root: report.root,
    nodes,
    edges,
  };
  const [first, ...rest] = problems;
  return freezeReport(
    first
      ? { ...base, pass: false, problems: [first, ...rest] }
      : { ...base, pass: true },
  );
}
