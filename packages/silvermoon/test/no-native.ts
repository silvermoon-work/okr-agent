import { vi } from "vitest";
import type * as ChildProcess from "node:child_process";
import type * as TaskEngine from "@silvermoon-work/task-engine";

// Unit suites replace these boundaries with explicit outputs. Never allow an
// unmocked child CLI or Engine worker to escape into the enclosing worktree.
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof ChildProcess>();
  const forbidden = () => {
    throw new Error("Default Silvermoon tests forbid native subprocesses.");
  };
  return {
    ...original,
    exec: forbidden,
    execSync: forbidden,
    execFile: forbidden,
    execFileSync: forbidden,
    spawn: forbidden,
    spawnSync: forbidden,
    fork: forbidden,
  };
});

vi.mock("@silvermoon-work/task-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof TaskEngine>()),
  createTaskEngine: () => {
    throw new Error("Default Silvermoon tests require a controlled Engine.");
  },
}));
