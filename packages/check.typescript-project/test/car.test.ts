import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import process from "node:process";
import { expect, it } from "vitest";
import { runCheckBuilderCli } from "@silvermoon-work/check-task-builder/cli";
import { fixture, npmFixture, put, vitestConfig } from "./fixture.js";

it("builds a real CAR and independently verifies Engine pass/fail plus linked Chinese documents", async () => {
  const persistent = process.env["TYPESCRIPT_CHECK_PERSIST_EVIDENCE"] === "1";
  const owned = resolve(
    "dist",
    persistent ? "verification" : `.typescript-car-${randomUUID()}`,
  );
  await mkdir(owned, { recursive: true });
  try {
    const good = join(owned, "good");
    const bad = join(owned, "bad");
    const npm = join(owned, "npm");
    await fixture(good);
    await fixture(bad);
    await npmFixture(npm);
    await put(
      bad,
      "vitest.config.ts",
      vitestConfig.replace("branches: 90", "branches: 80"),
    );
    await rm(join(bad, "scripts", "check.mjs"));
    await put(
      bad,
      "AGENTS.md",
      `${await readFile(join(bad, "AGENTS.md"), "utf8")}\nCustom guidance must be protected.\n`,
    );
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
      ["scripts/smoke.mjs", join(owned, "bundle.car"), good, bad, npm],
      { cwd: resolve("."), timeout: 90_000 },
    ).catch((error: unknown) => {
      if (error instanceof Error && "stderr" in error)
        throw new Error(`${error.message}\n${String(error.stderr)}`);
      throw error;
    });
    const result = JSON.parse(stdout) as {
      bundleCid: string;
      size: number;
      results: {
        pass: boolean;
        documentationReadable: boolean;
        assetsExact: boolean;
        problems?: { code: string }[];
      }[];
    };
    if (persistent)
      await writeFile(
        join(owned, "engine-fixture-report.json"),
        `${JSON.stringify(result, null, 2)}\n`,
      );
    expect(result.bundleCid).toMatch(/^bafy/);
    expect(result.size).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(result.results[0]).toMatchObject({
      pass: true,
      documentationReadable: true,
      assetsExact: true,
    });
    expect(result.results[1]).toMatchObject({
      pass: false,
      documentationReadable: true,
      assetsExact: true,
    });
    expect(result.results[2]).toMatchObject({
      pass: true,
      documentationReadable: true,
      assetsExact: true,
    });
    expect(result.results[1]?.problems?.map((p) => p.code)).toContain(
      "coverage-mismatch",
    );
    expect(result.results[1]?.problems?.map((p) => p.code)).toContain(
      "gate-missing",
    );
    expect(result.results[1]?.problems?.map((p) => p.code)).toContain(
      "document-mismatch",
    );
  } finally {
    if (!persistent) await rm(owned, { recursive: true, force: true });
  }
}, 120_000);
