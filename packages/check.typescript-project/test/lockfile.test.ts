import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { dataYaml, record } from "../src/files.js";
import { resolvedPeer } from "../src/lockfile.js";

async function actualLock() {
  return dataYaml(
    await readFile(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8"),
  );
}
it.each([
  ["vitest", "vite"],
  ["@vitest/coverage-v8", "vitest"],
])(
  "follows a real pnpm-generated v9 %s snapshot to peer %s",
  async (name, peer) => {
    const lock = await actualLock();
    const dependencies = record(
      record(record(lock.importers)["."]).devDependencies,
    );
    const installed = record(dependencies[name]).version;
    expect(typeof installed).toBe("string");
    if (typeof installed !== "string")
      throw new Error("Missing actual tool reference");
    const target = resolvedPeer(lock, ".", name, installed, peer);
    expect(target).toBeDefined();
    expect(
      record(lock.snapshots)[`${peer}@${target!.reference}`],
    ).toBeDefined();
    if (peer === "vite") expect(dependencies.vite).toBeUndefined();
  },
);
it("does not substitute any globally matching snapshot when the exact selected context is absent", async () => {
  const lock = await actualLock();
  const dependencies = record(
    record(record(lock.importers)["."]).devDependencies,
  );
  const installed = record(dependencies.vitest).version;
  if (typeof installed !== "string")
    throw new Error("Missing actual Vitest reference");
  const snapshots = record(lock.snapshots);
  const selected = snapshots[`vitest@${installed}`];
  delete snapshots[`vitest@${installed}`];
  snapshots["vitest@5.0.4(vite@99.0.0)"] = selected;
  expect(() => resolvedPeer(lock, ".", "vitest", installed, "vite")).toThrow();
});
