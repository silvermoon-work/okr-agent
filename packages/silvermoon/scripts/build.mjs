import { buildCar, defaultOutput } from "./lib/build-car.mjs";
await buildCar(defaultOutput);
await buildCar(defaultOutput, "commit");
await buildCar(defaultOutput, "project");
await buildCar(defaultOutput, "setup");
