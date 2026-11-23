import { mkdir, readFile, symlink, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  absent,
  discoverRoot,
  draftChanges,
  ensureParent,
  git,
  primary,
  protectedPath,
  readRegular,
  regular,
  snapshotDigest,
  snapshotHistory,
  validSubjects,
} from "../src/repository.js";
import { canonical, digest, idea, reduce, type Event } from "../src/domain.js";
import { appendEvent, createIdea, replay } from "../src/write.js";
import {
  add,
  batch,
  cid,
  date,
  event,
  files,
  id,
  materialize,
  repository,
  scratch,
  signed,
  sync,
  readLegacyProject as readProject,
  legacySelectIdea as selectIdea,
} from "./fixtures.js";

describe("bounded Git snapshots and archive isolation", () => {
  it("distinguishes confirmed missing primary branches from transport failures", async () => {
    const { root, remote } = await repository();
    const project = await readProject(root);
    await expect(
      primary(project, { localRemote: remote, fetch: true, checkBranch: true }),
    ).resolves.toHaveProperty("tip");
    await git(remote, ["update-ref", "-d", "refs/heads/main"]);
    await expect(
      primary(project, { localRemote: remote, fetch: true, checkBranch: true }),
    ).rejects.toMatchObject({
      code: "primary-branch-missing",
    });
    await git(root, ["remote", "set-url", "origin", join(remote, "missing")]);
    await expect(
      primary(project, {
        localRemote: join(remote, "missing"),
        fetch: true,
        checkBranch: true,
      }),
    ).rejects.not.toMatchObject({
      code: "primary-branch-missing",
    });
  });
  it("validates snapshot history even when a candidate deletes every new Idea", async () => {
    const { root } = await repository();
    await expect(
      snapshotHistory(await readProject(root), "worktree"),
    ).rejects.toThrow(/unavailable/);
    await git(root, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    await expect(
      snapshotHistory(await readProject(root), "HEAD"),
    ).resolves.toBeUndefined();
    await rm(join(root, ".silvermoon", "i"), { recursive: true });
    await expect(
      snapshotHistory(await readProject(root), "worktree"),
    ).rejects.toThrow(/rewrites/);
    const empty = await repository({ idea: false });
    await expect(
      snapshotHistory(await readProject(empty.root), "worktree"),
    ).resolves.toBeUndefined();
  });
  it("reads worktree/index/HEAD independently and never parses archived Ideas, guidance or optional project skills", async () => {
    const { root, remote } = await repository();
    for (const directory of [
      "ideas/INVALID",
      "guidance",
      "../.agents/skills/untrusted",
    ]) {
      await mkdir(join(root, ".silvermoon", directory), { recursive: true });
      await writeFile(
        join(root, ".silvermoon", directory, "broken.yaml"),
        "not: [valid yaml",
      );
    }
    const current = await readProject(root);
    expect(current.ideas.size).toBe(1);
    expect(selectIdea(current, id).bootstrap.checkCid).toBe(cid);
    expect(await discoverRoot(join(root, ".silvermoon"))).toBe(root);
    expect(await discoverRoot(join(root, "does-not-exist"))).toBeUndefined();
    const committed = await readProject(root, "HEAD");
    const staged = await readProject(root, "staged");
    expect(snapshotDigest(staged)).toBe(snapshotDigest(committed));
    const path = join(root, ".silvermoon", "i", id, "technical", "design.md");
    await writeFile(path, "New draft support.");
    expect(snapshotDigest(await readProject(root))).not.toBe(
      snapshotDigest(committed),
    );
    expect(snapshotDigest(await readProject(root, "staged"))).toBe(
      snapshotDigest(committed),
    );
    await git(root, ["add", path]);
    expect(snapshotDigest(await readProject(root, "staged"))).not.toBe(
      snapshotDigest(committed),
    );
    const observed = await primary(await readProject(root), {
      localRemote: remote,
    });
    expect(
      observed.changes.some((path) => path.startsWith(".silvermoon/ideas/")),
    ).toBe(true);
    await expect(readProject(root, "main")).rejects.toThrow(/exact commit/);
    await expect(readProject(join(root, ".silvermoon"))).rejects.toThrow(
      /repository root/,
    );
    await expect(readProject("relative")).rejects.toThrow(/absolute/);
    expect(() => selectIdea(current, "01M7N22GE5C3836XJ4K87X4X95")).toThrow(
      /archived/,
    );
  });
  it("enforces configured primary/upstream/ancestry and immutable append-only identity/history", async () => {
    const { root, remote } = await repository();
    let project = await readProject(root);
    expect(
      (await primary(project, { localRemote: remote, fetch: true })).head,
    ).toBe((await primary(project, { localRemote: remote })).tip);
    await expect(primary(project)).rejects.toThrow(/primaryRepository/);
    await git(root, ["config", "branch.main.merge", "refs/heads/not-primary"]);
    await expect(primary(project, { localRemote: remote })).rejects.toThrow(
      /upstream/,
    );
    await git(root, ["config", "branch.main.merge", "refs/heads/main"]);
    const path = join(root, ".silvermoon", "i", id, "events.jsonl");
    const current = selectIdea(project, id);
    await writeFile(
      path,
      canonical({ ...current.events[0], id: "c".repeat(32) }) + "\n",
    );
    project = await readProject(root);
    await expect(primary(project, { localRemote: remote })).rejects.toThrow(
      /append-only/,
    );
    await writeFile(path, current.eventSource);
    const metadata = join(root, ".silvermoon", "i", id, "idea.json");
    const bootstrap = {
      ...current.bootstrap,
      createdAt: "2026-11-17T16:09:23.000Z",
    };
    await writeFile(metadata, canonical(bootstrap));
    await writeFile(
      path,
      canonical({ ...current.events[0], at: bootstrap.createdAt }) + "\n",
    );
    await expect(
      primary(await readProject(root), { localRemote: remote }),
    ).rejects.toThrow(/identity/);
    await materialize(root, current.files);
    await git(root, ["checkout", "--detach"]);
    await expect(
      primary(await readProject(root), { localRemote: remote }),
    ).rejects.toThrow();
  });
  it("rejects links, unsafe/unknown new paths, duplicate aliases and unmerged staged entries", async () => {
    const { root } = await repository();
    const outside = await scratch();
    await writeFile(join(outside, "secret.txt"), "Do not follow");
    const path = join(root, ".silvermoon", "i", id, "requirements", "linked");
    await symlink(outside, path, "junction");
    await expect(readProject(root)).rejects.toThrow(/Unsafe/);
    await expect(protectedPath(root, join(path, "secret.txt"))).rejects.toThrow(
      /regular directory/,
    );
    await rm(path);
    await expect(protectedPath(root, outside)).rejects.toThrow(/escapes/);
    await ensureParent(root, join(root, ".silvermoon", "new", "file"));
    await expect(regular(join(root, ".silvermoon"), false)).rejects.toThrow(
      /regular file/,
    );
    await expect(readRegular(join(root, "missing"))).rejects.toThrow();
    expect(await absent(join(root, "missing"))).toBe(true);
    await writeFile(join(root, ".silvermoon", "i", "bad-id"), "broken");
    await expect(readProject(root)).rejects.toThrow(/Invalid new Idea/);
    await rm(join(root, ".silvermoon", "i", "bad-id"));
    const first = add(files(), event({ type: "setAlias", alias: "same" }));
    await materialize(root, first);
    const otherId = "2026111716100000";
    const other = new Map(
      [...first].map(([path, bytes]) => [
        path,
        Buffer.from(
          new TextDecoder()
            .decode(bytes)
            .replaceAll(id, otherId)
            .replaceAll(date, "2026-11-17T16:10:22.408Z"),
        ),
      ]),
    );
    for (const [path, bytes] of other) {
      const target = join(root, ".silvermoon", "i", otherId, path);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, bytes);
    }
    await expect(readProject(root)).rejects.toThrow(/aliases/);
  });
  it("accepts only tested ancestors whose non-Idea content stayed unchanged", async () => {
    const { root } = await repository();
    const tested = await git(root, ["rev-parse", "HEAD"]);
    let source = signed();
    const current = idea(source, id);
    source = add(
      source,
      event({ type: "verify", batch: { ...batch(current), subject: tested } }),
    );
    await materialize(root, source);
    await sync(root);
    let head = await git(root, ["rev-parse", "HEAD"]);
    expect(await validSubjects(root, idea(source, id), head)).toContain(tested);
    await writeFile(join(root, "source.txt"), "Changed deliverable");
    await sync(root);
    head = await git(root, ["rev-parse", "HEAD"]);
    expect(await validSubjects(root, idea(source, id), head)).not.toContain(
      tested,
    );
    const invalid = add(
      signed(),
      event({
        type: "verify",
        batch: { ...batch(current), subject: "not-a-commit" },
      }),
    );
    expect(await validSubjects(root, idea(invalid, id), head)).toEqual([head]);
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
  });
});

describe("transactional new Idea creation and fact append", () => {
  it("creates only new scaffold with exclusive bounded collisions and fixed CID, preserving the legacy archive", async () => {
    const { root, remote } = await repository({ idea: false });
    const created = await createIdea(root, cid, {
      localRemote: remote,
      refresh: false,
      language: "ja-JP",
      now: () => new Date(date),
      random: () => Uint8Array.of(0x7a, 0x2f),
    });
    expect(created.id).toBe(id);
    const project = await readProject(root);
    expect(
      reduce(selectIdea(project, id), {
        head: await git(root, ["rev-parse", "HEAD"]),
      }).contentLanguage,
    ).toBe("ja-JP");
    expect(await absent(join(root, ".silvermoon", ".new.lock"))).toBe(true);
    expect(await absent(join(created.path, "ledger.md"))).toBe(true);
    await sync(root);
    await expect(
      createIdea(root, cid, {
        localRemote: remote,
        refresh: false,
        now: () => new Date(date),
        random: () => Uint8Array.of(0x7a, 0x2f),
      }),
    ).rejects.toThrow(/retry limit/);
    expect((await readProject(root)).ideas.size).toBe(1);
    let calls = 0;
    const next = await createIdea(root, cid, {
      localRemote: remote,
      refresh: false,
      now: () => new Date(date),
      random: () =>
        calls++ === 0 ? Uint8Array.of(0x7a, 0x2f) : Uint8Array.of(0, 1),
    });
    expect(next.id).toBe("2026111716090001");
    await expect(createIdea(root, cid, { language: "zh-cn" })).rejects.toThrow(
      /canonical/,
    );
  });
  it("does not create on dirty Git, invalid bootstrap, held lock or cancellation and cleans only owned partial output", async () => {
    const { root, remote } = await repository({ idea: false });
    await writeFile(join(root, "unrelated.txt"), "Preserve");
    await expect(
      createIdea(root, cid, { localRemote: remote, refresh: false }),
    ).rejects.toThrow(/clean/);
    expect(await readFile(join(root, "unrelated.txt"), "utf8")).toBe(
      "Preserve",
    );
    await rm(join(root, "unrelated.txt"));
    await expect(
      createIdea(root, "bad-cid", { localRemote: remote, refresh: false }),
    ).rejects.toThrow();
    expect((await readProject(root)).ideas.size).toBe(0);
    await writeFile(join(root, ".silvermoon", ".new.lock"), "another owner");
    await expect(
      createIdea(root, cid, { localRemote: remote, refresh: false }),
    ).rejects.toThrow(/exclusive/);
    expect(await readFile(join(root, ".silvermoon", ".new.lock"), "utf8")).toBe(
      "another owner",
    );
    await rm(join(root, ".silvermoon", ".new.lock"));
    const controller = new AbortController();
    controller.abort(new Error("Cancelled fixture"));
    await expect(
      createIdea(root, cid, {
        localRemote: remote,
        refresh: false,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/Cancelled/);
    expect(await absent(join(root, ".silvermoon", ".new.lock"))).toBe(true);
  });
  it("records exact draft signoff before synchronization, uses digest/primary compare-and-append, and replays exact cursors", async () => {
    const { root, remote } = await repository();
    const initial = selectIdea(await readProject(root), id);
    const tip = await git(root, ["rev-parse", "origin/main"]);
    const path = join(root, ".silvermoon", "i", id, "requirements", "Spec.md");
    await writeFile(
      path,
      "# Updated draft\n\nHuman-visible exact candidate.\n",
    );
    const current = selectIdea(await readProject(root), id);
    const signoff = event({
      type: "signOff",
      object: "requirements",
      revision: current.revisions.requirements,
      upstream: {},
    });
    const options = {
      expectedDigest: digest(current.eventSource),
      expectedPrimary: tip,
      localRemote: remote,
      refresh: false,
    };
    await expect(appendEvent(root, id, signoff, options)).rejects.toThrow(
      /Explicit human/,
    );
    await expect(
      appendEvent(root, id, signoff, {
        ...options,
        expectedPrimary: "0".repeat(40),
        confirmed: true,
      }),
    ).rejects.toThrow(/primary changed/);
    expect(
      await appendEvent(root, id, signoff, { ...options, confirmed: true }),
    ).toMatchObject({ idempotent: false });
    expect(
      await appendEvent(root, id, signoff, { ...options, confirmed: true }),
    ).toMatchObject({ idempotent: true });
    await expect(
      appendEvent(
        root,
        id,
        event({ type: "setAlias", alias: "different" }),
        options,
      ),
    ).rejects.toThrow(/digest changed/);
    let selected = selectIdea(await readProject(root), id);
    expect(reduce(selected, { primary: initial, head: tip }).level).toBe(
      "synchronization",
    );
    await sync(root);
    selected = selectIdea(await readProject(root), id);
    expect(
      reduce(selected, {
        primary: selected,
        head: await git(root, ["rev-parse", "HEAD"]),
      }).level,
    ).toBe("research");
    const replayed = (await replay(root, id)) as {
      cursor: string;
      events: unknown[];
    };
    expect(replayed.events).toHaveLength(2);
    expect(await replay(root, id, replayed.cursor)).toMatchObject({
      events: [],
    });
    expect(await replay(root, id, `0:${digest("")}`)).toMatchObject({
      events: replayed.events,
    });
    await expect(replay(root, id, "bad")).rejects.toThrow(/Malformed/);
    await expect(replay(root, id, `3:${digest("wrong")}`)).rejects.toThrow(
      /exact observed/,
    );
  });
  it("appends simplified confirmations without rewriting historical decision bytes", async () => {
    const { root, remote } = await repository();
    const initial = selectIdea(await readProject(root), id);
    const legacy = event({
      type: "signOff",
      object: "requirements",
      revision: initial.revisions.requirements,
      upstream: {},
      decision: "confirmed",
    });
    await materialize(root, add(initial.files, legacy));
    await sync(root);
    const path = join(root, ".silvermoon", "i", id, "events.jsonl");
    const before = await readFile(path);
    const current = selectIdea(await readProject(root), id);
    const signoff = event({
      type: "signOff",
      object: "research",
      revision: current.revisions.research,
      upstream: { requirements: current.revisions.requirements },
    });
    const options = {
      expectedDigest: digest(before),
      expectedPrimary: await git(root, ["rev-parse", "origin/main"]),
      localRemote: remote,
      refresh: false,
      confirmed: true,
    };
    await expect(
      appendEvent(root, id, { ...signoff, decision: "confirmed" }, options),
    ).rejects.toThrow(/omit.*decision/);
    expect(await readFile(path)).toEqual(before);
    await appendEvent(root, id, signoff, options);
    const after = await readFile(path);
    expect(after.subarray(0, before.length)).toEqual(before);
    expect(before.toString("utf8")).toContain('"decision":"confirmed"');
    expect(after.subarray(before.length).toString("utf8")).toBe(
      canonical(signoff) + "\n",
    );
    expect(
      selectIdea(await readProject(root), id).events.at(-1),
    ).not.toHaveProperty("decision");
  });
  it("serializes concurrent writers, rejects unrelated edits, and records aliases/language and abandonment as explicit facts", async () => {
    const { root, remote } = await repository();
    const current = selectIdea(await readProject(root), id);
    const options = {
      expectedDigest: digest(current.eventSource),
      expectedPrimary: await git(root, ["rev-parse", "origin/main"]),
      localRemote: remote,
      refresh: false,
    };
    const outcomes = await Promise.allSettled([
      appendEvent(root, id, event({ type: "setAlias", alias: "one" }), options),
      appendEvent(root, id, event({ type: "setAlias", alias: "two" }), options),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    let selected = selectIdea(await readProject(root), id);
    const alias = reduce(selected, { head: options.expectedPrimary }).alias!;
    expect(selectIdea(await readProject(root), alias).bootstrap.id).toBe(id);
    const append = async (value: Event) => {
      const result = await appendEvent(root, alias, value, {
        ...options,
        expectedDigest: digest(selected.eventSource),
      });
      selected = selectIdea(await readProject(root), id);
      return result;
    };
    await append(event({ type: "setLanguage", language: "fr-FR" }));
    await append(event({ type: "abandon", reason: "Explicit stop" }));
    await expect(
      append(event({ type: "setAlias", alias: null })),
    ).rejects.toThrow(/Resume/);
    await append(event({ type: "resume" }));
    expect(reduce(selected, { head: options.expectedPrimary })).toMatchObject({
      contentLanguage: "fr-FR",
      level: "requirements",
    });
    await writeFile(join(root, "source.txt"), "Unrelated dirty source");
    await expect(
      append(event({ type: "setAlias", alias: null })),
    ).rejects.toThrow(/unrelated/);
  });
});
