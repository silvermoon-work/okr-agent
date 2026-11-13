import { rmSync } from "node:fs";
import { pnpm } from "./lib/tools.mjs";

pnpm(["exec", "turbo", "run", "clean"]);
rmSync(".turbo", { recursive: true, force: true });
