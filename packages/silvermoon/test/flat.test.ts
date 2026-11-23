import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CID } from "multiformats/cid";
import {
  checkpoints,
  directoryTree,
  eventSchema,
  eventSchemaBytes,
  eventSchemaCid,
  flatHistory,
  flatIdea,
  gitObject,
  jcs,
  parseFlatEvents,
  reduceFlat,
  acceptanceModes,
  type FlatEvent,
} from "../src/flat.js";
import { projectConfig } from "../src/domain.js";
import { verifyIdeaHistory } from "../src/repository.js";
import { date, id, files, legacyIdea } from "./fixtures.js";
import { idea } from "../src/domain.js";
import { flatAdd, flatFiles, flatSigned } from "./flat-fixtures.js";

const created: FlatEvent = {
  at: date,
  type: "created",
  idea: id,
  eventSchemaCid,
};
const rows = (...events: FlatEvent[]) => events.map(jcs).join("\n") + "\n";

describe("immutable created-first event data contract", () => {
  it("matches RFC 8785 serialization/sorting vectors and rejects non-I-JSON values", () => {
    expect(
      jcs({
        numbers: [Number("333333333.33333329"), 1e30, 4.5, 2e-3, 1e-27],
        literals: [null, true, false],
        string: '€$\u000f\nA\'B"\\\\"/',
      }),
    ).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
    expect(
      jcs({
        "\u20ac": 5,
        "\r": 1,
        "\ufb33": 7,
        "1": 2,
        "😀": 6,
        "\u0080": 3,
        ö: 4,
      }),
    ).toBe('{"\\r":1,"1":2,"":3,"ö":4,"€":5,"😀":6,"דּ":7}');
    expect(jcs({ a: [{ z: -0, a: 1e-7 }] })).toBe('{"a":[{"a":1e-7,"z":0}]}');
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      "\ud800",
      "\udc00",
      undefined,
      Symbol(),
      () => 1,
    ])
      expect(() => jcs(value)).toThrow();
  });
  it("binds the exact self-contained offline Schema to raw SHA-256 CIDv1, not execution identity", () => {
    const cid = CID.parse(eventSchemaCid);
    expect(cid.version).toBe(1);
    expect(cid.code).toBe(0x55);
    expect(cid.multihash.code).toBe(0x12);
    expect(Buffer.from(cid.multihash.digest)).toEqual(
      createHash("sha256").update(eventSchemaBytes()).digest(),
    );
    expect(Buffer.from(eventSchemaBytes()).toString()).toBe(jcs(eventSchema));
    const changedBytes = eventSchemaBytes();
    changedBytes[0] = 0;
    expect(Buffer.from(eventSchemaBytes()).toString()).toBe(jcs(eventSchema));
    expect(Object.isFrozen(eventSchema)).toBe(true);
    expect(parseFlatEvents(rows(created), id)).toEqual([created]);
    expect(() =>
      parseFlatEvents(rows({ ...created, eventSchemaCid: "unknown" }), id),
    ).toThrow(/untrusted/);
    expect(() =>
      parseFlatEvents(rows({ ...created, idea: "wrong" }), id),
    ).toThrow(/identity/);
    expect(() =>
      parseFlatEvents(rows({ ...created, at: "2026-11-18T16:09:22.408Z" }), id),
    ).toThrow(/minute/);
    expect(() =>
      parseFlatEvents(rows({ ...created, at: "bad" }), id),
    ).toThrow();
    expect(() =>
      parseFlatEvents(rows({ ...created, language: "zh-cn" }), id),
    ).toThrow(/canonical/);
    expect(() => parseFlatEvents(rows(created, created), id)).toThrow(/unique/);
    const extra = { ...created, checkCid: "forbidden" };
    expect(() => parseFlatEvents(jcs(extra) + "\n", id)).toThrow(/Schema/);
    expect(() =>
      parseFlatEvents(
        rows(created).replace('"at"', '"at":"duplicate","at"'),
        id,
      ),
    ).toThrow(/canonical/);
    for (const source of [
      rows(created).trimEnd(),
      rows(created).replaceAll("\n", "\r\n"),
      rows(created) + "\n",
    ])
      expect(() => parseFlatEvents(source, id)).toThrow();
    expect(() => parseFlatEvents(rows(created).repeat(4097), id)).toThrow(
      /4096/,
    );
    expect(() => parseFlatEvents(" ".repeat(1024 * 1024 + 1), id)).toThrow(
      /bounded/,
    );
    const bom = flatFiles();
    bom.set(
      "events.jsonl",
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        bom.get("events.jsonl")!,
      ]),
    );
    expect(() => flatIdea(bom, id)).toThrow(/BOM/);
    bom.set("events.jsonl", Uint8Array.of(0xff));
    expect(() => flatIdea(bom, id)).toThrow();
  });
  it("preserves identity and raw event prefixes without imposing report truth or templates", () => {
    const before = flatIdea(flatFiles(), id);
    const source = flatAdd(before.files, {
      at: date,
      type: "setAlias",
      alias: "example",
    });
    source.set(
      "deployment/report.jsonl",
      Buffer.from("not a test report or JSON\n"),
    );
    source.delete("implementation/Spec.md");
    source.set(
      "implementation/Submission.md",
      Buffer.from("No machine declaration required\n"),
    );
    const current = flatIdea(source, id);
    expect(() => {
      verifyIdeaHistory(current, before);
    }).not.toThrow();
    expect(current.revisions.deployment).not.toBe(before.revisions.deployment);
    const rewritten = new Map(source);
    rewritten.set("events.jsonl", Buffer.from(rows(created)));
    expect(() => {
      verifyIdeaHistory(flatIdea(rewritten, id), current);
    }).toThrow(/prefix/);
    expect(() => {
      verifyIdeaHistory(undefined, before);
    }).toThrow(/identity/);
    const changedIdentity = flatIdea(
      flatAdd(flatFiles(), {
        at: date,
        type: "setLanguage",
        language: "fr-FR",
      }),
      id,
    );
    expect(() => {
      verifyIdeaHistory(
        {
          ...changedIdentity,
          bootstrap: { ...changedIdentity.bootstrap, eventSchemaCid: "other" },
        },
        before,
      );
    }).toThrow(/identity/);
    expect(() => legacyIdea(current)).toThrow(/historical/);
    expect(legacyIdea(idea(files(), id)).bootstrap.checkCid).toBeDefined();
    const unsafe = flatFiles();
    unsafe.set("../outside", Buffer.from("x"));
    expect(() => flatIdea(unsafe, id)).toThrow(/layout|Flat Ideas/);
    const missing = flatFiles();
    missing.delete("events.jsonl");
    expect(() => flatIdea(missing, id)).toThrow(/Missing/);
    missing.set("events.jsonl", Buffer.from(rows(created)));
    missing.delete("requirements/Spec.md");
    expect(() => flatIdea(missing, id)).toThrow(/folder/);
  });
});

describe("direct real Git directory tree identities", () => {
  it("hashes Git objects with raw binary IDs, Git ordering and executable modes in both formats", () => {
    expect(gitObject("blob", Buffer.from("hello\n"), "sha1")).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a",
    );
    expect(directoryTree(new Map())).toBe(
      "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    );
    const source = new Map([
      ["a/x", Buffer.from("nested")],
      ["a.c", Buffer.from("file")],
      ["a0", Buffer.from("last")],
    ]);
    const modes = new Map([["a/x", "100755" as const]]);
    const revision = directoryTree(source, modes);
    expect(revision).toHaveLength(40);
    expect(directoryTree(source, modes, "sha256")).toHaveLength(64);
    expect(directoryTree(source)).not.toBe(revision);
    expect(directoryTree(new Map([...source].reverse()), modes)).toBe(revision);
    expect(() =>
      directoryTree(new Map([["../outside", Buffer.from("x")]])),
    ).toThrow(/Unsafe/);
    const current = flatIdea(flatFiles(), id);
    expect(current.revisions.requirements).toBe(
      directoryTree(new Map([["Spec.md", Buffer.from("# requirements\n")]])),
    );
    const changed = new Map(current.files);
    changed.set("requirements/extra.md", Buffer.from("changes only root"));
    const next = flatIdea(changed, id);
    expect(next.revisions.requirements).not.toBe(
      current.revisions.requirements,
    );
    expect(next.revisions["research-scope"]).toBe(
      current.revisions["research-scope"],
    );
  });
});

describe("ordered submit/accept tuple lifecycle", () => {
  it("advances all seven checkpoints by matching tuple, authority and primary synchronization only", () => {
    let source = flatFiles();
    for (const [index, object] of checkpoints.entries()) {
      let current = flatIdea(source, id);
      expect(reduceFlat(current, { primary: current })).toMatchObject({
        level: object,
        step: "submit",
      });
      const tuple = {
        at: date,
        object,
        revision: current.revisions[object],
        upstream: index ? current.revisions[checkpoints[index - 1]!] : null,
      };
      source = flatAdd(source, { ...tuple, type: "submit" });
      current = flatIdea(source, id);
      expect(reduceFlat(current, { primary: current })).toMatchObject({
        level: object,
        step: "accept",
      });
      source = flatAdd(source, { ...tuple, type: "accept", authority: "user" });
      current = flatIdea(source, id);
      expect(reduceFlat(current).level).toBe("requirements");
      const past = flatIdea(
        flatAdd(new Map(source), { at: date, type: "setAlias", alias: null }),
        id,
      );
      expect(
        reduceFlat(current, {
          primary: {
            ...past,
            revisions: { ...past.revisions, [object]: "0".repeat(40) },
          },
        }),
      ).toMatchObject({ level: object, step: "synchronization" });
      // No source, tests, CI, reports or commit declarations are needed to pass Check.
    }
    const current = flatIdea(source, id);
    expect(reduceFlat(current, { primary: current }).level).toBe("completed");
  });
  it("keeps identical tuple resubmission idempotent, but never reuses acceptance in a different upstream context", () => {
    const current = flatIdea(flatSigned(), id);
    const submit = current.events.findLast(
      (event) => event.type === "submit" && event.object === "requirements",
    )!;
    expect(
      reduceFlat(flatIdea(flatAdd(current.files, submit), id), {
        primary: current,
      }).level,
    ).toBe("completed");
    const changed = new Map(current.files);
    changed.set("requirements/Spec.md", Buffer.from("new requirements"));
    let next = flatIdea(changed, id);
    expect(reduceFlat(next, { primary: next })).toMatchObject({
      level: "requirements",
      step: "submit",
    });
    const tuple = {
      at: date,
      object: "requirements" as const,
      revision: next.revisions.requirements,
      upstream: null,
    };
    let source = flatAdd(changed, { ...tuple, type: "submit" });
    source = flatAdd(source, { ...tuple, type: "accept", authority: "user" });
    next = flatIdea(source, id);
    expect(reduceFlat(next, { primary: next })).toMatchObject({
      level: "research-scope",
      step: "submit",
    });
    const scope = {
      at: date,
      object: "research-scope" as const,
      revision: next.revisions["research-scope"],
      upstream: next.revisions.requirements,
    };
    source = flatAdd(source, { ...scope, type: "submit" });
    next = flatIdea(source, id);
    expect(reduceFlat(next, { primary: next })).toMatchObject({
      level: "research-scope",
      step: "accept",
    });
    const old = current.events.findLast(
      (event) => event.type === "accept" && event.object === "research-scope",
    )!;
    expect(() => flatIdea(flatAdd(source, old), id)).toThrow(
      /predecessor|tuple/,
    );
    source = flatAdd(source, { ...scope, type: "accept", authority: "user" });
    next = flatIdea(source, id);
    expect(reduceFlat(next, { primary: next })).toMatchObject({
      level: "technical-spec",
      step: "submit",
    });
  });
  it("validates history order and abandoned/resumed facts, not timestamp order", () => {
    const current = flatIdea(flatFiles(), id);
    const tuple = {
      at: date,
      object: "requirements" as const,
      revision: current.revisions.requirements,
      upstream: null,
    };
    expect(() =>
      flatHistory([created, { ...tuple, type: "accept", authority: "user" }]),
    ).toThrow(/submission/);
    expect(() =>
      flatHistory([
        created,
        { ...tuple, type: "submit", upstream: "a".repeat(40) },
      ]),
    ).toThrow(/root/);
    expect(() =>
      flatHistory([
        created,
        { ...tuple, type: "submit", object: "research-scope" },
      ]),
    ).toThrow(/predecessor/);
    let source = flatAdd(current.files, {
      at: date,
      type: "abandon",
      reason: "stop",
    });
    expect(reduceFlat(flatIdea(source, id)).level).toBe("abandoned");
    expect(() => flatAdd(source, { at: date, type: "resume" })).not.toThrow();
    expect(() =>
      flatIdea(
        flatAdd(source, { at: date, type: "abandon", reason: "again" }),
        id,
      ),
    ).toThrow(/already/);
    expect(() =>
      flatIdea(
        flatAdd(source, { at: date, type: "setAlias", alias: null }),
        id,
      ),
    ).toThrow(/Resume/);
    expect(() =>
      flatIdea(flatAdd(current.files, { at: date, type: "resume" }), id),
    ).toThrow(/abandonment/);
    source = flatAdd(source, { at: date, type: "resume" });
    source = flatAdd(source, {
      at: "2026-11-16T00:00:00.000Z",
      type: "setAlias",
      alias: "example",
    });
    source = flatAdd(source, {
      at: date,
      type: "setLanguage",
      language: "fr-FR",
    });
    expect(reduceFlat(flatIdea(source, id))).toMatchObject({
      alias: "example",
      contentLanguage: "fr-FR",
      level: "requirements",
    });
    source = flatAdd(source, { at: date, type: "setLanguage", language: null });
    expect(
      reduceFlat(flatIdea(source, id), {
        projectLanguage: "zh-CN",
        userLanguage: "de-DE",
      }).contentLanguage,
    ).toBe("zh-CN");
    expect(
      reduceFlat(flatIdea(source, id), { userLanguage: "de-DE" })
        .contentLanguage,
    ).toBe("de-DE");
  });
  it("strictly applies default/configured acceptance modes, with natural invalidation after tightening", () => {
    expect(acceptanceModes()["test-spec"]).toBe("delegated");
    const config =
      "version: 2\nprimaryRepository: example/project\nprimaryBranch: main\n";
    expect(
      projectConfig(config + "checkpointAcceptance:\n  test-scope: delegated\n")
        .checkpointAcceptance,
    ).toEqual({ "test-scope": "delegated" });
    for (const policy of [
      "  unknown: delegated\n",
      "  global: delegated\n",
      "  implementation: waived\n",
    ])
      expect(() =>
        projectConfig(config + "checkpointAcceptance:\n" + policy),
      ).toThrow(/config/);
    const source = flatSigned();
    const events = flatIdea(source, id).events.map((event): FlatEvent =>
      event.type === "accept" &&
      ["test-spec", "implementation"].includes(event.object)
        ? { ...event, authority: "delegate" }
        : event,
    );
    source.set("events.jsonl", Buffer.from(rows(...events)));
    const current = flatIdea(source, id);
    expect(reduceFlat(current, { primary: current }).level).toBe("completed");
    expect(
      reduceFlat(current, {
        primary: current,
        policy: { "test-spec": "consensus" },
      }),
    ).toMatchObject({ level: "test-spec", step: "accept" });
    expect(
      reduceFlat(current, {
        primary: current,
        policy: { implementation: "consensus" },
      }),
    ).toMatchObject({ level: "implementation", step: "accept" });
    const user = events.findLast(
      (event) => event.type === "accept" && event.object === "test-spec",
    )!;
    expect(user.type).toBe("accept");
    const repaired = flatIdea(
      flatAdd(source, {
        ...user,
        type: "accept",
        object: "test-spec",
        revision: current.revisions["test-spec"],
        upstream: current.revisions["test-scope"],
        authority: "user",
      }),
      id,
    );
    expect(
      reduceFlat(repaired, {
        primary: repaired,
        policy: { "test-spec": "consensus" },
      }).level,
    ).toBe("completed");
  });
});
