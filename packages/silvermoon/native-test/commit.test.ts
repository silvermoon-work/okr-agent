import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeCheck } from "@silvermoon-work/check-task-sdk";
import { commitCheckpoints } from "../src/commit-check.js";
import { bundledArtifact, observe } from "../src/host.js";
import { git } from "../src/repository.js";
import {
  add,
  event,
  id,
  materialize,
  repository,
  scratch,
  sync,
  readLegacyProject as readProject,
  legacySelectIdea as selectIdea,
} from "./fixtures.js";

async function setup() {
  const { root } = await repository();
  const home = await scratch();
  const runtime = { entry: "", path: process.env.PATH ?? "" };
  const target = { userHome: home, repoRoot: root, snapshot: "staged" };
  const run = (snapshot = "staged") =>
    executeCheck({
      checkpoints: commitCheckpoints(runtime),
      target: { ...target, snapshot },
      signal: new AbortController().signal,
    });
  return { root, home, runtime, target, run };
}
describe("independent Silvermoon commit Check Task", () => {
  it("validates the index without device readiness, clean worktree, upstream or primary synchronization", async () => {
    const { root, home, runtime, target, run } = await setup();
    await mkdir(join(home, ".config", "silvermoon"), { recursive: true });
    await writeFile(
      join(home, ".config", "silvermoon", "config.yaml"),
      "not: supported",
    );
    await git(root, ["remote", "remove", "origin"]);
    await git(root, ["switch", "--detach", "HEAD"]);
    await writeFile(join(root, "untracked.txt"), "not staged\n");
    await writeFile(
      join(root, ".silvermoon", "i", id, "events.jsonl"),
      "invalid unstaged content\n",
    );
    expect(await run()).toMatchObject({ pass: true });
    expect(await run("worktree")).toMatchObject({
      problems: [
        { checkpoint: "commit-snapshot", code: "commit-snapshot-valid" },
      ],
    });
    const commit = await bundledArtifact("commit");
    const idea = await bundledArtifact();
    expect(commit.cid).not.toBe(idea.cid);
    const result = await observe(
      { userHome: home, repoRoot: root },
      {
        runtime,
        operation: { mode: "snapshot", snapshot: "staged" },
      },
    );
    expect(result.checkCid).toBe(commit.cid);
    expect(result.result.pass).toBe(true);
    expect(result.target).toEqual(target);
    expect(await git(root, ["status", "--porcelain"])).toContain(
      "events.jsonl",
    );
    await expect(
      observe(
        { userHome: home, repoRoot: root },
        {
          runtime,
          operation: { mode: "snapshot", snapshot: "staged" },
          artifacts: [idea],
          cid: idea.cid,
        },
      ),
    ).rejects.toThrow();
  }, 20_000);

  it("accepts valid staged event additions while unrelated worktree files remain dirty", async () => {
    const { root, home, runtime, run } = await setup();
    const original = selectIdea(await readProject(root), id);
    await materialize(
      root,
      add(original.files, event({ type: "setAlias", alias: "new-alias" })),
    );
    await git(root, ["add", "--", `.silvermoon/i/${id}/events.jsonl`]);
    await writeFile(join(root, "source.txt"), "Unstaged deliverable edit\n");
    expect(await run()).toMatchObject({ pass: true });
    const report = await observe(
      { userHome: home, repoRoot: root },
      { runtime, operation: { mode: "snapshot", snapshot: "staged" } },
    );
    expect(report.result.pass).toBe(true);
    expect(report.checkCid).toBe((await bundledArtifact("commit")).cid);
    expect(await readFile(join(root, "source.txt"), "utf8")).toBe(
      "Unstaged deliverable edit\n",
    );
    expect(
      await git(root, ["status", "--porcelain", "--", "source.txt"]),
    ).toContain("M source.txt");
  });

  it("rejects a coherent bootstrap and created-event identity rewrite", async () => {
    const { root, run } = await setup();
    const artifact = await bundledArtifact();
    const current = selectIdea(await readProject(root), id);
    const source = new Map(current.files);
    for (const path of ["idea.json", "events.jsonl"])
      source.set(
        path,
        Buffer.from(
          new TextDecoder()
            .decode(source.get(path))
            .replaceAll(current.bootstrap.checkCid, artifact.cid),
        ),
      );
    await materialize(root, source);
    await git(root, ["add", "--", `.silvermoon/i/${id}`]);
    const result = await run();
    expect(result).toMatchObject({
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

  it("compares immutable bootstrap values without treating JSON formatting as an identity change", async () => {
    const { root, run } = await setup();
    const { bootstrap } = selectIdea(await readProject(root), id);
    await writeFile(
      join(root, ".silvermoon", "i", id, "idea.json"),
      JSON.stringify(
        {
          version: bootstrap.version,
          id: bootstrap.id,
          checkCid: bootstrap.checkCid,
          createdAt: bootstrap.createdAt,
        },
        null,
        2,
      ),
    );
    await git(root, ["add", "--", `.silvermoon/i/${id}/idea.json`]);
    expect((await run()).pass).toBe(true);
  });

  it("rejects validly encoded changes to an already committed event", async () => {
    const { root, run } = await setup();
    const current = selectIdea(await readProject(root), id);
    await materialize(
      root,
      add(current.files, event({ type: "setAlias", alias: "before" })),
    );
    await sync(root);
    const path = join(root, ".silvermoon", "i", id, "events.jsonl");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        '"alias":"before"',
        '"alias":"after"',
      ),
    );
    await git(root, ["add", "--", path]);
    expect(await run()).toMatchObject({
      problems: [
        {
          checkpoint: "commit-history",
          code: "commit-history-event-history-append-only",
        },
      ],
    });
  });

  it("protects the original event bytes even when UTF-8 decoding hides a BOM insertion", async () => {
    const { root, run } = await setup();
    const path = join(root, ".silvermoon", "i", id, "events.jsonl");
    await writeFile(
      path,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(path)]),
    );
    await git(root, ["add", "--", path]);
    expect(await run()).toMatchObject({
      problems: [
        {
          checkpoint: "commit-history",
          code: "commit-history-event-history-append-only",
        },
      ],
    });
  });

  it("rejects deleting an established Idea without requiring remote refs", async () => {
    const { root, run } = await setup();
    await git(root, ["remote", "remove", "origin"]);
    await rm(join(root, ".silvermoon", "i", id), { recursive: true });
    await git(root, ["add", "-A"]);
    expect(await run()).toMatchObject({
      problems: [
        {
          checkpoint: "commit-history",
          code: "commit-history-idea-identity-immutable",
        },
      ],
    });
  });

  it("allows only explicitly named whole deletions in the index and the real Task", async () => {
    const { root, home, runtime, target } = await setup();
    await rm(join(root, ".silvermoon", "i", id), { recursive: true });
    await git(root, ["add", "-A"]);
    expect(
      await executeCheck({
        checkpoints: commitCheckpoints(runtime),
        target: { ...target, allowDelete: [id] },
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ pass: true });
    expect(
      (
        await observe(
          { userHome: home, repoRoot: root },
          {
            runtime,
            operation: {
              mode: "snapshot",
              snapshot: "staged",
              allowDelete: [id],
            },
          },
        )
      ).result.pass,
    ).toBe(true);
    await expect(
      observe(
        { userHome: home, repoRoot: root },
        {
          runtime,
          operation: {
            mode: "snapshot",
            snapshot: "staged",
            allowDelete: ["not-an-id"],
          },
        },
      ),
    ).rejects.toThrow();
  });

  it("rejects deletion exceptions for retained Ideas and partial deletions", async () => {
    const { root, runtime, target } = await setup();
    const run = () =>
      executeCheck({
        checkpoints: commitCheckpoints(runtime),
        target: { ...target, allowDelete: [id] },
        signal: new AbortController().signal,
      });
    expect((await run()).pass).toBe(false);
    await rm(join(root, ".silvermoon", "i", id, "events.jsonl"));
    await git(root, ["add", "-A"]);
    expect((await run()).pass).toBe(false);
  });

  it("does not parse unchanged Ideas, but fully validates changed and untracked Ideas", async () => {
    const { root, run } = await setup();
    const path = join(root, ".silvermoon", "i", id, "events.jsonl");
    await writeFile(path, "historical invalid data\n");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "Unchanged historical fixture"]);
    await writeFile(join(root, "source.txt"), "Deliverable only\n");
    expect((await run("worktree")).pass).toBe(true);
    expect((await run("staged")).pass).toBe(true);
    await writeFile(
      join(root, ".silvermoon", "i", id, "requirements", "Spec.md"),
      "Changed requirements\n",
    );
    expect((await run("worktree")).pass).toBe(false);
    const newId = "202611191608abcd";
    await mkdir(join(root, ".silvermoon", "i", newId), { recursive: true });
    await writeFile(
      join(root, ".silvermoon", "i", newId, "events.jsonl"),
      "invalid new Idea\n",
    );
    await git(root, [
      "restore",
      "--worktree",
      "--",
      `.silvermoon/i/${id}/requirements/Spec.md`,
    ]);
    expect((await run("worktree")).pass).toBe(false);
    expect((await run("staged")).pass).toBe(true);
  });

  it.each(["unborn", "adoption"] as const)(
    "accepts an initial staged Silvermoon snapshot for %s",
    async (mode) => {
      const root = await scratch();
      await git(root, ["init", "--initial-branch=main"]);
      if (mode === "adoption") {
        await git(root, ["config", "user.email", "fixture@example.invalid"]);
        await git(root, ["config", "user.name", "Fixture"]);
        await writeFile(join(root, "source.txt"), "Existing repository\n");
        await git(root, ["add", "source.txt"]);
        await git(root, ["commit", "-m", "Existing project"]);
      }
      await mkdir(join(root, ".silvermoon"), { recursive: true });
      await writeFile(
        join(root, ".silvermoon", "config.yaml"),
        "version: 2\nprimaryRepository: example/project\nprimaryBranch: main\n",
      );
      await materialize(root);
      await git(root, ["add", "--all"]);
      const result = await executeCheck({
        checkpoints: commitCheckpoints({
          entry: "",
          path: process.env.PATH ?? "",
        }),
        target: {
          userHome: await scratch(),
          repoRoot: root,
          snapshot: "staged",
        },
        signal: new AbortController().signal,
      });
      expect(result.pass).toBe(true);
    },
  );

  it("rejects unsupported snapshot selectors instead of passing them as Git options", async () => {
    const { run } = await setup();
    expect(await run("--all")).toMatchObject({
      problems: [
        { checkpoint: "commit-snapshot", code: "commit-snapshot-valid" },
      ],
    });
  });

  it("keeps unavailable Git execution context distinct from an invalid candidate", async () => {
    const { target } = await setup();
    await expect(
      executeCheck({
        checkpoints: commitCheckpoints({ entry: "", path: "" }),
        target,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/Git requires/);
  });

  it("checks a committed snapshot against its parent, not the current worktree", async () => {
    const { root, run } = await setup();
    expect((await run("HEAD")).pass).toBe(true);
    const current = selectIdea(await readProject(root), id);
    await materialize(
      root,
      add(current.files, event({ type: "setAlias", alias: "committed" })),
    );
    await sync(root);
    await writeFile(join(root, ".silvermoon", "i", id, "idea.json"), "{");
    expect((await run("HEAD")).pass).toBe(true);
  });
});
