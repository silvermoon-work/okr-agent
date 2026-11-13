import { pnpm } from "../../../scripts/lib/tools.mjs";

pnpm(["exec", "tsc", "--project", "tsconfig.build.json"]);
