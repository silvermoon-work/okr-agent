import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { verifyArtifact } from "../src/index.js";

describe("private author CAR", () => {
  it("validates the full offline CAR, its fixed binding and equality with the CLI artifact", async () => {
    const binding = JSON.parse(await readFile("dist/check.json", "utf8")) as {
      cid: string;
    };
    const bytes = await readFile("dist/check.car");
    expect(await verifyArtifact(bytes, binding.cid)).toBe(binding.cid);
    expect(bytes).toEqual(await readFile("../silvermoon/dist/check.car"));
    await expect(verifyArtifact(bytes, "another-root")).rejects.toThrow(
      /fixed Check CID/,
    );
    const corrupt = Uint8Array.from(bytes);
    corrupt[corrupt.length - 1]! ^= 1;
    await expect(verifyArtifact(corrupt, binding.cid)).rejects.toThrow();
  });
});
