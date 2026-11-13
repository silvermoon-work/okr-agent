import { expect, it } from "vitest";
import { resolvedPeer } from "../src/lockfile.js";

function lock(reference = "1.0.0", dependencies: Record<string, unknown> = {}) {
  return {
    lockfileVersion: "9.0",
    importers: { ".": { devDependencies: { tool: { version: reference } } } },
    packages: {
      "tool@1.0.0": { resolution: { integrity: "sha512-tool" } },
      "peer@2.0.0": { resolution: { integrity: "sha512-peer" } },
    },
    snapshots: { [`tool@${reference}`]: { dependencies }, "peer@2.0.0": {} },
  };
}
it.each([
  ["x".repeat(8193), "8192"],
  ["link:../tool", "registry"],
  ["1.0.0(peer@2.0.0)x", "损坏"],
  [
    `1.0.0${Array.from({ length: 65 }, (_, i) => `(p${i}@2.0.0)`).join("")}`,
    "64",
  ],
  [`1.0.0(peer@2.0.0${"(".repeat(33)}${")".repeat(34)}`, "32"],
  ["1.0.0(peer@2.0.0", "不完整"],
  ["1.0.0(peer)", "身份"],
  ["1.0.0(peer@2.0.0)(peer@2.0.0)", "重复"],
  ["1.0.0(peer@latest)", "准确"],
])("rejects unsafe registry reference %s", (reference, reason) => {
  expect(() =>
    resolvedPeer(lock(reference), ".", "tool", reference, "peer"),
  ).toThrow(reason);
});
it("rejects unsupported lockfile versions and mismatched selected importers", () => {
  expect(() =>
    resolvedPeer(
      { ...lock(), lockfileVersion: 6 },
      ".",
      "tool",
      "1.0.0",
      "peer",
    ),
  ).toThrow("v9");
  expect(() => resolvedPeer(lock(), ".", "tool", "2.0.0", "peer")).toThrow(
    "不一致",
  );
});
it("requires registry integrity and string, consistent snapshot edges", () => {
  const missing = lock();
  missing.packages["tool@1.0.0"].resolution.integrity = "";
  expect(() => resolvedPeer(missing, ".", "tool", "1.0.0", "peer")).toThrow(
    "integrity",
  );
  expect(() =>
    resolvedPeer(lock("1.0.0", { peer: 2 }), ".", "tool", "1.0.0", "peer"),
  ).toThrow("字符串");
  const conflict = lock("1.0.0", { peer: "2.0.0" });
  Object.assign(conflict.snapshots["tool@1.0.0"]!, {
    optionalDependencies: { peer: "3.0.0" },
  });
  expect(() => resolvedPeer(conflict, ".", "tool", "1.0.0", "peer")).toThrow(
    "冲突",
  );
  const suffix = "1.0.0(peer@3.0.0)";
  expect(() =>
    resolvedPeer(lock(suffix, { peer: "2.0.0" }), ".", "tool", suffix, "peer"),
  ).toThrow("后缀冲突");
});
it("uses optional and suffix-only edges and returns absent peers without substitution", () => {
  expect(resolvedPeer(lock(), ".", "tool", "1.0.0", "peer")).toBeUndefined();
  const optional = lock();
  Object.assign(optional.snapshots["tool@1.0.0"]!, {
    optionalDependencies: { peer: "2.0.0" },
  });
  expect(resolvedPeer(optional, ".", "tool", "1.0.0", "peer")).toEqual({
    version: "2.0.0",
    reference: "2.0.0",
  });
  const suffix = "1.0.0(peer@2.0.0)";
  expect(resolvedPeer(lock(suffix), ".", "tool", suffix, "peer")?.version).toBe(
    "2.0.0",
  );
});
