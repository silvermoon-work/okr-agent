import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("./vitest.mjs", import.meta.resolve("vitest/package.json")),
    ),
    "run",
    "--root",
    ".",
    "--config",
    "native-test/vitest.config.ts",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, SILVERMOON_NATIVE_TEST: "1" },
    timeout: 600_000,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
