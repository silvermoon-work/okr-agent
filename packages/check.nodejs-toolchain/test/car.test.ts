import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { runCheckBuilderCli } from "@silvermoon-work/check-task-builder/cli";

it("runs the seven-step production CAR with host-owned Worker environment and business-only input", async () => {
  const owned = resolve("dist", `.device-car-${randomUUID()}`);
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
      ["scripts/smoke.mjs", join(owned, "bundle.car"), "--fixture"],
      { cwd: resolve("."), timeout: 60_000 },
    );
    const evidence = JSON.parse(stdout) as {
      ok: boolean;
      mode: string;
      configurationUnchanged: boolean;
      results: {
        name: string;
        report: { pass: boolean; problems?: { code: string }[] };
        reclaimed: boolean;
      }[];
    };
    expect(evidence.ok).toBe(true);
    expect(evidence.mode).toBe("fixture");
    expect(evidence.configurationUnchanged).toBe(true);
    expect(evidence.results.map((sample) => sample.report.pass)).toEqual([
      true,
      false,
      false,
    ]);
    expect(evidence.results[1]?.report.problems?.[0]?.code).toBe(
      "nvm-installation-version-valid",
    );
    expect(evidence.results[2]?.report.problems?.[0]?.code).toBe(
      "nrm-configuration-registration-present",
    );
    expect(evidence.results.every((sample) => sample.reclaimed)).toBe(true);
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
}, 90_000);

it("preserves historical CAR adapter regressions with controlled tools and reclamation", async () => {
  const owned = resolve("dist", `.toolchain-car-${randomUUID()}`);
  await mkdir(owned, { recursive: true });
  try {
    let output = "";
    const code = await runCheckBuilderCli(
      ["build", "check.fixture.build.yaml", "--out-dir", join(owned, "bundle")],
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
        "scripts/legacy-smoke.mjs",
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
    ).toEqual(["tool-version-minimum", "tool-version-minimum"]);
    expect(
      evidence.results.find(
        (sample) => sample.name === "fixture-nrm-missing-and-mismatch",
      )?.problems,
    ).toEqual(["nrm-registration-url-matched", "nrm-registration-present"]);
    expect(evidence.results.every((sample) => sample.reclaimed)).toBe(true);
    expect(evidence.configurationUnchanged).toBe(true);
    expect(evidence.fixtureChildrenReclaimed).toBe(true);
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
}, 90_000);
