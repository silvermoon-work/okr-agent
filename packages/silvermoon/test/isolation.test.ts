import * as child from "node:child_process";
import { createTaskEngine, MemoryStore } from "@silvermoon-work/task-engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { git } from "../src/repository.js";
import { repository, sync } from "../native-test/fixtures.js";

afterEach(() => vi.unstubAllEnvs());

describe("fail-closed default test boundaries", () => {
  it.each([
    () => child.exec("git status"),
    () => child.execSync("git status"),
    () => child.execFile("git", ["status"]),
    () => child.execFileSync("git", ["status"]),
    () => child.spawn("git", ["status"]),
    () => child.spawnSync("git", ["status"]),
    () => child.fork("unmocked-cli.js"),
  ])(
    "blocks unmocked process APIs before they can launch Git or a child CLI",
    (launch) => {
      expect(launch).toThrow(/forbid native subprocesses/);
    },
  );
  it("blocks the repository process adapter and unmocked Engine worker creation", async () => {
    await expect(git(process.cwd(), ["status"])).rejects.toThrow(
      /forbid native subprocesses/,
    );
    expect(() =>
      createTaskEngine({ store: new MemoryStore(), authorize: () => true }),
    ).toThrow(/controlled Engine/);
  });
  it("requires explicit opt-in before retained real-Git fixtures can initialize or write", async () => {
    vi.stubEnv("SILVERMOON_NATIVE_TEST", "0");
    await expect(repository()).rejects.toThrow(/explicit native-test/);
    await expect(sync(process.cwd())).rejects.toThrow(/explicit native-test/);
  });
});
