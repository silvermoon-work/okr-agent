import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync(
  process.execPath,
  ["../check-task-builder/dist/bin.js", "build"],
  { stdio: "inherit", shell: false },
);
if (result.error) throw result.error;
if (result.status !== 0 || result.signal)
  throw new Error("Node.js toolchain CAR build failed");
