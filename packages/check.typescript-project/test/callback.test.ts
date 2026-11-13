import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { createCheckCallback } from "@silvermoon-work/check-task-sdk";
import contract from "../src/contract.js";
import { projectCheck } from "../src/callback.js";
import { fixture, testEvidence } from "./fixture.js";
import { metadataFixture } from "./metadata-fixture.js";
import { scriptResources } from "../src/script-profile.js";

it("loads the actual supplied Bundle asset and preserves output link faults rather than returning success", async () => {
  const directory = resolve("dist", `.callback-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  try {
    await fixture(directory);
    const evidence = await testEvidence();
    const links: string[] = [];
    const callback = createCheckCallback(
      contract,
      projectCheck(() => metadataFixture()),
      { assets: true },
    );
    const context = {
      signal: new AbortController().signal,
      bundle: {
        root: {
          resolve(path: string) {
            expect(path).toMatch(/^resources\/(?:assets|references)/);
            return {
              async read() {
                const bytes = (
                  {
                    "resources/assets/AGENTS.md": evidence.agents,
                    "resources/assets/npm-publish.mjs": evidence.publisher,
                    "resources/assets/npm-publish.yaml":
                      evidence.publishWorkflow,
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
            };
          },
        },
      },
      output: {
        link(path: string) {
          links.push(path);
          if (path === "assets")
            return Promise.reject(new Error("asset output link fault"));
          return Promise.resolve();
        },
      },
    } as unknown as Parameters<typeof callback>[1];
    await expect(
      callback({ projectDirectory: directory }, context),
    ).rejects.toThrow("asset output link fault");
    expect(links).toEqual(["references", "assets"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
