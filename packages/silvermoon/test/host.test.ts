import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CID } from "multiformats/cid";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import type * as TaskEngine from "@silvermoon-work/task-engine";
import {
  bundledArtifact,
  getReference,
  observe,
  readDocument,
  type Result,
} from "../src/host.js";
import { cid, head, id } from "./fixtures.js";
import { checkpointIds } from "../src/contract.js";
import {
  canonical,
  digest,
  gates,
  idea,
  reduce,
  validateAppend,
} from "../src/domain.js";
import { add } from "./fixtures.js";
import { files, pairedEvent, report } from "./paired-fixtures.js";
import { reportPath } from "../src/lifecycle.js";

const engine = vi.hoisted(() => ({
  start: vi.fn(),
  submit: vi.fn(),
  getRequestStatus: vi.fn(),
  waitForTaskRelease: vi.fn(),
  getTask: vi.fn(),
  cancelTask: vi.fn(),
  close: vi.fn(),
}));
const createEngine = vi.hoisted(() => vi.fn(() => engine));
vi.mock("@silvermoon-work/task-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof TaskEngine>()),
  createTaskEngine: createEngine,
}));
const target = {
  userHome: resolve(".test-work", "home"),
  repoRoot: resolve(".test-work", "repo"),
  idea: id,
};
let result: Result;
let documentation: string;
let reference: string;

beforeEach(async () => {
  vi.clearAllMocks();
  engine.start.mockResolvedValue(undefined);
  engine.submit.mockResolvedValue({
    status: "accepted",
    requestId: "request",
    taskId: "task",
  });
  engine.waitForTaskRelease.mockResolvedValue(undefined);
  engine.close.mockResolvedValue(undefined);
  const artifact = await bundledArtifact();
  const car = await readTaskBundleCar(
    new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
  );
  const store = IpfsStore.fromClient({ block: car.block });
  try {
    documentation = (
      await store.resolveContent(
        CID.parse(artifact.cid),
        "resources/references/check.md",
      )
    ).toString();
    reference = (
      await store.resolveContent(
        CID.parse(artifact.cid),
        "resources/references/checkpoints/requirements.md",
      )
    ).toString();
  } finally {
    await store.close();
    await car.close();
  }
  result = { pass: true, documentation, references: [] };
  engine.getTask.mockImplementation(() => ({
    stage: "completed",
    result: { data: result },
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("host orchestration with a controlled Engine, never worker execution", () => {
  it.each(["idea", "commit", "project", "setup"] as const)(
    "selects %s independently and submits only its explicit input",
    async (kind) => {
      const operation =
        kind === "idea"
          ? { mode: "lifecycle" as const, refresh: false }
          : kind === "commit"
            ? {
                mode: "snapshot" as const,
                snapshot: "staged",
                allowDelete: [id],
              }
            : { mode: kind, refresh: false };
      const selected =
        kind === "idea"
          ? target
          : kind === "setup"
            ? { userHome: target.userHome }
            : { userHome: target.userHome, repoRoot: target.repoRoot };
      const runtime = { entry: "controlled", path: "controlled" };
      const artifact = await bundledArtifact(kind);
      if (kind !== "idea") {
        const car = await readTaskBundleCar(
          new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
        );
        const store = IpfsStore.fromClient({ block: car.block });
        try {
          documentation = (
            await store.resolveContent(
              CID.parse(artifact.cid),
              "resources/references/check.md",
            )
          ).toString();
          result = { pass: true, documentation, references: [] };
        } finally {
          await store.close();
          await car.close();
        }
      }
      const report = await observe(selected, { operation, runtime });
      expect(report).toMatchObject({
        schema: "silvermoon/v2",
        checkCid: artifact.cid,
        result,
        documents: [{ cid: documentation }],
      });
      expect(engine.submit.mock.calls[0]?.[0]).toMatchObject({
        bundle: artifact.cid,
        parameters: { data: { runtime, target: report.target }, cidPaths: [] },
      });
      expect(engine.submit.mock.calls[0]?.[1]).toEqual({
        scope: "silvermoon",
        subject: "silvermoon",
      });
      expect(engine.cancelTask).toHaveBeenCalledWith("task", expect.anything());
      expect(engine.waitForTaskRelease).toHaveBeenCalledTimes(2);
      expect(engine.close).toHaveBeenCalledTimes(1);
    },
  );
  it("returns business gaps with deduplicated exact reference content", async () => {
    result = {
      pass: false,
      documentation,
      references: [
        { checkpoint: "requirements", documentation: reference },
        { checkpoint: "research", documentation: reference },
      ],
      problems: [
        {
          code: "requirements-consensus-confirmed",
          brief: "Review this candidate",
          checkpoint: "requirements",
        },
      ],
    };
    const report = await observe(target);
    expect(report.result).toEqual(result);
    expect(report.documents.map((value) => value.cid)).toEqual([
      documentation,
      reference,
    ]);
    expect(report.documents[1]!.text).toContain("## Description");
  });
  it("waits through preparation before accepting and releasing", async () => {
    engine.submit.mockResolvedValueOnce({
      status: "preparing",
      requestId: "request",
    });
    engine.getRequestStatus.mockResolvedValue({
      status: "accepted",
      requestId: "request",
      taskId: "task",
    });
    expect((await observe(target)).result.pass).toBe(true);
    expect(engine.getRequestStatus).toHaveBeenCalledWith(
      "request",
      { waitMs: 100 },
      expect.anything(),
    );
  });
  it.each([
    { stage: "failed", error: { code: "native", message: "execution fault" } },
    { stage: "completed", result: [] },
    { stage: "completed", result: { data: {} } },
    {
      stage: "completed",
      result: { data: { pass: false, documentation: cid, references: [] } },
    },
  ])(
    "rejects Engine faults or unsupported payloads and still closes",
    async (task) => {
      engine.getTask.mockReturnValueOnce(task);
      await expect(observe(target)).rejects.toThrow(
        /did not complete|payload|unsupported/,
      );
      expect(engine.close).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects nonaccepted requests and propagates submission faults", async () => {
    engine.submit.mockResolvedValueOnce({ status: "rejected" });
    await expect(observe(target)).rejects.toThrow(/rejected/);
    expect(engine.cancelTask).not.toHaveBeenCalled();
    engine.submit.mockRejectedValueOnce(new Error("submit fault"));
    await expect(observe(target)).rejects.toThrow(/submit fault/);
  });
  it("rejects untrusted, wrong-kind and mismatched CAR identities without default fallback", async () => {
    const artifact = await bundledArtifact();
    await expect(observe(target, { cid })).rejects.toThrow(/pinned Check CID/);
    await expect(observe(target, { artifacts: [] })).rejects.toThrow(
      /pinned Check CID/,
    );
    await expect(
      observe(target, { artifacts: [{ ...artifact, kind: "commit" }] }),
    ).rejects.toThrow(/different task/);
    await expect(
      observe(target, { cid, artifacts: [{ cid, path: artifact.path }] }),
    ).rejects.toThrow(/CAR root/);
    expect(createEngine).not.toHaveBeenCalled();
  });
  it.each([
    { target, operation: { mode: "unknown" } },
    { target: { userHome: target.userHome }, operation: { mode: "lifecycle" } },
    { target, operation: { mode: "setup" } },
    { target, operation: { mode: "project" } },
  ])(
    "rejects invalid task boundaries before Engine creation",
    async (input) => {
      await expect(
        observe(input.target, { operation: input.operation as never }),
      ).rejects.toThrow(/operation|requires|require/);
      expect(createEngine).not.toHaveBeenCalled();
    },
  );
  it("cancels an already-aborted observation, and active tasks on abort or timeout", async () => {
    await expect(
      observe(target, {
        signal: AbortSignal.abort(new Error("already cancelled")),
      }),
    ).rejects.toThrow(/already cancelled/);
    expect(engine.start).not.toHaveBeenCalled();
    const controller = new AbortController();
    engine.waitForTaskRelease.mockImplementationOnce(() => {
      controller.abort(new Error("in flight"));
      return Promise.resolve();
    });
    await expect(
      observe(target, { signal: controller.signal }),
    ).rejects.toThrow(/in flight/);
    expect(engine.cancelTask).toHaveBeenCalled();
    engine.waitForTaskRelease.mockImplementationOnce(
      async () => new Promise((resolve) => setTimeout(resolve, 20)),
    );
    await expect(observe(target, { timeoutMs: 1 })).rejects.toThrow(/budget/);
    expect(engine.close).toHaveBeenCalledTimes(3);
  });
  it("enforces aggregate reference count and content budgets", async () => {
    result = {
      pass: true,
      documentation,
      references: Array.from({ length: 16 }, (_, index) => ({
        checkpoint: `${index}`,
        documentation: `${reference}${index}`,
      })),
    };
    await expect(observe(target)).rejects.toThrow(/Too many/);
    result = { pass: true, documentation: cid, references: [] };
    await expect(observe(target)).rejects.toThrow();
    expect(engine.close).toHaveBeenCalledTimes(2);
  });
  it("closes CAR/content even when Engine cleanup fails", async () => {
    engine.close.mockRejectedValueOnce(new Error("close fault"));
    await expect(observe(target)).rejects.toThrow(/close fault/);
    expect(engine.waitForTaskRelease).toHaveBeenCalledTimes(2);
  });
});

describe("offline CAR references (no Task execution)", () => {
  it("validates every protocol instruction against prepared lifecycle snapshots through completion", async () => {
    const artifact = await bundledArtifact();
    const car = await readTaskBundleCar(
      new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
    );
    const store = IpfsStore.fromClient({ block: car.block });
    let source = files();
    try {
      for (const checkpoint of checkpointIds.slice(5)) {
        const index = checkpointIds.indexOf(checkpoint);
        const document = await store.resolveContent(
          CID.parse(artifact.cid),
          `resources/references/checkpoints/${checkpoint}.md`,
        );
        const markdown = await readDocument(store, document.toString());
        if (checkpoint === "deployment")
          source.set(reportPath, Buffer.from(report(head)));
        const current = idea(source, id);
        const state = reduce(current, { primary: current, head });
        const replacements: Record<string, string> = {
          "new-32-hex": String(index + 1).padStart(32, "0"),
          "new-submit-32-hex": String(index + 1).padStart(32, "0"),
          "new-signoff-32-hex": String(index + 30).padStart(32, "0"),
          "current-UTC-ISO-time": new Date().toISOString(),
          "exact-tested-commit-SHA": head,
          "sha256-of-raw-report-bytes": digest(source.get(reportPath) ?? ""),
          "current-user-acceptance-submit-id": String(index + 1).padStart(
            32,
            "0",
          ),
          ...Object.fromEntries(
            gates.map((gate) => [
              `state.revisions.${gate}`,
              state.revisions[gate],
            ]),
          ),
          ...(state.implementation
            ? { "state.implementation": state.implementation }
            : {}),
          ...(state.deployment ? { "state.deployment": state.deployment } : {}),
        };
        let appended = 0;
        for (const match of markdown.matchAll(/```json\n([\s\S]*?)\n```/g)) {
          const json = match[1]!.replace(
            /<([^<>]+)>/g,
            (_match, key: string) => {
              const value = replacements[key];
              if (value === undefined)
                throw new Error(`Unknown instruction placeholder: ${key}`);
              return value;
            },
          );
          const payload: unknown = JSON.parse(json);
          if (typeof payload !== "object" || payload === null)
            throw new Error("Expected an instruction JSON object.");
          if (!("type" in payload)) {
            const indexed = new Map(source);
            indexed.set("tests/cases.json", Buffer.from(canonical(payload)));
            expect(() => idea(indexed, id)).not.toThrow();
            continue;
          }
          const before = idea(source, id);
          const candidate = new Map(source);
          candidate.set(
            "events.jsonl",
            Buffer.from(before.eventSource + canonical(payload) + "\n"),
          );
          const next = idea(candidate, id);
          validateAppend(
            before,
            next.events.at(-1)!,
            reduce(before, { primary: before, head }),
            true,
          );
          source = candidate;
          const last = next.events.at(-1)!;
          if (last.type === "submit" && checkpoint !== "user-acceptance") {
            const approval = pairedEvent({ type: "signOff", submit: last.id });
            validateAppend(
              next,
              approval,
              reduce(next, { primary: next, head }),
              true,
            );
            source = add(source, approval);
          }
          appended++;
        }
        expect(appended, checkpoint).toBe(
          checkpoint === "user-acceptance" ? 2 : 1,
        );
      }
      const current = idea(source, id);
      expect(reduce(current, { primary: current, head })).toMatchObject({
        level: "completed",
        implementation: head,
      });
    } finally {
      await store.close();
      await car.close();
    }
    expect(createEngine).not.toHaveBeenCalled();
  });
  it("reads references from all four bundles and rejects untrusted/non-reference content", async () => {
    for (const kind of ["idea", "commit", "project", "setup"] as const) {
      const artifact = await bundledArtifact(kind);
      const car = await readTaskBundleCar(
        new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
      );
      const store = IpfsStore.fromClient({ block: car.block });
      try {
        const document = await store.resolveContent(
          CID.parse(artifact.cid),
          "resources/references/check.md",
        );
        expect(await getReference(document.toString())).toContain("##");
        await expect(
          getReference(artifact.cid, { artifacts: [artifact] }),
        ).rejects.toThrow(/unavailable/);
        await expect(
          getReference(document.toString(), {
            artifacts: [{ ...artifact, cid }],
          }),
        ).rejects.toThrow(/CAR root/);
      } finally {
        await store.close();
        await car.close();
      }
    }
    expect(createEngine).not.toHaveBeenCalled();
    await expect(
      getReference(reference, {
        signal: AbortSignal.abort(new Error("cancelled")),
      }),
    ).rejects.toThrow(/cancelled/);
  });
  it("handles missing blocks, directories, invalid CID/UTF-8, budgets and cancellation explicitly", async () => {
    const artifact = await bundledArtifact();
    const car = await readTaskBundleCar(
      new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
    );
    const store = IpfsStore.fromClient({ block: car.block });
    try {
      expect(await readDocument(store, documentation)).toContain("protocol v1");
      await expect(readDocument(store, documentation, 1)).rejects.toThrow(
        /budget/,
      );
      await expect(readDocument(store, artifact.cid)).rejects.toThrow(/file/);
      await expect(readDocument(store, "not-a-cid")).rejects.toThrow();
      await expect(readDocument(store, cid)).rejects.toThrow();
      const corrupt = await store.putContent(
        new Blob([Uint8Array.of(255)]).stream(),
      );
      await expect(readDocument(store, corrupt.toString())).rejects.toThrow();
      await expect(
        readDocument(
          store,
          documentation,
          100,
          AbortSignal.abort(new Error("cancelled")),
        ),
      ).rejects.toThrow(/cancelled/);
      for (const checkpoint of checkpointIds.slice(5)) {
        const document = await store.resolveContent(
          CID.parse(artifact.cid),
          `resources/references/checkpoints/${checkpoint}.md`,
        );
        const markdown = await readDocument(store, document.toString());
        expect(markdown).toContain("## Agent instructions");
        expect(markdown).toContain("```json");
      }
    } finally {
      await store.close();
      await car.close();
    }
    expect(head).toHaveLength(40);
  });
});
