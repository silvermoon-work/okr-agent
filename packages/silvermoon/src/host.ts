import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { CID } from "multiformats/cid";
import { Value } from "@sinclair/typebox/value";
import { Type } from "@sinclair/typebox";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import type { Input } from "./contract.js";
import { invariant, text, SilvermoonError } from "./domain.js";

export interface Artifact {
  readonly cid: string;
  readonly path: string;
}
export interface Result {
  readonly pass: boolean;
  readonly documentation: string;
  readonly problems?: readonly {
    readonly code: string;
    readonly brief: string;
    readonly documentation: string;
  }[];
}
export interface Report {
  readonly schema: "silvermoon/v1";
  readonly checkCid: string;
  readonly target: Input;
  readonly result: Result;
  readonly documents: readonly {
    readonly cid: string;
    readonly text: string;
  }[];
}
const resultSchema = Type.Object({
  pass: Type.Boolean(),
  documentation: Type.String(),
  problems: Type.Optional(
    Type.Array(
      Type.Object({
        code: Type.String(),
        brief: Type.String(),
        documentation: Type.String(),
      }),
      { minItems: 1 },
    ),
  ),
});
export async function bundledArtifact(): Promise<Artifact> {
  const binding: unknown = JSON.parse(
    await readFile(new URL("../dist/check.json", import.meta.url), "utf8"),
  );
  invariant(
    binding &&
      typeof binding === "object" &&
      "version" in binding &&
      binding.version === 1 &&
      "cid" in binding &&
      typeof binding.cid === "string",
    "artifact",
    "Unsupported bundled Check binding.",
  );
  CID.parse(binding.cid);
  return {
    cid: binding.cid,
    path: fileURLToPath(new URL("../dist/check.car", import.meta.url)),
  };
}
export async function readDocument(
  store: IpfsStore,
  cid: string,
  budget = 32_768,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const node = await store.readContent(
    CID.parse(cid),
    signal ? { signal } : {},
  );
  invariant(
    node.kind === "file",
    "content",
    "Documentation ContentRef must identify a file.",
  );
  const reader = node.content.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      invariant(
        total <= budget,
        "content-budget",
        "Documentation exceeds the explicit presentation budget; content was not rendered completely.",
      );
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return text(Buffer.concat(chunks));
}
export async function observe(
  target: Input,
  options: {
    readonly cid?: string;
    readonly artifacts?: readonly Artifact[];
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  } = {},
): Promise<Report> {
  const artifacts = options.artifacts ?? [await bundledArtifact()];
  const selectedCid = options.cid ?? artifacts[0]?.cid;
  const artifact = artifacts.find((item) => item.cid === selectedCid);
  invariant(
    artifact,
    "untrusted-check",
    "The pinned Check CID is unavailable or not explicitly trusted by this host; never fall back to the current default.",
  );
  const car = await readTaskBundleCar(
    new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
  );
  if (car.cid !== artifact.cid) {
    await car.close();
    throw new SilvermoonError(
      "artifact",
      "CAR root differs from its fixed Check CID.",
    );
  }
  const memory = new MemoryStore();
  const content = IpfsStore.fromClient({ block: car.block });
  const engine = createTaskEngine({
    store: memory,
    ipfsStore: content,
    authorize: () => true,
  });
  const caller = { scope: "silvermoon", subject: "silvermoon" };
  const controller = new AbortController();
  const abort = () => {
    controller.abort(options.signal?.reason);
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(() => {
    controller.abort(
      new SilvermoonError(
        "timeout",
        "Check observation exceeded its total budget.",
      ),
    );
  }, options.timeoutMs ?? 60_000);
  let taskId: string | undefined;
  const cancel = () => {
    if (taskId) engine.cancelTask(taskId, caller);
  };
  controller.signal.addEventListener("abort", cancel, { once: true });
  try {
    controller.signal.throwIfAborted();
    await engine.start();
    let request = await engine.submit(
      {
        requestId: newId(),
        bundle: artifact.cid,
        parameters: { data: target, cidPaths: [] },
        timeoutMs: options.timeoutMs ?? 60_000,
      },
      caller,
    );
    while (request.status === "preparing") {
      controller.signal.throwIfAborted();
      await pause(1, undefined, { signal: controller.signal });
      request = await engine.getRequestStatus(
        request.requestId,
        { waitMs: 100 },
        caller,
      );
    }
    invariant(
      request.status === "accepted",
      "engine",
      "Engine rejected the Check request.",
    );
    taskId = request.taskId;
    if (controller.signal.aborted) cancel();
    await engine.waitForTaskRelease(taskId, caller);
    controller.signal.throwIfAborted();
    const task = engine.getTask(taskId, caller);
    invariant(
      task.stage === "completed" && task.result,
      "engine",
      `Check execution did not complete: ${task.stage}.`,
    );
    invariant(
      typeof task.result === "object" &&
        !Array.isArray(task.result) &&
        "data" in task.result,
      "engine",
      "Missing Engine result payload.",
    );
    const value: unknown = task.result.data;
    invariant(
      Value.Check(resultSchema, value) &&
        (value.pass || value.problems?.length),
      "engine",
      "Check returned an unsupported result contract.",
    );
    const result: Result = value;
    const references = [
      ...new Set([
        result.documentation,
        ...(result.problems ?? []).map((problem) => problem.documentation),
      ]),
    ];
    invariant(
      references.length <= 16,
      "content-budget",
      "Too many documentation references.",
    );
    const documents = [];
    for (const cid of references)
      documents.push({
        cid,
        text: await readDocument(
          content,
          cid,
          Math.floor(65_536 / references.length),
          controller.signal,
        ),
      });
    return {
      schema: "silvermoon/v1",
      checkCid: artifact.cid,
      target,
      result,
      documents,
    };
  } catch (error) {
    controller.signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", cancel);
    try {
      if (taskId) {
        engine.cancelTask(taskId, caller);
        await engine.waitForTaskRelease(taskId, caller);
      }
    } finally {
      try {
        await engine.close();
      } finally {
        try {
          await content.close();
        } finally {
          await car.close();
        }
      }
    }
  }
}
