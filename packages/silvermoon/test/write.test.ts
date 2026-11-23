import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendEvent, createIdea, replay } from "../src/write.js";
import * as repository from "../src/repository.js";
import { canonical, digest, reduce, type Event } from "../src/domain.js";
import {
  add,
  cid,
  date,
  event,
  head,
  id,
  materialize,
  scratch,
} from "./fixtures.js";
import { configText, localSnapshot, primarySnapshot } from "./snapshots.js";

const command = vi.hoisted(() =>
  vi.fn<
    (
      file: string,
      args: string[],
      options: { cwd: string },
    ) => Promise<{ stdout: string; stderr: string }>
  >(),
);
vi.mock("node:child_process", () => ({
  execFile: Object.assign(() => undefined, {
    [Symbol.for("nodejs.util.promisify.custom")]: command,
  }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  command.mockReset();
});

async function fixture(populated = true) {
  const root = await scratch();
  await mkdir(join(root, ".silvermoon"));
  await writeFile(join(root, ".silvermoon", "config.yaml"), configText);
  if (populated) await materialize(root);
  command.mockImplementation((_file, args, options) =>
    Promise.resolve({
      stdout: args.includes("--show-toplevel")
        ? options.cwd
        : args.at(-1) === "HEAD"
          ? head
          : "",
      stderr: "",
    }),
  );
  const committed = await repository.readProject(root);
  const observed = primarySnapshot(committed);
  vi.spyOn(repository, "primary").mockImplementation(() =>
    Promise.resolve(observed),
  );
  vi.spyOn(repository, "localContext").mockResolvedValue(
    localSnapshot(committed),
  );
  const current = () =>
    repository
      .readProject(root)
      .then((value) => repository.selectIdea(value, id));
  return { root, observed, current };
}

describe("transactions with controlled primary observations", () => {
  it("creates a scaffold with fixed CID, language and bounded collision retries without overwriting", async () => {
    const { root } = await fixture(false);
    const options = {
      refresh: false,
      language: "ja-JP",
      now: () => new Date(date),
      random: () => Uint8Array.of(0x7a, 0x2f),
    };
    const created = await createIdea(root, cid, options);
    expect(created.id).toBe(id);
    const current = repository.selectIdea(
      await repository.readProject(root),
      id,
    );
    expect(reduce(current, { head }).contentLanguage).toBe("ja-JP");
    expect(
      await repository.absent(join(root, ".silvermoon", ".new.lock")),
    ).toBe(true);
    expect(await repository.absent(join(created.path, "ledger.md"))).toBe(true);
    const before = await readFile(join(created.path, "events.jsonl"));
    await expect(createIdea(root, cid, options)).rejects.toThrow(/retry limit/);
    expect(await readFile(join(created.path, "events.jsonl"))).toEqual(before);
    let calls = 0;
    expect(
      (
        await createIdea(root, cid, {
          ...options,
          random: () =>
            calls++ === 0 ? Uint8Array.of(0x7a, 0x2f) : Uint8Array.of(0, 1),
        })
      ).id,
    ).toBe("2026111716090001");
    await expect(createIdea(root, cid, { language: "zh-cn" })).rejects.toThrow(
      /canonical/,
    );
  });

  it("blocks dirty/unsynchronized projects, held locks, invalid CID and cancellation while cleaning owned output", async () => {
    const { root, observed } = await fixture(false);
    observed.changes = ["unrelated.txt"];
    await writeFile(join(root, "unrelated.txt"), "Preserve");
    await expect(createIdea(root, cid)).rejects.toThrow(/clean/);
    expect(await readFile(join(root, "unrelated.txt"), "utf8")).toBe(
      "Preserve",
    );
    observed.changes = [];
    observed.tip = "b".repeat(40);
    await expect(createIdea(root, cid)).rejects.toThrow(/synchronized/);
    observed.tip = head;
    await expect(createIdea(root, "bad-cid")).rejects.toThrow();
    expect((await repository.readProject(root)).ideas.size).toBe(0);
    const lock = join(root, ".silvermoon", ".new.lock");
    await writeFile(lock, "another owner");
    await expect(createIdea(root, cid)).rejects.toThrow(/exclusive/);
    expect(await readFile(lock, "utf8")).toBe("another owner");
    await rm(lock);
    await expect(
      createIdea(root, cid, {
        signal: AbortSignal.abort(new Error("cancelled")),
      }),
    ).rejects.toThrow(/cancelled/);
    expect(await repository.absent(lock)).toBe(true);
  });

  it("rejects concurrent creation edits and removes only its own partial scaffold", async () => {
    const { root } = await fixture(false);
    const original = repository.readProject;
    let calls = 0;
    vi.spyOn(repository, "readProject").mockImplementation(async (...args) => {
      const result = await original(...args);
      if (++calls === 2)
        return {
          ...result,
          files: new Map([...result.files, ["other", Buffer.from("changed")]]),
        };
      return result;
    });
    await expect(
      createIdea(root, cid, {
        now: () => new Date(date),
        random: () => Uint8Array.of(0x7a, 0x2f),
      }),
    ).rejects.toThrow(/changed during creation/);
    expect(await repository.absent(join(root, ".silvermoon", "i", id))).toBe(
      true,
    );
    expect(
      await repository.absent(join(root, ".silvermoon", ".new.lock")),
    ).toBe(true);
  });

  it("requires human confirmation, compares primary/digest and permits only exact idempotent retries", async () => {
    const { root, current } = await fixture();
    const original = await current();
    const request = event({
      type: "signOff",
      object: "requirements",
      revision: original.revisions.requirements,
      upstream: {},
    });
    const options = {
      expectedDigest: digest(original.eventSource),
      expectedPrimary: head,
      refresh: false,
    };
    await expect(appendEvent(root, id, request, options)).rejects.toThrow(
      /Explicit human/,
    );
    await expect(
      appendEvent(root, id, request, {
        ...options,
        expectedPrimary: "0".repeat(40),
        confirmed: true,
      }),
    ).rejects.toThrow(/primary changed/);
    expect(
      await appendEvent(root, id, request, { ...options, confirmed: true }),
    ).toMatchObject({ idempotent: false });
    expect(
      await appendEvent(root, id, request, { ...options, confirmed: true }),
    ).toMatchObject({ idempotent: true });
    await expect(
      appendEvent(
        root,
        id,
        event({ type: "setAlias", alias: "different" }),
        options,
      ),
    ).rejects.toThrow(/digest changed/);
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

  it("preserves historical decision bytes while appending simplified confirmation", async () => {
    const { root, current, observed } = await fixture();
    const initial = await current();
    await materialize(
      root,
      add(
        initial.files,
        event({
          type: "signOff",
          object: "requirements",
          revision: initial.revisions.requirements,
          upstream: {},
          decision: "confirmed",
        }),
      ),
    );
    observed.project = await repository.readProject(root);
    const before = (await current()).eventSource;
    const request = event({
      type: "signOff",
      object: "research",
      revision: initial.revisions.research,
      upstream: { requirements: initial.revisions.requirements },
    });
    const options = {
      expectedDigest: digest(before),
      expectedPrimary: head,
      confirmed: true,
    };
    await expect(
      appendEvent(root, id, { ...request, decision: "confirmed" }, options),
    ).rejects.toThrow(/omit.*decision/);
    await appendEvent(root, id, request, options);
    const after = (await current()).eventSource;
    expect(after).toBe(before + canonical(request) + "\n");
    expect(before).toContain('"decision":"confirmed"');
  });

  it("serializes writers and records alias/language/abandonment without permitting unrelated writes", async () => {
    const { root, current, observed } = await fixture();
    let selected = await current();
    const options = {
      expectedDigest: digest(selected.eventSource),
      expectedPrimary: head,
    };
    const outcomes = await Promise.allSettled([
      appendEvent(root, id, event({ type: "setAlias", alias: "one" }), options),
      appendEvent(root, id, event({ type: "setAlias", alias: "two" }), options),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    selected = await current();
    const append = async (value: Event) => {
      const result = await appendEvent(root, id, value, {
        ...options,
        expectedDigest: digest(selected.eventSource),
      });
      selected = await current();
      return result;
    };
    await append(event({ type: "setLanguage", language: "fr-FR" }));
    await append(event({ type: "abandon", reason: "stop" }));
    await expect(
      append(event({ type: "setAlias", alias: null })),
    ).rejects.toThrow(/Resume/);
    await append(event({ type: "resume" }));
    expect(reduce(selected, { head })).toMatchObject({
      contentLanguage: "fr-FR",
      level: "requirements",
    });
    observed.changes = ["source.txt"];
    await expect(
      append(event({ type: "setAlias", alias: null })),
    ).rejects.toThrow(/unrelated/);
  });

  it.each(["events", "candidate", "head"] as const)(
    "rejects %s changes during compare-and-append and removes temporary output",
    async (kind) => {
      const { root, current } = await fixture();
      const selected = await current();
      const options = {
        expectedDigest: digest(selected.eventSource),
        expectedPrimary: head,
      };
      if (kind === "events") {
        const original = repository.readRegular;
        vi.spyOn(repository, "readRegular").mockImplementation(
          async (path, signal) =>
            path.endsWith("events.jsonl")
              ? Buffer.from("concurrent")
              : original(path, signal),
        );
      } else if (kind === "candidate") {
        const original = repository.readProject;
        let calls = 0;
        vi.spyOn(repository, "readProject").mockImplementation(
          async (...args) => {
            const result = await original(...args);
            return ++calls === 2
              ? {
                  ...result,
                  files: new Map([
                    ...result.files,
                    ["other", Buffer.from("edit")],
                  ]),
                }
              : result;
          },
        );
      } else vi.spyOn(repository, "git").mockResolvedValue("b".repeat(40));
      await expect(
        appendEvent(
          root,
          id,
          event({ type: "setAlias", alias: "new" }),
          options,
        ),
      ).rejects.toThrow(/changed/);
      expect((await current()).eventSource).toBe(selected.eventSource);
      expect(
        await repository.absent(join(root, ".silvermoon", ".new.lock")),
      ).toBe(true);
    },
  );
});
