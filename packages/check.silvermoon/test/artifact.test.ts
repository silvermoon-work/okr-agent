import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { verifyArtifact } from "../src/index.js";

describe("private author CAR", () => {
  it.each(["check", "commit-check", "project-check", "setup-check"])(
    "validates the full offline %s CAR, its fixed binding and equality with the CLI artifact",
    async (name) => {
      const binding = JSON.parse(
        await readFile(`dist/${name}.json`, "utf8"),
      ) as {
        cid: string;
      };
      const bytes = await readFile(`dist/${name}.car`);
      expect(await verifyArtifact(bytes, binding.cid)).toBe(binding.cid);
      expect(bytes).toEqual(await readFile(`../silvermoon/dist/${name}.car`));
      await expect(verifyArtifact(bytes, "another-root")).rejects.toThrow(
        /fixed Check CID/,
      );
      const corrupt = Uint8Array.from(bytes);
      corrupt[corrupt.length - 1]! ^= 1;
      await expect(verifyArtifact(corrupt, binding.cid)).rejects.toThrow();
    },
  );
});
