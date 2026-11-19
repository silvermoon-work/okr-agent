import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCheckBundle } from "@silvermoon-work/check-task-builder";
import { directoryTree } from "@silvermoon-work/task-builder-cli/node";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";

export async function buildCar(output, kind = "idea") {
  if (!["idea", "commit", "project", "setup"].includes(kind))
    throw new Error("Unknown Silvermoon Check kind.");
  const name = kind === "idea" ? "check" : `${kind}-check`;
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const bundle = await buildCheckBundle(
    await directoryTree(resolve(root, "../..")),
    `packages/silvermoon/${name}.build.yaml`,
  );
  const car = await encodeTaskBundleCar(bundle);
  try {
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, `${name}.car`),
      new Uint8Array(await new Response(car.stream).arrayBuffer()),
    );
    await writeFile(
      join(output, `${name}.json`),
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
