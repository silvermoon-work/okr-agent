import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCheckBundle } from "@silvermoon-work/check-task-builder";
import { directoryTree } from "@silvermoon-work/task-builder-cli/node";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { memoryFile } from "@silvermoon-work/task-builder/tree";
import { stringify } from "yaml";
import {
  specifications,
  specificationFiles,
} from "../../dist/specifications.js";

export async function buildCar(output, kind = "idea") {
  if (!["idea", "commit", "project", "setup"].includes(kind))
    throw new Error("Unknown Silvermoon Check kind.");
  const name = kind === "idea" ? "check" : `${kind}-check`;
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const tree = await directoryTree(resolve(root, "../.."));
  const specPath = `docs/${specificationFiles[kind]}`;
  const bundle = await buildCheckBundle(
    {
      list: (path, options) => tree.list(path, options),
      read: (path, options) =>
        path === specPath
          ? Promise.resolve(
              memoryFile(
                Buffer.from(
                  stringify(specifications[kind], {
                    blockQuote: "literal",
                    lineWidth: 0,
                  }),
                ),
                options,
              ),
            )
          : tree.read(path, options),
    },
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
