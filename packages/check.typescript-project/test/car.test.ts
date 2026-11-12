import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { runCheckBuilderCli } from "@silvermoon-work/check-task-builder/cli";
import { fixture, put, manifest } from "./fixture.js";

it("builds a real CAR and independently verifies Engine pass/fail plus linked Chinese documents", async () => {
  const owned = resolve("dist", `.typescript-car-${randomUUID()}`);
  await mkdir(owned, { recursive: true });
  try {
    const good = join(owned, "good");
    const bad = join(owned, "bad");
    await fixture(good);
    await fixture(bad);
    await put(bad, "package.json", {
      ...manifest,
      scripts: { ...manifest.scripts, test: "vitest run" },
    });
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
        stderr: {
          write: (text) => {
            output += text;
          },
        },
      },
    );
    expect(code, output).toBe(0);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["scripts/smoke.mjs", join(owned, "bundle.car"), good, bad],
      { cwd: resolve("."), timeout: 60_000 },
    );
    const result = JSON.parse(stdout) as {
      bundleCid: string;
      size: number;
      results: {
        pass: boolean;
        documentationReadable: boolean;
        problems?: { code: string }[];
      }[];
    };
    expect(result.bundleCid).toMatch(/^bafy/);
    expect(result.size).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(result.results[0]).toMatchObject({
      pass: true,
      documentationReadable: true,
    });
    expect(result.results[1]).toMatchObject({
      pass: false,
      documentationReadable: true,
    });
    expect(result.results[1]?.problems?.map((p) => p.code)).toContain(
      "coverage-missing",
    );
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
}, 90_000);
