import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { build } from "vite";
import { buildTaskBundle } from "@silvermoon-work/task-builder";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { memoryTree, readBytes } from "@silvermoon-work/task-builder/tree";
import {
  checkBundleSpecSchema,
  typescriptProjectDesignSpec,
} from "@silvermoon-work/check-bundle-viewer";
await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    outDir: "dist",
    lib: {
      entry: "src/task-frame.ts",
      formats: ["es"],
      fileName: () => "task-runtime.js",
    },
    sourcemap: true,
  },
});
await build({
  configFile: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/check-app",
    lib: {
      entry: "src/check-task.ts",
      formats: ["es"],
      fileName: () => "app.js",
      cssFileName: "check",
    },
  },
});
const tree = await buildTaskBundle(
  memoryTree(
    new Map([
      ["app.js", await readFile("dist/check-app/app.js")],
      [
        "check.css",
        await readFile(
          new URL(
            import.meta
              .resolve("@silvermoon-work/check-bundle-viewer/style.css"),
          ),
        ),
      ],
    ]),
  ),
  {
    name: "Check definition browser app",
    runtime: { type: "browser" },
    source: {
      entry: "app.js",
      mode: "explicit",
      contract: {
        parameters: checkBundleSpecSchema,
        result: {
          type: "object",
          properties: { started: { const: true } },
          required: ["started"],
          additionalProperties: false,
        },
        message: false,
      },
    },
    include: [{ from: "check.css", to: "resources/" }],
  },
);
async function materialize(path) {
  for (const entry of await tree.list(path)) {
    const next = path ? `${path}/${entry.name}` : entry.name;
    if (entry.kind === "directory") await materialize(next);
    else {
      const target = `dist/check-task/${next}`;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await readBytes(tree, next, 64 * 1024 * 1024));
    }
  }
}
await materialize("");
const car = await encodeTaskBundleCar(tree);
try {
  await writeFile(
    "dist/check-task.car",
    new Uint8Array(await new Response(car.stream).arrayBuffer()),
  );
  await writeFile("dist/check-task.cid", car.cid + "\n");
  await writeFile(
    "dist/check-task.json",
    JSON.stringify(typescriptProjectDesignSpec, null, 2) + "\n",
  );
} finally {
  await car.close();
}
