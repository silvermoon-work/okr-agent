import { resolve } from "node:path";
import { buildCar } from "../../silvermoon/scripts/lib/build-car.mjs";
await buildCar(resolve("dist"));
await buildCar(resolve("dist"), "commit");
await buildCar(resolve("dist"), "project");
await buildCar(resolve("dist"), "setup");
