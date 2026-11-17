import { loadDeliverables, npmMappings } from "./lib/deliverables.mjs";
import { pnpm, workspaces } from "./lib/tools.mjs";

const projects = workspaces();
const targets = npmMappings(loadDeliverables(process.cwd()), projects);
for (const target of targets) {
  const project = projects.find(
    (candidate) => candidate.directory === target.directory,
  );
  if (!project.manifest.scripts?.["lint-package"])
    throw new Error(`Missing lint-package script: ${target.name}`);
}
if (targets.length) {
  pnpm([
    "exec",
    "turbo",
    "run",
    "lint-package",
    ...targets.map((target) => `--filter=${target.name}`),
  ]);
}
