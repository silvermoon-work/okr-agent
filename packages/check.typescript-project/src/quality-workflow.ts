import { valid, parse } from "semver";
import { type Files, dataYaml, record } from "./files.js";

export interface QualityProfile {
  nodeVersions: string[];
}
type Report = (
  domain: "ci",
  status: "missing" | "mismatch" | "unconfirmed",
  brief: string,
) => void;

function difference(
  observed: unknown,
  expected: unknown,
  path = "",
): string | undefined {
  const display = (value: unknown) =>
    (value === undefined ? "未声明" : JSON.stringify(value)).slice(0, 1000);
  if (
    observed &&
    expected &&
    typeof observed === "object" &&
    typeof expected === "object" &&
    !Array.isArray(observed) &&
    !Array.isArray(expected)
  ) {
    const left = record(observed);
    const right = record(expected);
    for (const key of [
      ...new Set([...Object.keys(left), ...Object.keys(right)]),
    ].sort()) {
      const found = difference(
        left[key],
        right[key],
        path ? `${path}.${key}` : key,
      );
      if (found) return found;
    }
    return undefined;
  }
  return JSON.stringify(observed) === JSON.stringify(expected)
    ? undefined
    : `${path}: 观察 ${display(observed)}；标准要求 ${display(expected)}`;
}

export async function qualityWorkflow(
  files: Files,
  canonical: Uint8Array,
  report: Report,
): Promise<QualityProfile | undefined> {
  const path = ".github/workflows/ci.yaml";
  if (!files.exists(path)) {
    report(
      "ci",
      "missing",
      `${path}: 固定质量 workflow 缺失；标准 assets/npm-ci.yaml`,
    );
    return undefined;
  }
  const observed = dataYaml(await files.text(path));
  const expected = dataYaml(
    new TextDecoder("utf-8", { fatal: true }).decode(canonical),
  );
  const observedMatrix = record(
    record(
      record(record(observed.jobs ?? {}).compatibility ?? {}).strategy ?? {},
    ).matrix ?? {},
  );
  const expectedMatrix = record(
    record(record(record(expected.jobs).compatibility).strategy).matrix,
  );
  // Only the declared finite parameter is substituted, never a guessed job.
  if (Object.hasOwn(observedMatrix, "node-version"))
    expectedMatrix["node-version"] = observedMatrix["node-version"];
  const mismatch = difference(observed, expected);
  if (mismatch) {
    const matrices = Object.entries(record(observed.jobs ?? {})).flatMap(
      ([job, raw]) => {
        const matrix = record(record(record(raw).strategy ?? {}).matrix ?? {});
        return Object.hasOwn(matrix, "node-version")
          ? [
              {
                path: `jobs.${job}.strategy.matrix.node-version`,
                value: matrix["node-version"],
              },
            ]
          : [];
      },
    );
    report(
      "ci",
      "mismatch",
      `${path}: 固定质量 workflow 结构不匹配；${mismatch}；实际矩阵路径和值=${JSON.stringify(matrices).slice(0, 1000)}；要求 assets/npm-ci.yaml 的触发、权限、check/compatibility/release-verification 与失败传播结构；仅 compatibility.strategy.matrix.node-version 可参数化`,
    );
    return undefined;
  }
  const nodes = observedMatrix["node-version"];
  if (
    !Array.isArray(nodes) ||
    nodes.length < 2 ||
    nodes.length > 8 ||
    new Set(nodes as unknown[]).size !== nodes.length ||
    (nodes as unknown[]).some(
      (value) =>
        typeof value !== "string" ||
        valid(value) !== value ||
        parse(value)!.prerelease.length,
    )
  ) {
    report(
      "ci",
      "mismatch",
      `${path} jobs.compatibility.strategy.matrix.node-version: 观察 ${JSON.stringify(nodes)}；要求 2..8 个唯一精确稳定 Node 版本`,
    );
    return undefined;
  }
  return { nodeVersions: nodes as string[] };
}
