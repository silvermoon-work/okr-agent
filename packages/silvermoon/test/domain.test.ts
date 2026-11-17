import { describe, expect, it } from "vitest";
import {
  canonical,
  caseIndex,
  digest,
  gates,
  idea,
  language,
  newIdeaId,
  parseBootstrap,
  parseEvents,
  projectConfig,
  reduce,
  revisions,
  safeRelative,
  text,
  userLanguage,
  validBatch,
  validIdeaId,
  validateAppend,
  vectorAt,
} from "../src/domain.js";
import {
  add,
  batch,
  cid,
  date,
  event,
  files,
  head,
  id,
  sign,
  signed,
} from "./fixtures.js";

describe("IDs, config and bounded domain inputs", () => {
  it("uses UTC minute, lowercase cryptographic-width suffix and rejects invalid calendar normalization", () => {
    expect(
      newIdeaId(new Date("2026-11-18T00:09:22.408+08:00"), () =>
        Uint8Array.of(0, 31),
      ),
    ).toBe("202611171609001f");
    expect(validIdeaId(newIdeaId())).toBe(true);
    for (const value of [
      "202602300001abcd",
      "202613010001abcd",
      "202611172401abcd",
      "000001010000abcd",
      "202611171609ABCD",
      "202611171609abcd0",
      "01M7N22GE5C3836XJ4K87X4X95",
    ])
      expect(validIdeaId(value)).toBe(false);
    expect(validIdeaId("202402290000ffff")).toBe(true);
    expect(() => newIdeaId(new Date(), () => new Uint8Array(1))).toThrow(
      /two bytes/,
    );
    expect(() => newIdeaId(new Date("0000-01-01T00:00:00Z"))).toThrow(
      /calendar/,
    );
  });
  it("retains config v2 fields without accepting credentials, unknown fields or invalid languages", () => {
    expect(
      projectConfig(
        "version: 2\nprimaryRepository: example/project\nprimaryBranch: main\npreferredLanguage: zh-CN",
      ).preferredLanguage,
    ).toBe("zh-CN");
    for (const input of [
      "version: 3",
      "version: 2\nversion: 2",
      "[]",
      "version: 2\nprimaryRepository: https://secret@github.com/a/b\nprimaryBranch: main",
      "version: 2\nprimaryRepository: a/b.git\nprimaryBranch: main",
      "version: 2\nprimaryRepository: a/b\nprimaryBranch: -bad",
      "version: 2\nprimaryRepository: a/b\nprimaryBranch: main\nunknown: 1",
    ])
      expect(() => projectConfig(input)).toThrow();
    expect(userLanguage()).toBeUndefined();
    expect(userLanguage("preferredLanguage: ja-JP")).toBe("ja-JP");
    expect(userLanguage("version: 1\npreferredLanguage: zh-CN")).toBe("zh-CN");
    expect(userLanguage("version: 1")).toBeUndefined();
    for (const version of ["0", "2", '"1"', "null"])
      expect(() =>
        userLanguage(`version: ${version}\npreferredLanguage: en-US`),
      ).toThrow(/user config/);
    expect(userLanguage("{}")).toBeUndefined();
    expect(() => userLanguage("language: fr")).toThrow();
    expect(() => userLanguage("preferredLanguage: zh-cn")).toThrow();
    expect(language("en-US")).toBe("en-US");
    expect(() => language("not a locale")).toThrow();
  });
  it("protects portable relative paths and rejects corrupt UTF-8/JSON/layout", () => {
    for (const path of [
      "../x",
      "/x",
      "a\\b",
      "a:b",
      "a/.",
      "a/..",
      "a/NUL.txt",
      "a/end.",
      "a/end ",
      "a/\u0000",
      "a".repeat(512),
    ])
      expect(safeRelative(path)).toBe(false);
    expect(safeRelative("evidence/implementation/run.txt")).toBe(true);
    expect(() => text(Uint8Array.of(255))).toThrow();
    expect(() => canonical(undefined)).toThrow();
    expect(canonical({ b: [2, null], a: true })).toBe(
      '{"a":true,"b":[2,null]}',
    );
    expect(() => parseBootstrap("{}", id)).toThrow();
    expect(() =>
      parseBootstrap(
        canonical({ version: 1, id, checkCid: "bad", createdAt: date }),
        id,
      ),
    ).toThrow();
    expect(() =>
      parseBootstrap(
        canonical({ version: 1, id, checkCid: cid, createdAt: "yesterday" }),
        id,
      ),
    ).toThrow();
    const source = files();
    source.set("ledger.md", Buffer.from("Old"));
    expect(() => idea(source, id)).toThrow(/Unknown path/);
    source.delete("ledger.md");
    source.delete("requirements/Spec.md");
    expect(() => revisions(source)).toThrow(/Missing/);
    source.set("requirements/Spec.md", Buffer.from(" "));
    expect(() => revisions(source)).toThrow(/Empty/);
  });
  it("validates case identities, both phases and subject ownership", () => {
    const source = files();
    for (const cases of [
      {},
      { version: 1, cases: [] },
      {
        version: 1,
        cases: [
          {
            id: "I",
            phase: "implementation",
            environment: "local",
            subject: "git-head",
          },
        ],
      },
      {
        version: 1,
        cases: [
          {
            id: "I",
            phase: "implementation",
            environment: "local",
            subject: "git-head",
          },
          {
            id: "I",
            phase: "deployment",
            environment: "staging",
            subject: "implementation",
          },
        ],
      },
      {
        version: 1,
        cases: [
          {
            id: "I",
            phase: "implementation",
            environment: "local",
            subject: "implementation",
          },
          {
            id: "D",
            phase: "deployment",
            environment: "staging",
            subject: "git-head",
          },
        ],
      },
    ]) {
      source.set("tests/cases.json", Buffer.from(canonical(cases)));
      expect(() => caseIndex(source)).toThrow();
    }
  });
});

describe("five exact signoffs and evidence", () => {
  it("keeps the two indexes independent while signing all supplementary content and exact upstream vectors", () => {
    let source = files();
    for (const gate of gates) {
      const current = idea(source, id);
      expect(reduce(current, { primary: current, head }).level).toBe(gate);
      source = sign(source, gate);
      const draft = idea(source, id);
      expect(reduce(draft, { primary: current, head }).level).toBe(
        "synchronization",
      );
    }
    const current = idea(source, id);
    expect(reduce(current, { primary: current, head }).level).toBe(
      "implementation",
    );
    for (const [path, gate] of [
      ["requirements/example.md", "requirements"],
      ["technical/research.md", "research"],
      ["technical/design.md", "technical"],
      ["tests/cases.json", "cases"],
      ["tests/case-details.md", "tests"],
    ] as const) {
      const changed = new Map(source);
      const original = text(changed.get(path)!);
      changed.set(
        path,
        Buffer.from(
          original + (path.endsWith(".json") ? " " : "\nSigned detail changed"),
        ),
      );
      const updated = idea(changed, id);
      expect(reduce(updated, { primary: updated, head }).level).toBe(gate);
    }
    const body = new Map(source);
    body.set("technical/design.md", Buffer.from("Refined design"));
    body.set("tests/case-details.md", Buffer.from("Refined test body"));
    expect(revisions(body).research).toBe(current.revisions.research);
    expect(revisions(body).cases).toBe(current.revisions.cases);
  });
  it("does not bypass missing upstream decisions or infer signoffs from claims", () => {
    const current = idea(files(), id);
    const invalid = event({
      type: "signOff",
      object: "technical",
      revision: current.revisions.technical,
      upstream: vectorAt(current.revisions, "technical"),
      decision: "confirmed",
    });
    expect(() => idea(add(current.files, invalid), id)).toThrow(/invent/);
    expect(() => {
      validateAppend(current, invalid, reduce(current, { head }), true);
    }).toThrow(/exact current/);
    const first = event({
      type: "signOff",
      object: "requirements",
      revision: current.revisions.requirements,
      upstream: {},
      decision: "confirmed",
    });
    expect(() => {
      validateAppend(current, first, reduce(current, { head }), false);
    }).toThrow(/Explicit human/);
    expect(() => {
      validateAppend(current, first, reduce(current, { head }), true);
    }).not.toThrow();
    const claim = event({ type: "verify", batch: batch(current) });
    expect(() => idea(add(current.files, claim), id)).toThrow(/five matching/);
    expect(() => {
      validateAppend(current, claim, reduce(current, { head }), false);
    }).toThrow(/signed/);
  });
  it("requires nonempty, exact-case, subject/environment/revision/hash evidence and invalidates dependent deployment", () => {
    let source = signed();
    let current = idea(source, id);
    const initial = batch(current);
    expect(validBatch(initial, current, head)).toBe(true);
    for (const changed of [
      { ...initial, environment: "wrong" },
      { ...initial, subject: "b".repeat(40) },
      {
        ...initial,
        revisions: { ...initial.revisions, tests: digest("stale") },
      },
      { ...initial, results: [] },
      {
        ...initial,
        results: [{ ...initial.results[0]!, result: "fail" as const }],
      },
      { ...initial, results: [{ ...initial.results[0]!, case: "UNKNOWN" }] },
      {
        ...initial,
        results: [
          {
            ...initial.results[0]!,
            evidence: [
              {
                path: "evidence/implementation/missing.txt",
                digest: digest(""),
              },
            ],
          },
        ],
      },
      {
        ...initial,
        results: [
          {
            ...initial.results[0]!,
            evidence: [
              {
                path: "evidence/implementation/run.txt",
                digest: digest("wrong"),
              },
            ],
          },
        ],
      },
    ])
      expect(validBatch(changed, current, head)).toBe(false);
    const empty = new Map(source);
    empty.set("evidence/implementation/run.txt", new Uint8Array());
    expect(validBatch(initial, idea(empty, id), head)).toBe(false);
    source = add(source, event({ type: "verify", batch: initial }));
    current = idea(source, id);
    let state = reduce(current, { primary: current, head });
    expect(state.level).toBe("deployment");
    const deployed = batch(current, "deployment", state.implementation);
    source = add(source, event({ type: "verify", batch: deployed }));
    current = idea(source, id);
    state = reduce(current, { primary: current, head });
    expect(state.level).toBe("completed");
    const replacement = batch(current);
    source = add(source, event({ type: "verify", batch: replacement }));
    current = idea(source, id);
    expect(reduce(current, { primary: current, head }).level).toBe(
      "deployment",
    );
    const failure = {
      ...replacement,
      id: "failed-retry",
      results: [{ ...replacement.results[0]!, result: "error" as const }],
    };
    expect(() => {
      validateAppend(
        current,
        event({ type: "verify", batch: failure }),
        reduce(current, { primary: current, head }),
        false,
      );
    }).not.toThrow();
    source = add(source, event({ type: "verify", batch: failure }));
    current = idea(source, id);
    expect(reduce(current, { primary: current, head }).level).toBe(
      "implementation",
    );
    expect(
      reduce(idea(signed(), id), {
        primary: idea(signed(), id),
        head: "b".repeat(40),
      }).level,
    ).toBe("synchronization");
  });
  it("covers every environment and permits only code-equivalent tested ancestors", () => {
    const source = files();
    const index = caseIndex(source);
    source.set(
      "tests/cases.json",
      Buffer.from(
        canonical({
          ...index,
          cases: [
            ...index.cases,
            {
              id: "I-02",
              phase: "implementation",
              environment: "linux",
              subject: "git-head",
            },
          ],
        }),
      ),
    );
    let current = idea(signed(source), id);
    const first = batch(current);
    current = idea(
      add(current.files, event({ type: "verify", batch: first })),
      id,
    );
    expect(reduce(current, { primary: current, head }).level).toBe(
      "implementation",
    );
    const second = {
      ...batch(current),
      environment: "linux",
      results: [{ ...first.results[0]!, case: "I-02" }],
    };
    current = idea(
      add(current.files, event({ type: "verify", batch: second })),
      id,
    );
    expect(reduce(current, { primary: current, head }).level).toBe(
      "deployment",
    );
    expect(
      reduce(current, { primary: current, head: "b".repeat(40) }).level,
    ).toBe("implementation");
    expect(
      reduce(current, {
        primary: current,
        head: "b".repeat(40),
        subjects: [head],
      }).level,
    ).toBe("deployment");
  });
  it("tracks explicit aliases/languages/abandon/resume without changing consensus or silently inferring decisions", () => {
    let current = idea(files(), id);
    expect(reduce(current, { head }).contentLanguage).toBe("en-US");
    expect(
      reduce(current, { head, userLanguage: "ja-JP" }).contentLanguage,
    ).toBe("ja-JP");
    expect(
      reduce(current, { head, userLanguage: "ja-JP", projectLanguage: "zh-CN" })
        .contentLanguage,
    ).toBe("zh-CN");
    for (const value of [
      event({ type: "setAlias", alias: "new-idea" }),
      event({ type: "setLanguage", language: "fr-FR" }),
      event({ type: "abandon", reason: "Explicit stop" }),
    ])
      current = idea(add(current.files, value), id);
    const abandoned = reduce(current, { head });
    expect(abandoned).toMatchObject({
      alias: "new-idea",
      contentLanguage: "fr-FR",
      level: "abandoned",
    });
    expect(() => {
      validateAppend(
        current,
        event({ type: "setAlias", alias: null }),
        abandoned,
        false,
      );
    }).toThrow(/Resume/);
    const resume = event({ type: "resume" });
    expect(() => {
      validateAppend(current, resume, abandoned, false);
    }).not.toThrow();
    current = idea(add(current.files, resume), id);
    expect(() => {
      validateAppend(
        current,
        event({ type: "resume" }),
        reduce(current, { head }),
        false,
      );
    }).toThrow(/Only an abandoned/);
    current = idea(
      add(current.files, event({ type: "setLanguage", language: null })),
      id,
    );
    current = idea(
      add(current.files, event({ type: "setAlias", alias: null })),
      id,
    );
    expect(reduce(current, { head, projectLanguage: "zh-CN" })).toMatchObject({
      contentLanguage: "zh-CN",
      alias: null,
      level: "requirements",
    });
  });
  it("rejects malformed, noncanonical, duplicate, reordered and unsupported event histories", () => {
    const current = idea(files(), id);
    const first = current.events[0]!;
    const firstLine = canonical(first);
    for (const source of [
      "",
      firstLine,
      firstLine + "\r\n",
      firstLine + "\n\n",
      JSON.stringify(first, null, 2) + "\n",
      "{}\n",
      canonical({ ...first, at: "yesterday" }) + "\n",
      firstLine + "\n" + firstLine + "\n",
      canonical({ ...first, idea: "different" }) + "\n",
      firstLine + "\n" + canonical(event({ type: "resume" })) + "\n",
      firstLine +
        "\n" +
        canonical(event({ type: "abandon", reason: "stop" })) +
        "\n" +
        canonical(event({ type: "setLanguage", language: "fr" })) +
        "\n",
      firstLine +
        "\n" +
        canonical(event({ type: "abandon", reason: "stop" })) +
        "\n" +
        canonical(event({ type: "abandon", reason: "again" })) +
        "\n",
      firstLine +
        "\n" +
        canonical({
          ...event({
            type: "signOff",
            object: "requirements",
            revision: current.revisions.requirements,
            upstream: {},
            decision: "confirmed",
          }),
          upstream: { tests: digest("extra") },
        }) +
        "\n",
    ])
      expect(() => parseEvents(source, current.bootstrap)).toThrow();
    expect(() => {
      validateAppend(current, first, reduce(current, { head }), false);
    }).toThrow(/created only once/);
    expect(() => {
      validateAppend(
        current,
        { ...event({ type: "setAlias", alias: null }), id: first.id },
        reduce(current, { head }),
        false,
      );
    }).toThrow(/already exists/);
    const complete = idea(signed(), id);
    const valid = event({ type: "verify", batch: batch(complete) });
    for (const changed of [
      {
        ...valid,
        batch: {
          ...valid.batch,
          results: [...valid.batch.results, valid.batch.results[0]!],
        },
      },
      {
        ...valid,
        batch: {
          ...valid.batch,
          results: [
            {
              ...valid.batch.results[0]!,
              evidence: [{ path: "../secret", digest: digest("x") }],
            },
          ],
        },
      },
      {
        ...valid,
        batch: { ...valid.batch, implementation: digest("not-allowed") },
      },
    ])
      expect(() => idea(add(complete.files, changed), id)).toThrow();
    expect(() =>
      idea(
        add(
          add(complete.files, valid),
          event({ type: "verify", batch: valid.batch }),
        ),
        id,
      ),
    ).toThrow(/unique/);
  });
});
