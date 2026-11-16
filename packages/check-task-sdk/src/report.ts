import { validateBundleReference } from "@silvermoon-work/task-protocol";
import {
  canonicalSnapshot,
  compare,
  fields,
  jsonObject,
  type JsonObject,
} from "./canonical.js";
import type { ProblemSource } from "./checker.js";

export const checkerName = (name: unknown): name is string =>
  typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(name);
export const portableCode = (code: unknown): code is string =>
  typeof code === "string" &&
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(code) &&
  !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(code);
export interface ReportNode {
  readonly key: string;
  readonly item: { readonly checker: string; readonly target: JsonObject };
  readonly parent?: string;
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
  readonly documentation: string;
  readonly assets?: string;
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
    !fields(parsed, ["kind", "bundleCid", "checker", "nodeKey"]) ||
    parsed.kind !== "bundle" ||
    !checkerName(parsed.checker) ||
    typeof parsed.nodeKey !== "string" ||
    !parsed.nodeKey
  )
    throw new Error("Invalid Check problem output source.");
  validateNodeKey(parsed.nodeKey, parsed.checker);
  return {
    kind: "bundle",
    bundleCid: exactCid(parsed.bundleCid),
    checker: parsed.checker,
    nodeKey: parsed.nodeKey,
  };
}

function validateNodeKey(key: string, checker?: string): void {
  let identity: unknown;
  try {
    identity = JSON.parse(key) as unknown;
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
    !checkerName(snapshot.value[0]) ||
    (checker !== undefined && snapshot.value[0] !== checker) ||
    !jsonObject(snapshot.value[1]) ||
    snapshot.encoded !== key
  )
    throw new Error("Invalid source node key.");
}

/** Validate business results and problem provenance without importing execution traces. */
export function validateCheckReport(
  input: unknown,
  maxBytes = 65_536,
  contentReferences = false,
): CheckReport {
  const report = canonicalSnapshot(input, {
    bytes: maxBytes,
    depth: 72,
    values: 262_144,
  }).value;
  if (
    !jsonObject(report) ||
    !documentPath(report.documentation) ||
    typeof report.pass !== "boolean" ||
    !fields(report, [
      "documentation",
      ...(Object.hasOwn(report, "assets") ? ["assets"] : []),
      "pass",
      ...(!report.pass ? ["problems"] : []),
    ])
  )
    throw new Error("Invalid Check report.");
  if (contentReferences) exactCid(report.documentation);
  if (Object.hasOwn(report, "assets")) exactCid(report.assets);
  const problems: ReportProblem[] = [];
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
        !jsonObject(raw.source)
      )
        throw new Error("Invalid Check report problem.");
      validateNodeKey(raw.nodeKey);
      let source: ReportProblem["source"];
      if (raw.source.kind === "local") {
        if (
          !fields(raw.source, ["kind", "checker", "nodeKey"]) ||
          !checkerName(raw.source.checker) ||
          raw.source.nodeKey !== raw.nodeKey ||
          (!contentReferences &&
            raw.documentation !== `references/problems/${raw.code}.md`)
        )
          throw new Error("Invalid local Check problem provenance.");
        validateNodeKey(raw.nodeKey, raw.source.checker);
        source = {
          kind: "local",
          checker: raw.source.checker,
          nodeKey: raw.nodeKey,
        };
      } else source = outputSource(raw.source);
      if (contentReferences || source.kind === "bundle")
        exactCid(raw.documentation);
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
    problems.some(
      (problem, index) =>
        index > 0 && compare(problems[index - 1]!.nodeKey, problem.nodeKey) > 0,
    )
  )
    throw new Error("Unstable Check report order.");
  const base: ReportBody = {
    documentation: report.documentation,
    ...(typeof report.assets === "string" ? { assets: report.assets } : {}),
  };
  const [first, ...rest] = problems;
  return freezeReport(
    first
      ? { ...base, pass: false, problems: [first, ...rest] }
      : { ...base, pass: true },
  );
}
