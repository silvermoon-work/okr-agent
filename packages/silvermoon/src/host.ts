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
import { Operation, Target, type Input, type Runtime } from "./contract.js";
import type { CommitTarget, Input as CommitInput } from "./commit-contract.js";
import {
  ProjectTarget,
  type Input as ProjectInput,
} from "./project-contract.js";
import { SetupTarget, type Input as SetupInput } from "./setup-contract.js";
import { currentDevice } from "./device.js";
import { invariant, text, SilvermoonError } from "./domain.js";

export interface Artifact {
  readonly cid: string;
  readonly path: string;
  readonly kind?: "idea" | "commit" | "project" | "setup";
}
export interface Result {
  readonly pass: boolean;
  readonly documentation: string;
  readonly references: readonly {
    readonly checkpoint: string;
    readonly documentation: string;
  }[];
  readonly problems?: readonly {
    readonly checkpoint: string;
    readonly code: string;
    readonly brief: string;
  }[];
}
export interface Report {
  readonly schema: "silvermoon/v2";
  readonly checkCid: string;
  readonly target: Target | CommitTarget | ProjectTarget | SetupTarget;
  readonly result: Result;
  readonly documents: readonly {
    readonly cid: string;
    readonly text: string;
  }[];
}
const resultSchema = Type.Object({
  pass: Type.Boolean(),
  documentation: Type.String(),
  references: Type.Array(
    Type.Object({
      checkpoint: Type.String(),
      documentation: Type.String(),
    }),
  ),
  problems: Type.Optional(
    Type.Array(
      Type.Object({
        code: Type.String(),
        brief: Type.String(),
        checkpoint: Type.String(),
      }),
      { minItems: 1 },
    ),
  ),
});
export async function bundledArtifact(
  kind: "idea" | "commit" | "project" | "setup" = "idea",
): Promise<Artifact> {
  const name = kind === "idea" ? "check" : `${kind}-check`;
  const binding: unknown = JSON.parse(
    await readFile(new URL(`../dist/${name}.json`, import.meta.url), "utf8"),
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
    path: fileURLToPath(new URL(`../dist/${name}.car`, import.meta.url)),
    kind,
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
export async function getReference(
  cid: string,
  options: {
    readonly artifacts?: readonly Artifact[];
    readonly signal?: AbortSignal;
  } = {},
): Promise<string> {
  const selected = CID.parse(cid);
  const artifacts =
    options.artifacts ??
    (await Promise.all([
      bundledArtifact("idea"),
      bundledArtifact("commit"),
      bundledArtifact("project"),
      bundledArtifact("setup"),
    ]));
  for (const artifact of artifacts) {
    options.signal?.throwIfAborted();
    const car = await readTaskBundleCar(
      new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
    );
    try {
      invariant(
        car.cid === artifact.cid,
        "artifact",
        "CAR root differs from its fixed Check CID.",
      );
      const store = IpfsStore.fromClient({ block: car.block });
      try {
        const find = async (path: string): Promise<boolean> => {
          for (const entry of await car.tree.list(path, options)) {
            options.signal?.throwIfAborted();
            const child = `${path}/${entry.name}`;
            if (entry.kind === "directory") {
              if (await find(child)) return true;
            } else if (
              selected.equals(
                await store.resolveContent(CID.parse(car.cid), child, options),
              )
            )
              return true;
          }
          return false;
        };
        if (await find("resources/references"))
          return await readDocument(store, cid, 65_536, options.signal);
      } finally {
        await store.close();
      }
    } finally {
      await car.close();
    }
  }
  throw new SilvermoonError(
    "reference-unavailable",
    "Reference CID is unavailable in the trusted Check Bundles.",
  );
}
export async function observe(
  target: Target | ProjectTarget | SetupTarget,
  options: {
    readonly cid?: string;
    readonly artifacts?: readonly Artifact[];
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
    readonly operation?: Operation;
    readonly runtime?: Runtime;
  } = {},
): Promise<Report> {
  const operation = options.operation ?? { mode: "lifecycle" };
  invariant(
    Value.Check(Operation, operation),
    "input",
    "Unsupported Check operation.",
  );
  const kind =
    operation.mode === "lifecycle"
      ? "idea"
      : operation.mode === "snapshot"
        ? "commit"
        : operation.mode;
  invariant(
    Value.Check(
      kind === "idea" ? Target : kind === "setup" ? SetupTarget : ProjectTarget,
      target,
    ),
    "input",
    kind === "idea"
      ? "Idea validation requires userHome, repoRoot and idea."
      : kind === "setup"
        ? "Setup validation requires userHome only."
        : "Project and change validation require userHome and repoRoot only.",
  );
  const device = currentDevice();
  const runtime = options.runtime ?? {
    entry: device.entry,
    path: device.path,
    ...(process.env.SSH_AUTH_SOCK
      ? { sshAuthSock: process.env.SSH_AUTH_SOCK }
      : {}),
  };
  const input: Input | CommitInput | ProjectInput | SetupInput =
    kind === "commit"
      ? {
          target: {
            userHome: target.userHome,
            repoRoot: Value.Decode(ProjectTarget, target).repoRoot,
            snapshot: operation.snapshot ?? "HEAD",
            ...(operation.allowDelete
              ? { allowDelete: operation.allowDelete }
              : {}),
          },
          runtime,
        }
      : kind === "setup"
        ? {
            target: Value.Decode(SetupTarget, target),
            runtime,
          }
        : {
            target:
              kind === "idea"
                ? Value.Decode(Target, target)
                : Value.Decode(ProjectTarget, target),
            runtime,
            ...(operation.refresh === undefined
              ? {}
              : { refresh: operation.refresh }),
          };
  const artifacts = options.artifacts ?? [await bundledArtifact(kind)];
  const selectedCid = options.cid ?? artifacts[0]?.cid;
  const artifact = artifacts.find((item) => item.cid === selectedCid);
  invariant(
    artifact,
    "untrusted-check",
    "The pinned Check CID is unavailable or not explicitly trusted by this host; never fall back to the current default.",
  );
  invariant(
    artifact.kind === undefined || artifact.kind === kind,
    "untrusted-check",
    "The selected Check artifact belongs to a different task.",
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
        parameters: { data: input, cidPaths: [] },
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
      `Check execution did not complete: ${task.stage}.${task.error ? ` ${task.error.code}: ${task.error.message}` : ""}`,
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
        ...result.references.map((reference) => reference.documentation),
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
      schema: "silvermoon/v2",
      checkCid: artifact.cid,
      target: input.target,
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
