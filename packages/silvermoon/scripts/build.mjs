import { chmod } from "node:fs/promises";
import { buildCar, defaultOutput } from "./lib/build-car.mjs";
await buildCar(defaultOutput);
await buildCar(defaultOutput, "commit");
await buildCar(defaultOutput, "project");
await buildCar(defaultOutput, "setup");
await chmod(new URL("../dist/bin.js", import.meta.url), 0o755);
