import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { renderCheckpointDocumentation } from "@silvermoon-work/check-task-sdk";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import { specifications, specificationFiles } from "../src/specifications.js";
import { silvermoonCheckpoints } from "../src/check.js";
import { projectCheckpoints } from "../src/project-check.js";
import { setupCheckpoints } from "../src/setup-check.js";
import { commitCheckpoints } from "../src/commit-check.js";
import { bundledArtifact } from "../src/host.js";

const kinds = ["idea", "project", "setup", "commit"] as const;
const runtime = { entry: "silvermoon", path: "" };
const execution = { runtime };
const compose = {
  idea: () => silvermoonCheckpoints("unused-until-invocation", execution),
  project: () => projectCheckpoints(execution),
  setup: () => setupCheckpoints(runtime),
  commit: () => commitCheckpoints(runtime),
};

describe("checkpoint-owned specifications", () => {
  it.each(kinds)(
    "%s composes fresh definitions with the same metadata and order as its preview Spec",
    async (kind) => {
      const spec = specifications[kind];
      const snapshot: unknown = parse(
        await readFile(
          new URL(`../../../docs/${specificationFiles[kind]}`, import.meta.url),
          "utf8",
        ),
      );
      expect(snapshot).toEqual(JSON.parse(JSON.stringify(spec)));
      const definitions = compose[kind]();
      const second = compose[kind]();
      expect(definitions.map((definition) => definition.id)).toEqual(
        spec.checkpoints.map((checkpoint) => checkpoint.id),
      );
      for (const [index, definition] of definitions.entries()) {
        const documentation = spec.checkpoints[index]!;
        expect(definition).not.toBe(second[index]);
        expect(definition.description).toBe(documentation.description);
        expect(definition.instructions).toBe(documentation.instructions);
        expect(definition.rules).toEqual(documentation.rules);
        expect(definition.output).toEqual(documentation.output);
        expect(definition.target).toEqual(spec.parameter.schema);
      }
    },
  );

  it.each(kinds)(
    "%s CAR contains exactly its composed offline documents",
    async (kind) => {
      const spec = specifications[kind];
      const artifact = await bundledArtifact(kind);
      const car = await readTaskBundleCar(
        new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
      );
      try {
        const read = async (path: string) =>
          Buffer.from(
            await readBytes(
              car.tree,
              `resources/references/${path}`,
              65_536,
              {},
            ),
          ).toString("utf8");
        const overview = await read("check.md");
        const parameterBlock = /```json\n([\s\S]*?)\n```/.exec(overview);
        expect(parameterBlock).not.toBeNull();
        expect(JSON.parse(parameterBlock![1]!)).toEqual(
          JSON.parse(JSON.stringify(spec.parameter.schema)),
        );
        expect(overview).toContain(
          (
            await readFile(
              new URL(`../references/${kind}/check.md`, import.meta.url),
              "utf8",
            )
          ).trim(),
        );
        const entries = await car.tree.list("resources/references/checkpoints");
        expect(entries.map((entry) => entry.name).sort()).toEqual(
          spec.checkpoints.map((checkpoint) => `${checkpoint.id}.md`).sort(),
        );
        for (const checkpoint of spec.checkpoints)
          expect(await read(`checkpoints/${checkpoint.id}.md`)).toBe(
            renderCheckpointDocumentation(checkpoint),
          );
      } finally {
        await car.close();
      }
    },
  );
});
