import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  absent,
  discoverRoot,
  draftChanges,
  ensureParent,
  git,
  localContext,
  localIdeaState,
  observedIdeaState,
  preCommitHookPath,
  primary,
  protectedPath,
  readIdeaProject,
  readProject,
  readRegular,
  readRepository,
  regular,
  snapshotDigest,
  snapshotHistory,
  validSubjects,
  verifyIdeaHistory,
  type Project,
} from "../src/repository.js";
import { canonical, idea, SilvermoonError } from "../src/domain.js";
import {
  add,
  batch,
  cid,
  date,
  event,
  files,
  head,
  id,
  materialize,
  scratch,
  signed,
  legacySelectIdea as selectIdea,
} from "./fixtures.js";
import {
  files as pairedFiles,
  pairedEvent,
  signed as pairedSigned,
} from "./paired-fixtures.js";
import {
  configText,
  encodedSnapshot,
  localSnapshot,
  project,
  tip,
} from "./snapshots.js";
import { flatProject, flatFiles } from "./flat-fixtures.js";
import { isFlatIdea } from "../src/flat.js";
function repositoryFlat(project: Project) {
  const current = project.ideas.get(id)!;
  if (!isFlatIdea(current)) throw new Error("Expected a flat Idea fixture");
  return current;
}

const command = vi.hoisted(() =>
  vi.fn<
    (
      file: string,
      args: string[],
      options: {
        cwd: string;
        encoding: string;
        env?: NodeJS.ProcessEnv;
        signal?: AbortSignal;
      },
    ) => Promise<{ stdout: string | Uint8Array; stderr: string }>
  >(),
);
vi.mock("node:child_process", () => ({
  execFile: Object.assign(() => undefined, {
    [Symbol.for("nodejs.util.promisify.custom")]: command,
  }),
}));
afterEach(() => {
  command.mockReset();
  vi.restoreAllMocks();
});

async function fixture(source = files()) {
  const root = await scratch();
  await mkdir(join(root, ".silvermoon"));
  await writeFile(join(root, ".silvermoon", "config.yaml"), configText);
  await materialize(root, source);
  const current = project(root, source);
  const committed = encodedSnapshot(current);
  const staged = encodedSnapshot(current, true);
  const outputs: Record<string, string | Error> = {
    "symbolic-ref": "main",
    config: "origin",
    remote: "https://github.com/example/project.git",
    status: "",
    "merge-base": "",
    diff: "",
    "for-each-ref": "refs/remotes/origin/main",
    "ls-remote": `${tip}\trefs/heads/main`,
    fetch: "",
    filemode: "true",
  };
  command.mockImplementation(async (_file, args) => {
    await Promise.resolve();
    const start =
      args[0] === "--no-pager"
        ? args.indexOf("protocol.ext.allow=never") + 1
        : 0;
    const query = args.slice(start);
    const name = query[0]!;
    if (name === "rev-parse")
      return {
        stdout: query.includes("--show-object-format")
          ? "sha1"
          : query.includes("--show-toplevel")
            ? root
            : query.includes("--git-path")
              ? join(root, "custom-hooks")
              : query.at(-1) === "HEAD"
                ? head
                : tip,
        stderr: "",
      };
    if (name === "ls-tree" || name === "ls-files")
      return {
        stdout: query.includes("-d")
          ? ""
          : name === "ls-files"
            ? staged.listing
            : committed.listing,
        stderr: "",
      };
    if (name === "cat-file") {
      if (query[1] === "-t") return { stdout: "commit", stderr: "" };
      const bytes = committed.blobs.get(query[2]!);
      if (!bytes) throw new Error(`Unprepared blob: ${query[2]}`);
      return { stdout: bytes, stderr: "" };
    }
    if (name === "config" && query.at(-1)?.endsWith(".merge"))
      return { stdout: "refs/heads/main", stderr: "" };
    if (name === "config" && query.at(-1) === "core.filemode")
      return { stdout: String(outputs.filemode), stderr: "" };
    const value = outputs[name];
    if (value instanceof Error) throw value;
    if (value === undefined)
      throw new Error(`Unprepared Git query: ${query.join(" ")}`);
    return { stdout: value, stderr: "" };
  });
  return { root, current, outputs, committed, staged };
}

describe("repository adapters with prepared Git output", () => {
  it("measures flat committed/index/worktree folder candidates with actual raw tree metadata and modes", async () => {
    const { root, committed, staged, outputs } = await fixture();
    await rm(join(root, ".silvermoon", "i", id), { recursive: true });
    const source = flatFiles();
    await materialize(root, source);
    const expected = flatProject(root, source);
    Object.assign(committed, encodedSnapshot(expected));
    Object.assign(staged, encodedSnapshot(expected, true));
    const normal = command.getMockImplementation()!;
    command.mockImplementation((file, args, options) =>
      args.includes("ls-tree") && args.includes("-d")
        ? Promise.resolve({ stdout: committed.trees, stderr: "" })
        : normal(file, args, options),
    );
    const current = repositoryFlat(await readProject(root, "HEAD"));
    for (const [, , options] of command.mock.calls.filter(([, args]) =>
      args.includes("cat-file"),
    ))
      expect(options.env).toMatchObject({
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_OPTIONAL_LOCKS: "0",
      });
    const candidate = repositoryFlat(await readProject(root, "staged"));
    expect(current.revisions).toEqual(candidate.revisions);
    expect(repositoryFlat(await readProject(root)).revisions).toEqual(
      candidate.revisions,
    );
    staged.listing = staged.listing.replace(
      /100644 ([a-f0-9]+) 0\t(\.silvermoon\/i\/[^/]+\/implementation\/Spec\.md)/,
      "100755 $1 0\t$2",
    );
    const executable = repositoryFlat(await readProject(root, "staged"));
    expect(executable.revisions.implementation).not.toBe(
      candidate.revisions.implementation,
    );
    expect(executable.revisions["test-spec"]).toBe(
      candidate.revisions["test-spec"],
    );
    outputs.filemode = "false";
    expect(
      repositoryFlat(await readProject(root)).revisions.implementation,
    ).toBe(executable.revisions.implementation);
    await writeFile(
      join(root, ".silvermoon", "i", id, "requirements", "Spec.md"),
      "new worktree requirement",
    );
    expect(
      repositoryFlat(await readProject(root)).revisions.requirements,
    ).not.toBe(candidate.revisions.requirements);
    expect(
      repositoryFlat(await readProject(root, "staged")).revisions.requirements,
    ).toBe(candidate.revisions.requirements);
    committed.trees = committed.trees.replace(
      candidate.revisions.requirements,
      "0".repeat(40),
    );
    await expect(readProject(root, "HEAD")).rejects.toThrow(/actual Git tree/);
  });
  it("bounds and isolates process calls, and resolves hooks without disabling their configuration", async () => {
    const { root } = await fixture();
    const signal = new AbortController().signal;
    expect(await git(root, ["status"], signal)).toBe("");
    const [file, args, options] = command.mock.calls[0]!;
    expect(file).toBe("git");
    expect(args).toContain("protocol.ext.allow=never");
    expect(args).toContain("credential.helper=");
    expect(args).toContain("core.fsmonitor=false");
    expect(args.some((value) => value.startsWith("core.hooksPath="))).toBe(
      true,
    );
    expect(options).toMatchObject({ cwd: root, signal, timeout: 30_000 });
    expect(await preCommitHookPath(root)).toBe(
      join(root, "custom-hooks", "pre-commit"),
    );
    expect(
      command.mock.calls
        .at(-1)![1]
        .some((value) => value.startsWith("core.hooksPath=")),
    ).toBe(false);
  });

  it("reads worktree, index and immutable snapshots independently, ignoring archive and guidance", async () => {
    const { root, current } = await fixture();
    await mkdir(join(root, ".silvermoon", "ideas", "INVALID"), {
      recursive: true,
    });
    await writeFile(
      join(root, ".silvermoon", "ideas", "INVALID", "broken.yaml"),
      "not: [yaml",
    );
    expect(snapshotDigest(await readProject(root, "HEAD"))).toBe(
      snapshotDigest(current),
    );
    expect(snapshotDigest(await readProject(root, "staged"))).toBe(
      snapshotDigest(current),
    );
    await writeFile(
      join(root, ".silvermoon", "i", id, "technical", "design.md"),
      "Draft",
    );
    expect(snapshotDigest(await readProject(root))).not.toBe(
      snapshotDigest(current),
    );
    expect(snapshotDigest(await readProject(root, "staged"))).toBe(
      snapshotDigest(current),
    );
    expect((await readIdeaProject(root, id)).ideas.size).toBe(1);
    expect(await readRepository(root, "HEAD")).toMatchObject({
      config: current.config,
    });
    expect(await readRepository(root)).toMatchObject({
      config: current.config,
    });
    await expect(readProject(root, "main")).rejects.toThrow(/exact commit/);
    await expect(readProject("relative")).rejects.toThrow(/absolute/);
    command.mockResolvedValue({
      stdout: join(root, "subdirectory"),
      stderr: "",
    });
    await expect(readProject(root)).rejects.toThrow(/repository root/);
  });

  it("selects aliases without reading other Ideas and rejects duplicate aliases and invalid new paths", async () => {
    const source = add(files(), event({ type: "setAlias", alias: "selected" }));
    const { root } = await fixture(source);
    expect(
      selectIdea(await readIdeaProject(root, "selected"), "selected").bootstrap
        .checkCid,
    ).toBe(cid);
    expect(() => selectIdea(project(root), "archived")).toThrow(/archived/);
    const other = "2026111716100000";
    for (const [path, bytes] of source) {
      const target = join(root, ".silvermoon", "i", other, path);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(
        target,
        Buffer.from(
          new TextDecoder()
            .decode(bytes)
            .replaceAll(id, other)
            .replaceAll(date, "2026-11-17T16:10:22.408Z"),
        ),
      );
    }
    expect((await readIdeaProject(root, id)).ideas.size).toBe(1);
    await expect(readProject(root)).rejects.toThrow(/aliases/);
    await rm(join(root, ".silvermoon", "i", other), { recursive: true });
    await writeFile(join(root, ".silvermoon", "i", "bad-id"), "invalid");
    await expect(readProject(root)).rejects.toThrow(/Invalid new Idea/);
    await rm(join(root, ".silvermoon", "i"), { recursive: true });
    expect((await readProject(root)).ideas.size).toBe(0);
    await mkdir(join(root, ".silvermoon", "i"));
    await expect(
      readProject(root, "worktree", undefined, new Set(["bad"])),
    ).rejects.toThrow(/Invalid Idea ID/);
  });

  it.each([
    "120000 blob abc\t.silvermoon/i/link\0",
    "100644 abc 1\t.silvermoon/i/conflict\0",
    "100644 blob abc\t../escape\0",
  ])("rejects unsafe Git entries %s", async (listing) => {
    const { root } = await fixture();
    const normal = command.getMockImplementation()!;
    command.mockImplementation((file, args, options) =>
      args.includes("ls-tree")
        ? Promise.resolve({ stdout: listing, stderr: "" })
        : normal(file, args, options),
    );
    await expect(readProject(root, "HEAD")).rejects.toThrow(
      /Snapshot includes|Invalid snapshot path/,
    );
  });

  it("enforces file and aggregate snapshot bounds and cancellation", async () => {
    const { root, committed } = await fixture();
    const normal = command.getMockImplementation()!;
    command.mockImplementation((file, args, options) =>
      args.includes("ls-tree")
        ? Promise.resolve({ stdout: "entry\0".repeat(2049), stderr: "" })
        : normal(file, args, options),
    );
    await expect(readProject(root, "HEAD")).rejects.toThrow(/2048/);
    command.mockImplementation(normal);
    committed.blobs.set(
      committed.blobs.keys().next().value!,
      Buffer.alloc(16 * 1024 * 1024 + 1),
    );
    await expect(readProject(root, "HEAD")).rejects.toThrow(/16 MiB/);
    const oversized = join(root, "oversized");
    await writeFile(oversized, Buffer.alloc(16 * 1024 * 1024 + 1));
    await expect(readRegular(oversized)).rejects.toThrow(/oversized/);
    const signal = AbortSignal.abort(new Error("cancelled"));
    await expect(
      readRegular(join(root, ".silvermoon", "config.yaml"), signal),
    ).rejects.toThrow(/cancelled/);
  });

  it("rejects symlinks and path escapes while preserving ordinary filesystem behavior", async () => {
    const { root } = await fixture();
    const outside = await scratch();
    const link = join(root, ".silvermoon", "i", id, "requirements", "link");
    await symlink(outside, link, "junction");
    await expect(readProject(root)).rejects.toThrow(/Unsafe/);
    await expect(protectedPath(root, join(link, "secret"))).rejects.toThrow(
      /regular directory/,
    );
    await expect(protectedPath(root, outside)).rejects.toThrow(/escapes/);
    await expect(regular(join(root, ".silvermoon"))).rejects.toThrow(
      /regular file/,
    );
    await ensureParent(root, join(root, ".silvermoon", "new", "file"));
    expect(await absent(join(root, "missing"))).toBe(true);
    expect(await absent(root)).toBe(false);
    expect(await discoverRoot(root)).toBe(root);
    command.mockRejectedValue(new Error("not a repository"));
    expect(await discoverRoot(root)).toBeUndefined();
  });

  it("distinguishes confirmed missing branches, transport faults, upstream mismatch, dirty status and ancestry", async () => {
    const { current, outputs } = await fixture();
    expect(
      await primary(current, { fetch: true, checkBranch: true }),
    ).toMatchObject({ head, tip });
    outputs["ls-remote"] = Object.assign(new Error("absent"), { code: 2 });
    await expect(
      primary(current, { fetch: true, checkBranch: true }),
    ).rejects.toMatchObject({ code: "primary-branch-missing" });
    outputs["ls-remote"] = Object.assign(new Error("transport"), { code: 128 });
    await expect(
      primary(current, { fetch: true, checkBranch: true }),
    ).rejects.toThrow(/transport/);
    outputs["remote"] = "https://github.com/elsewhere/project.git";
    await expect(primary(current)).rejects.toThrow(/primaryRepository/);
    outputs["remote"] = current.root;
    expect(
      await primary(current, { localRemote: current.root }),
    ).toHaveProperty("tip");
    outputs["config"] = ".";
    await expect(
      primary(current, { localRemote: current.root }),
    ).rejects.toThrow(/upstream/);
    outputs["config"] = "origin";
    outputs["status"] = "R  source.txt\0";
    await expect(
      primary(current, { localRemote: current.root }),
    ).rejects.toThrow(/Renames/);
    outputs["status"] = "?? source.txt\0 M .silvermoon\\ideas\\old\0";
    expect(
      (await primary(current, { localRemote: current.root })).changes,
    ).toEqual(["source.txt", ".silvermoon/ideas/old"]);
    outputs["merge-base"] = Object.assign(new Error("not ancestor"), {
      code: 1,
    });
    await expect(
      primary(current, { localRemote: current.root }),
    ).rejects.toThrow(/not ancestor/);
  });

  it("protects identity and byte prefixes, including BOM, without treating JSON formatting as identity", () => {
    const before = idea(files(), id);
    const formatting = new Map(before.files);
    formatting.set(
      "idea.json",
      Buffer.from(JSON.stringify(before.bootstrap, null, 2)),
    );
    verifyIdeaHistory(idea(formatting, id), before);
    expect(() => {
      verifyIdeaHistory(undefined, before);
    }).toThrow(/identity/);
    const rewritten = new Map(before.files);
    rewritten.set(
      "events.jsonl",
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(before.eventSource),
      ]),
    );
    expect(() => {
      verifyIdeaHistory(idea(rewritten, id), before);
    }).toThrow(/append-only/);
    const changed = new Map(before.files);
    changed.set(
      "idea.json",
      Buffer.from(
        canonical({
          ...before.bootstrap,
          createdAt: "2026-11-17T16:09:23.000Z",
        }),
      ),
    );
    changed.set(
      "events.jsonl",
      Buffer.from(
        canonical({ ...before.events[0], at: "2026-11-17T16:09:23.000Z" }) +
          "\n",
      ),
    );
    expect(() => {
      verifyIdeaHistory(idea(changed, id), before);
    }).toThrow(/identity/);
  });

  it("checks history even for whole deletion and handles explicitly historical snapshots", async () => {
    const { root, current, outputs } = await fixture();
    await expect(snapshotHistory(current, "HEAD")).resolves.toBeUndefined();
    const empty = project(root, null);
    const removed = { ...empty, ideas: new Map() };
    await expect(snapshotHistory(removed, "worktree")).rejects.toThrow(
      /rewrites/,
    );
    await expect(snapshotHistory(removed, tip)).resolves.toBeUndefined();
    outputs["for-each-ref"] = "refs/remotes/other/not-main\ninvalid";
    await expect(snapshotHistory(current, "worktree")).rejects.toThrow(
      /unavailable/,
    );
    await expect(snapshotHistory(removed, "worktree")).resolves.toBeUndefined();
    outputs["for-each-ref"] = "refs/remotes/origin/main";
    outputs["merge-base"] = Object.assign(new Error("not ancestor"), {
      code: 1,
    });
    await expect(snapshotHistory(removed, "HEAD")).rejects.toThrow(/rewrites/);
  });

  it("accepts only ancestor evidence with unchanged deliverable content; propagates unexpected errors", async () => {
    const source = signed();
    const tested = idea(source, id);
    const verified = add(
      source,
      event({ type: "verify", batch: { ...batch(tested), subject: tip } }),
    );
    const { root, outputs } = await fixture(verified);
    const current = idea(verified, id);
    expect(await validSubjects(root, current, head)).toEqual([head, tip]);
    outputs["diff"] = "source.txt";
    expect(await validSubjects(root, current, head)).toEqual([head]);
    outputs["diff"] = "";
    outputs["merge-base"] = Object.assign(new Error("unknown"), { code: 128 });
    expect(await validSubjects(root, current, head)).toEqual([head]);
    outputs["merge-base"] = new Error("execution fault");
    await expect(validSubjects(root, current, head)).rejects.toThrow(
      /execution fault/,
    );
    outputs["merge-base"] = new SilvermoonError("evidence", "invalid evidence");
    await expect(validSubjects(root, current, head)).rejects.toThrow(
      /invalid evidence/,
    );
    const invalid = idea(
      add(
        source,
        event({
          type: "verify",
          batch: { ...batch(tested), subject: "not-a-commit" },
        }),
      ),
      id,
    );
    expect(await validSubjects(root, invalid, head)).toEqual([head]);
  });

  it("binds paired evidence to the exact five versions in its prepared commit snapshot", async () => {
    const source = pairedSigned();
    const verified = add(
      source,
      pairedEvent({ type: "verify", phase: "implementation", rev: tip }),
    );
    const { root, committed, outputs } = await fixture(verified);
    expect(await validSubjects(root, idea(verified, id), head)).toEqual([tip]);
    const changed = new Map(source);
    changed.set("technical/Spec.md", Buffer.from("Different signed version"));
    const encoded = encodedSnapshot(project(root, changed));
    committed.listing = encoded.listing;
    committed.blobs.clear();
    for (const [object, bytes] of encoded.blobs)
      committed.blobs.set(object, bytes);
    expect(await validSubjects(root, idea(verified, id), head)).toEqual([]);
    outputs["diff"] = "source.txt";
    expect(await validSubjects(root, idea(verified, id), head)).toEqual([]);
    const normal = command.getMockImplementation()!;
    command.mockImplementation((file, args, options) =>
      args.includes("-t")
        ? Promise.resolve({ stdout: "blob", stderr: "" })
        : normal(file, args, options),
    );
    await expect(validSubjects(root, idea(verified, id), head)).rejects.toThrow(
      /exact commit/,
    );
  });

  it("reports local freshness and unknown state rather than inventing primary readiness", async () => {
    const { current, outputs } = await fixture(pairedFiles());
    const available = await localContext(current);
    expect(available.observation).toMatchObject({
      scope: "local",
      fresh: false,
      primary: { status: "available", tip },
    });
    expect(
      (await localIdeaState(current, current.ideas.get(id)!, available)).level,
    ).toBe("requirements");
    expect(
      (
        await observedIdeaState(
          current,
          current.ideas.get(id)!,
          { head, primary: current },
          "fr-FR",
        )
      ).contentLanguage,
    ).toBe("zh-CN");
    outputs["for-each-ref"] = "refs/remotes/origin/other\ninvalid";
    const unavailable = await localContext(current);
    expect(unavailable.observation.primary).toMatchObject({
      status: "unavailable",
    });
    expect(
      await localIdeaState(
        current,
        current.ideas.get(id)!,
        unavailable,
        "fr-FR",
      ),
    ).toMatchObject({ level: "unknown", contentLanguage: "zh-CN" });
    outputs["for-each-ref"] = "refs/remotes/origin/main";
    outputs["remote"] = "https://github.com/unrelated/project.git";
    expect((await localContext(current)).observation.primary.status).toBe(
      "unavailable",
    );
    expect(localSnapshot(current).observation.fresh).toBe(false);
  });

  it("restricts drafts to the active gate and never accepts unrelated edits", () => {
    expect(
      draftChanges(
        [`.silvermoon/i/${id}/requirements/Spec.md`],
        id,
        "requirements",
      ),
    ).toBe(true);
    expect(draftChanges(["source.txt"], id, "requirements")).toBe(false);
    expect(
      draftChanges(
        [`.silvermoon/i/${id}/evidence/deployment/run.txt`],
        id,
        "implementation",
      ),
    ).toBe(false);
    expect(
      draftChanges([`.silvermoon/i/${id}/events.jsonl`], id, "unknown"),
    ).toBe(true);
    expect(
      draftChanges([`.silvermoon/i/${id}/technical/Spec.md`], id, "abandoned"),
    ).toBe(false);
  });
});
