import { type Files, dataYaml, record } from "./files.js";
import {
  isNodeVersions,
  workflowPredicates,
} from "../assets/workflow-predicates.mjs";

export interface QualityProfile {
  nodeVersions: string[];
}
type Report = (
  domain: "ci",
  status: "missing" | "mismatch" | "unconfirmed",
  brief: string,
) => void;

export async function qualityWorkflow(
  files: Files,
  _canonical: Uint8Array,
  report: Report,
): Promise<QualityProfile | undefined> {
  const path = ".github/workflows/ci.yaml";
  if (!files.exists(path)) {
    report("ci", "missing", `${path}: required quality workflow missing`);
    return undefined;
  }
  const workflow = dataYaml(await files.text(path));
  const failures = workflowPredicates(workflow);
  for (const failure of failures)
    report("ci", failure.status, `${path} ${failure.brief}`);
  const nodes = record(
    record(
      record(record(workflow.jobs ?? {}).compatibility ?? {}).strategy ?? {},
    ).matrix ?? {},
  )["node-version"];
  return failures.length || !isNodeVersions(nodes)
    ? undefined
    : { nodeVersions: nodes };
}
