import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCheckBundle } from "@silvermoon-work/check-task-builder";
import { directoryTree } from "@silvermoon-work/task-builder-cli/node";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";

export async function buildCar(output) {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const bundle = await buildCheckBundle(
    await directoryTree(resolve(root, "../..")),
    "packages/silvermoon/check.build.yaml",
  );
  const car = await encodeTaskBundleCar(bundle);
  try {
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, "check.car"),
      new Uint8Array(await new Response(car.stream).arrayBuffer()),
    );
    await writeFile(
      join(output, "check.json"),
      JSON.stringify({ version: 1, cid: car.cid }, null, 2) + "\n",
    );
    return car.cid;
  } finally {
    await car.close();
  }
}
export const defaultOutput = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
  "dist",
);
