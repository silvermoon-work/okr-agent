import { pnpm } from "../../../scripts/lib/tools.mjs";
import { writeFile } from "node:fs/promises";
import { build } from "vite";

pnpm(["exec", "tsc", "--project", "tsconfig.build.json"]);
const { typescriptProjectDesignSpec } =
  await import("../dist/typescript-project-design.js");
await writeFile(
  "dist/typescript-project-design.json",
  JSON.stringify(
    { $schema: "urn:ipfsaw:check-bundle:2", ...typescriptProjectDesignSpec },
    null,
    2,
  ) + "\n",
);
await build({
  configFile: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/renderer",
    sourcemap: true,
    lib: {
      entry: "src/renderer.tsx",
      formats: ["es"],
      fileName: () => "renderer.js",
      cssFileName: "renderer",
    },
  },
});
await writeFile(
  "dist/renderer/ipfsaw.renderer.json",
  JSON.stringify(
    {
      protocol: "ipfsaw-renderer/v1",
      entry: "renderer.js",
      styles: ["renderer.css"],
    },
    null,
    2,
  ) + "\n",
);
