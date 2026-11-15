import { pnpm } from "../../../scripts/lib/tools.mjs";
import { rmSync } from "node:fs";

rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
pnpm(["exec", "tsc", "--project", "tsconfig.build.json"]);
