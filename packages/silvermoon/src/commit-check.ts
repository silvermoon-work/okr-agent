import type { Runtime } from "./contract.js";
import { snapshotCheckpoint } from "./checkpoints/commit-snapshot/check.js";
import { historyCheckpoint } from "./checkpoints/commit-history/check.js";

export function commitCheckpoints(runtime: Runtime) {
  const structure = snapshotCheckpoint(runtime);
  return [structure, historyCheckpoint(structure)] as const;
}
