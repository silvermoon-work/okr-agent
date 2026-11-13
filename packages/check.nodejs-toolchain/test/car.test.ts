import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { runCheckBuilderCli } from "@silvermoon-work/check-task-builder/cli";

it("imports a production CAR into the published Engine with controlled tools, documents and reclamation", async () => {
  const owned = resolve("dist", `.toolchain-car-${randomUUID()}`);
  await mkdir(owned, { recursive: true });
  try {
    let output = "";
    const code = await runCheckBuilderCli(
      ["build", "--out-dir", join(owned, "bundle")],
      {
        cwd: resolve("."),
        stdout: {
          write: (text) => {
            output += text;
          },
        },
        stderr: { write: () => undefined },
      },
    );
    expect(code, output).toBe(0);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "scripts/smoke.mjs",
        join(owned, "bundle.car"),
        resolve("../.."),
        "--fixture",
      ],
      { cwd: resolve("."), timeout: 60_000 },
    );
    const evidence = JSON.parse(stdout) as {
      ok: boolean;
      mode: string;
      bundleCid: string;
      results: {
        name: string;
        pass?: boolean;
        problems?: string[];
        reclaimed: boolean;
      }[];
      configurationUnchanged: boolean;
      fixtureChildrenReclaimed: boolean;
    };
    expect(evidence.ok).toBe(true);
    expect(evidence.mode).toBe("fixture");
    expect(evidence.bundleCid).toMatch(/^bafy/);
    expect(
      evidence.results.find((sample) => sample.name === "node-only")?.pass,
    ).toBe(true);
    expect(
      evidence.results.find((sample) => sample.name === "multiple-problems")
        ?.problems,
    ).toEqual(["version-too-low", "version-too-low", "registry-mismatch"]);
    expect(evidence.results.every((sample) => sample.reclaimed)).toBe(true);
    expect(evidence.configurationUnchanged).toBe(true);
    expect(evidence.fixtureChildrenReclaimed).toBe(true);
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
}, 90_000);
