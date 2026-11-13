import process from "node:process";
import { pnpm } from "../../../scripts/lib/tools.mjs";

process.env.TOOLCHAIN_NATIVE_TESTS = "1";
pnpm([
  "exec",
  "vitest",
  "run",
  "--root",
  ".",
  "--config",
  "../../vitest.config.ts",
  "test/inspect.test.ts",
]);
