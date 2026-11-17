import { pnpm } from "./lib/tools.mjs";

for (const action of [
  "format-check",
  "build",
  "typecheck",
  "lint",
  "test-coverage",
  "lint-package",
]) {
  pnpm([action]);
}
