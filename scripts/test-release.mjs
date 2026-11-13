import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const tests = readdirSync("test")
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => join("test", name));
if (!tests.length) throw new Error("No release regression tests found");
const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
  shell: false,
});
if (result.error) throw result.error;
if (result.status !== 0 || result.signal)
  throw new Error("Release regression tests failed");
