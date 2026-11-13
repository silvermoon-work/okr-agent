import { pnpm } from "./lib/tools.mjs";

pnpm(["exec", "eslint", "scripts", "test", "--max-warnings=0"]);
