import { execFile } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("removes stale deleted modules before building the SDK delivery", async () => {
  const stale = resolve("dist", "obsolete-graph-regression.js");
  await mkdir(resolve("dist"), { recursive: true });
  await writeFile(stale, "export const obsolete = true;");
  try {
    await promisify(execFile)(process.execPath, ["scripts/build.mjs"], {
      cwd: resolve("."),
      timeout: 30_000,
    });
    await expect(access(stale)).rejects.toHaveProperty("code", "ENOENT");
    await expect(access(resolve("dist", "index.js"))).resolves.toBeUndefined();
  } finally {
    await rm(stale, { force: true });
  }
}, 40_000);
