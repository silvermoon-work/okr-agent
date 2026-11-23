import { describe, expect, it, beforeEach, vi } from "vitest";
import { executeCheck } from "@silvermoon-work/check-task-sdk";
import { commitCheckpoints } from "../src/commit-check.js";
import * as repository from "../src/repository.js";
import { canonical, SilvermoonError, type Files } from "../src/domain.js";
import { add, cid, event, files, head, id } from "./fixtures.js";
import { project, tip } from "./snapshots.js";
import { report } from "./paired-fixtures.js";
import { reportPath } from "../src/lifecycle.js";
import { resolve } from "node:path";

vi.mock("../src/repository.js", async (importOriginal) => ({
  ...(await importOriginal<typeof repository>()),
  git: vi.fn(),
  verifyRepositoryRoot: vi.fn(),
  readProject: vi.fn(),
}));
const root = resolve(".test-work", "commit-snapshot");
const home = resolve(".test-work", "home");
const runtime = { entry: "", path: process.cwd() };
let previous: repository.Project;
let current: repository.Project;
let revision: string | undefined;
let changed: string;
let untracked: string;
beforeEach(() => {
  vi.mocked(repository.git).mockReset();
  vi.mocked(repository.readProject).mockReset();
  vi.mocked(repository.verifyRepositoryRoot)
    .mockReset()
    .mockResolvedValue(undefined);
  previous = project(root);
  current = previous;
  revision = tip;
  changed = `.silvermoon/i/${id}/events.jsonl\0`;
  untracked = "";
  vi.mocked(repository.git).mockImplementation(async (_root, args) => {
    await Promise.resolve();
    switch (args[0]) {
      case "rev-parse":
        if (args.includes("--quiet") && !revision)
          throw Object.assign(new Error("unborn"), { code: 1 });
        return args.includes("--quiet") ? revision! : head;
      case "rev-list":
        return `${head}${revision ? ` ${revision}` : ""}`;
      case "ls-tree":
        return args.includes("--name-only")
          ? ".silvermoon/config.yaml"
          : changed;
      case "diff":
        return changed;
      case "ls-files":
        return args.includes("--others") ? untracked : changed;
      case "cat-file":
        return "commit";
      default:
        throw new Error(`Unprepared query: ${args.join(" ")}`);
    }
  });
  vi.mocked(repository.readProject).mockImplementation(
    async (_root, snapshot, _signal, ids) => {
      await Promise.resolve();
      const value = snapshot === revision ? previous : current;
      return {
        ...value,
        ideas: new Map([...value.ideas].filter(([id]) => !ids || ids.has(id))),
      };
    },
  );
});
function run(snapshot = "staged", allowDelete?: string[]) {
  return executeCheck({
    checkpoints: commitCheckpoints(runtime),
    target: {
      userHome: home,
      repoRoot: root,
      snapshot,
      ...(allowDelete ? { allowDelete } : {}),
    },
    signal: new AbortController().signal,
  });
}
function candidate(source: Files) {
  current = project(root, source);
}

describe("independent commit rules over prepared index snapshots", () => {
  it("validates the index independently of device, worktree, upstream and primary readiness", async () => {
    expect((await run()).pass).toBe(true);
    const calls = vi.mocked(repository.git).mock.calls.map(([, args]) => args);
    expect(
      calls.some(
        (args) =>
          args.includes("status") ||
          args.includes("fetch") ||
          args.includes("symbolic-ref"),
      ),
    ).toBe(false);
    expect(calls.find((args) => args.includes("diff"))).toContain("--cached");
    expect(
      vi
        .mocked(repository.readProject)
        .mock.calls.map(([, snapshot]) => snapshot),
    ).toEqual([tip, "staged"]);
    expect(vi.mocked(repository.readProject).mock.calls[0]?.[3]).toEqual(
      new Set([id]),
    );
  });
  it("accepts staged additions with unchanged event prefixes", async () => {
    candidate(
      add(
        previous.ideas.get(id)!.files,
        event({ type: "setAlias", alias: "new-alias" }),
      ),
    );
    expect((await run()).pass).toBe(true);
  });
  it("compares bootstrap values, not JSON formatting", async () => {
    const source = new Map(previous.ideas.get(id)!.files);
    source.set(
      "idea.json",
      Buffer.from(JSON.stringify(previous.ideas.get(id)!.bootstrap, null, 2)),
    );
    candidate(source);
    expect((await run()).pass).toBe(true);
  });
  it("rejects coherent identity changes and attributes immutable identity documentation", async () => {
    const source = new Map(previous.ideas.get(id)!.files);
    for (const path of ["idea.json", "events.jsonl"])
      source.set(
        path,
        Buffer.from(
          new TextDecoder()
            .decode(source.get(path))
            .replaceAll(
              cid,
              "bafybeibwzifhk4upvphdtzuqyy4gkdns5d4uelnras3exsy7ugmbtlji4m",
            ),
        ),
      );
    candidate(source);
    expect(await run()).toMatchObject({
      pass: false,
      problems: [
        {
          checkpoint: "commit-history",
          code: "commit-history-idea-identity-immutable",
        },
      ],
      references: [
        {
          checkpoint: "commit-history",
          documentation: "references/checkpoints/commit-history.md",
        },
      ],
    });
  });
  it.each(["rewrite", "bom"] as const)(
    "rejects committed event byte %s",
    async (mode) => {
      const source = add(files(), event({ type: "setAlias", alias: "before" }));
      previous = project(root, source);
      const updated = new Map(source);
      updated.set(
        "events.jsonl",
        mode === "bom"
          ? Buffer.concat([
              Buffer.from([0xef, 0xbb, 0xbf]),
              Buffer.from(source.get("events.jsonl")!),
            ])
          : Buffer.from(
              new TextDecoder()
                .decode(source.get("events.jsonl"))
                .replace('"alias":"before"', '"alias":"after"'),
            ),
      );
      candidate(updated);
      expect(await run()).toMatchObject({
        problems: [{ code: "commit-history-event-history-append-only" }],
      });
    },
  );
  it("rejects whole deletion unless explicitly authorized and rejects retained/partial exceptions", async () => {
    current = project(root, null);
    expect(await run()).toMatchObject({
      problems: [{ code: "commit-history-idea-identity-immutable" }],
    });
    expect((await run("staged", [id])).pass).toBe(true);
    current = previous;
    expect((await run("staged", [id])).pass).toBe(false);
    vi.mocked(repository.readProject).mockRejectedValueOnce(
      new SilvermoonError("events", "Partial deletion"),
    );
    expect((await run("staged", [id])).pass).toBe(false);
  });
  it("protects deployment report prefixes while allowing append-only retries", async () => {
    const source = files();
    source.set(reportPath, Buffer.from(report(head)));
    previous = project(root, source);
    source.set(reportPath, Buffer.from(report(head, "fail")));
    candidate(source);
    expect(await run()).toMatchObject({
      problems: [{ code: "commit-history-deployment-report-append-only" }],
    });
    source.set(reportPath, Buffer.from(report(head) + report(head, "fail")));
    candidate(source);
    expect((await run()).pass).toBe(true);
  });
  it("does not parse unchanged Ideas, and includes untracked Ideas only in worktree checks", async () => {
    changed = "";
    expect((await run()).pass).toBe(true);
    expect(vi.mocked(repository.readProject).mock.calls[0]?.[3]).toEqual(
      new Set(),
    );
    untracked = `.silvermoon/i/${id}/requirements/Spec.md\0`;
    await run("worktree");
    expect(vi.mocked(repository.readProject).mock.calls.at(-1)?.[3]).toEqual(
      new Set([id]),
    );
    await run("staged");
    expect(vi.mocked(repository.readProject).mock.calls.at(-1)?.[3]).toEqual(
      new Set(),
    );
  });
  it.each(["unborn", "adoption"] as const)(
    "accepts initial metadata for %s",
    async (mode) => {
      revision = mode === "unborn" ? undefined : tip;
      if (mode === "adoption") {
        const normal = vi.mocked(repository.git).getMockImplementation()!;
        vi.mocked(repository.git).mockImplementation((root, args, signal) =>
          args[0] === "ls-tree"
            ? Promise.resolve("")
            : normal(root, args, signal),
        );
      }
      expect((await run()).pass).toBe(true);
    },
  );
  it("resolves committed snapshots against their first parent, never current worktree", async () => {
    expect((await run("HEAD")).pass).toBe(true);
    expect(
      vi
        .mocked(repository.readProject)
        .mock.calls.map(([, snapshot]) => snapshot),
    ).toEqual([tip, head]);
    expect(
      vi
        .mocked(repository.git)
        .mock.calls.find(([, args]) => args[0] === "diff")?.[1],
    ).toContain(head);
    await run(head);
  });
  it.each(["--all", ".silvermoon/i/bad/file"] as const)(
    "rejects invalid selector/layout %s",
    async (value) => {
      if (value.startsWith(".")) changed = value;
      expect((await run(value.startsWith(".") ? "staged" : value)).pass).toBe(
        false,
      );
    },
  );
  it.each(["git-context", "concurrent-edit", "internal", "protocol"] as const)(
    "propagates %s execution errors",
    async (code) => {
      vi.mocked(repository.verifyRepositoryRoot).mockRejectedValueOnce(
        new SilvermoonError(code, "execution fault"),
      );
      await expect(run()).rejects.toThrow(/execution fault/);
    },
  );
  it.each([
    new SyntaxError("invalid"),
    new TypeError("invalid"),
    Object.assign(new Error("invalid"), { code: 128 }),
  ])("reports invalid candidates, not success", async (error) => {
    vi.mocked(repository.readProject).mockRejectedValueOnce(error);
    expect(await run()).toMatchObject({
      problems: [{ code: "commit-snapshot-valid" }],
    });
  });
  it("preserves unexpected adapter faults and rejects missing host executable context", async () => {
    vi.mocked(repository.readProject).mockRejectedValueOnce(
      new Error("transport"),
    );
    await expect(run()).rejects.toThrow(/transport/);
    await expect(
      executeCheck({
        checkpoints: commitCheckpoints({ entry: "", path: "" }),
        target: { userHome: home, repoRoot: root, snapshot: "staged" },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/Git requires/);
  });
  it("validates implementation rev object kind", async () => {
    const { signed, pairedEvent } = await import("./paired-fixtures.js");
    candidate(
      add(
        signed(),
        pairedEvent({ type: "verify", phase: "implementation", rev: head }),
      ),
    );
    const normal = vi.mocked(repository.git).getMockImplementation()!;
    vi.mocked(repository.git).mockImplementation((root, args, signal) =>
      args[0] === "cat-file"
        ? Promise.resolve("blob")
        : normal(root, args, signal),
    );
    expect((await run()).pass).toBe(false);
    expect(canonical(current.config)).toContain("primaryRepository");
  });
});
