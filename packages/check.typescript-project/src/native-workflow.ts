import type { Project } from "./commands.js";
import { type Files, dataYaml, record, Unconfirmed } from "./files.js";
import { workflowPredicates } from "../assets/workflow-predicates.mjs";

export async function nativeWorkflow(
  files: Files,
  projects: Project[],
  report: (
    domain: "ci",
    status: "missing" | "mismatch" | "unconfirmed",
    brief: string,
  ) => void,
): Promise<void> {
  const native = projects.filter((project) => {
    const scripts = record(project.manifest.scripts ?? {});
    return scripts["native-test"] !== undefined && scripts.smoke !== undefined;
  });
  if (!native.length) return;
  const paths = files.paths.filter(
    (path) =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path) &&
      path !== ".github/workflows/ci.yaml",
  );
  for (const project of native) {
    const candidates: {
      path: string;
      failures: ReturnType<typeof workflowPredicates>;
    }[] = [];
    const unreadable: string[] = [];
    for (const path of paths) {
      try {
        const workflow = dataYaml(await files.text(path));
        if (
          !Object.values(record(workflow.jobs ?? {})).some((raw) => {
            const job = record(raw);
            return (
              Array.isArray(job.steps) &&
              job.steps.some(
                (step: unknown) =>
                  record(step).run ===
                  `pnpm --filter ${String(project.manifest.name)} native-test`,
              )
            );
          })
        )
          continue;
        candidates.push({
          path,
          failures: workflowPredicates(workflow, "native", [
            String(project.manifest.name),
          ]),
        });
      } catch (error) {
        if (!(error instanceof Unconfirmed)) throw error;
        unreadable.push(
          `${path}: native coverage evidence unavailable: ${error.message}`,
        );
      }
    }
    if (candidates.some((candidate) => !candidate.failures.length)) continue;
    for (const brief of unreadable) report("ci", "unconfirmed", brief);
    if (!candidates.length) {
      report(
        "ci",
        "missing",
        `${project.directory}/package.json scripts.native-test + smoke declare native responsibility; require separate automatic main/PR and manual Ubuntu/Windows build -> native-test -> smoke workflow`,
      );
      continue;
    }
    const best = candidates.sort(
      (a, b) => a.failures.length - b.failures.length,
    )[0]!;
    for (const failure of best.failures)
      report(
        "ci",
        failure.status,
        `${best.path} native ${project.directory}: ${failure.brief}`,
      );
  }
}
