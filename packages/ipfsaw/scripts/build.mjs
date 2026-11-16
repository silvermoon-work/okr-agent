import { pnpm } from "../../../scripts/lib/tools.mjs";
import { rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
pnpm(["exec", "tsc", "--project", "tsconfig.build.json"]);
