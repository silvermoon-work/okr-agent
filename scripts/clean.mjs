import { lstatSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaces } from "./lib/tools.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directories = [
  ".",
  ...workspaces(root).map((project) => project.directory),
];
const targets = directories.flatMap((directory) =>
  ["dist", "coverage", ".turbo"].map((name) => resolve(root, directory, name)),
);
for (const target of targets) {
  if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error(`Refusing to clean redirected output: ${target}`);
}
for (const target of targets) rmSync(target, { recursive: true, force: true });
