import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

const check = vi.hoisted(() => vi.fn());
const target = vi.hoisted(() => vi.fn());
vi.mock("../src/index.js", () => ({
  checkPublishContext: check,
  selectPublishTarget: target,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function streams() {
  let out = "",
    err = "";
  vi.spyOn(process.stdout, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      out += String(chunk);
      return true;
    },
  );
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      err += String(chunk);
      return true;
    },
  );
  return {
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
}

it.each([
  [],
  ["--help"],
  ["-h"],
  ["check", "--help"],
  ["check", "-h"],
  ["target", "--help"],
  ["--version"],
])(
  "provides help/version without touching Git or services: %j",
  async (...args) => {
    const output = streams();
    expect(await main(args)).toBe(0);
    expect(output.out).toMatch(/publish-gate|0\.1\.0-rc\.4/);
    expect(output.err).toBe("");
    expect(check).not.toHaveBeenCalled();
  },
);

it.each([["--wat"], ["publish"], ["check", "--force"], ["check", "other"]])(
  "rejects invalid arguments without running the gate: %j",
  async (...args) => {
    const output = streams();
    expect(await main(args)).not.toBe(0);
    expect(output.err).toMatch(/error:/);
    expect(check).not.toHaveBeenCalled();
  },
);

it.each([false, true])("reports gate success, dryRun=%s", async (dryRun) => {
  const output = streams();
  check.mockResolvedValue({
    name: "widget",
    version: "1.0.0",
    channel: "latest",
    dryRun,
  });
  expect(await main(["check"])).toBe(0);
  expect(output.out).toContain(
    `widget@1.0.0 (latest${dryRun ? ", dry-run" : ""})`,
  );
  expect(output.err).toBe("");
});

it.each([false, true])(
  "prints the selected target without running the publication gate, JSON=%s",
  async (json) => {
    const output = streams();
    const selected = {
      directory: "packages/widget",
      name: "@silvermoon-work/widget",
      version: "1.0.0",
      channel: "latest",
    };
    target.mockReturnValue(selected);
    expect(await main(json ? ["target", "--json"] : ["target"])).toBe(0);
    if (json) expect(JSON.parse(output.out)).toEqual(selected);
    else expect(output.out).toContain("@silvermoon-work/widget@1.0.0");
    expect(output.err).toBe("");
    expect(check).not.toHaveBeenCalled();
  },
);

it("reports failures on stderr without stack traces or success output", async () => {
  const output = streams();
  check.mockRejectedValue(
    new Error("CI is pending; retry after it completes."),
  );
  expect(await main(["check"])).toBe(1);
  expect(output.out).toBe("");
  expect(output.err).toBe(
    "publish-gate: CI is pending; retry after it completes.\n",
  );
});

it("runs the built executable with useful no-argument help and fails outside the lifecycle", () => {
  const bin = resolve("dist", "bin.js");
  expect(execFileSync(process.execPath, [bin], { encoding: "utf8" })).toContain(
    "prepublishOnly",
  );
  const result = spawnSync(process.execPath, [bin, "check"], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "false" },
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("prepublishOnly");
});
