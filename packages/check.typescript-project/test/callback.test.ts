import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import contract from "../src-legacy/contract.js";
import { projectCheck } from "../src-legacy/callback.js";
import { fixture, testEvidence } from "./fixture.js";
import { metadataFixture } from "./metadata-fixture.js";
import { scriptResources } from "../src-legacy/script-profile.js";

it("loads the actual supplied Bundle asset and preserves output link faults rather than returning success", async () => {
  const directory = resolve("dist", `.callback-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  try {
    await fixture(directory);
    const evidence = await testEvidence();
    const links: string[] = [];
    const callback = createCheckCallback(
      contract,
      { registry: projectCheck(() => metadataFixture()), root: "project" },
      { assets: true },
    );
    const context = {
      signal: new AbortController().signal,
      log: () => Promise.resolve({ state: "stored", sequence: 1 }),
      bundle: "bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      resolveContent(_bundle: string, path: string) {
        expect(path).toMatch(/^resources\/(?:assets|references)/);
        if (path === "resources/assets") {
          links.push("assets");
          return Promise.reject(new Error("asset content resolution fault"));
        }
        if (path === "resources/references/check.md") {
          links.push("references");
          return Promise.resolve(
            "bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          );
        }
        return Promise.resolve(path);
      },
      async readContent(path: string) {
        const bytes = (
          {
            bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:
              new TextEncoder().encode("Check documentation"),
            "resources/assets/AGENTS.md": evidence.agents,
            "resources/assets/npm-publish.mjs": evidence.publisher,
            "resources/assets/npm-publish.yaml": evidence.publishWorkflow,
            "resources/assets/npm-ci.yaml": evidence.ciWorkflow,
            ...Object.fromEntries(
              scriptResources.map(([name, asset]) => [
                `resources/assets/${asset}`,
                evidence.scripts[name]!,
              ]),
            ),
          } as Record<string, Uint8Array>
        )[path];
        expect(bytes).toBeDefined();
        return await Promise.resolve({
          kind: "file",
          content: bytes,
        });
      },
    } as unknown as Parameters<typeof callback>[1];
    await expect(
      callback({ projectDirectory: directory }, context),
    ).rejects.toThrow("asset content resolution fault");
    expect(links).toEqual(["references", "assets"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
