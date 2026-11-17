import { randomUUID } from "node:crypto";
import { CarWriter } from "@ipld/car";
import { CID } from "multiformats/cid";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { contentLinks } from "@silvermoon-work/ipfs-store/dag";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import {
  acceptPayload,
  isTaskBundlePath,
  parametersFromJson,
  payloadCids,
  taskBundleLimits,
  TaskError,
} from "@silvermoon-work/task-protocol";
import type { IpfsPayload } from "@silvermoon-work/ipfs-payload";
import { limits } from "./document.js";

export type TaskSource = { cid: string } | { car: Uint8Array };

export async function loadBrowserTask(
  shared: IpfsStore,
  source: TaskSource,
  signal?: AbortSignal,
) {
  const reader = shared.scope();
  let writing: Promise<void> | undefined;
  let input: ReadableStream<Uint8Array>;
  if ("car" in source)
    input = new ReadableStream({
      start(controller) {
        signal?.throwIfAborted();
        controller.enqueue(source.car);
        controller.close();
      },
    });
  else {
    const root = CID.parse(source.cid);
    const { writer, out } = CarWriter.create([root]);
    const iterator = out[Symbol.asyncIterator]();
    input = new ReadableStream({
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      async cancel() {
        await iterator.return?.();
      },
    });
    writing = (async () => {
      try {
        const seen = new Set<string>();
        const visit = async (cid: CID, depth: number): Promise<void> => {
          signal?.throwIfAborted();
          const key = cid.toString();
          if (seen.has(key)) return;
          if (depth > reader.limits.depth || seen.size >= reader.limits.blocks)
            throw new TaskError(
              "capacity_exceeded",
              "Content traversal exceeds Store limits.",
            );
          seen.add(key);
          const bytes = await reader.block.get(key, signal ? { signal } : {});
          await writer.put({ cid, bytes });
          for (const child of contentLinks(cid, bytes))
            await visit(child, depth + 1);
        };
        await visit(root, 0);
      } finally {
        await writer.close();
      }
    })();
    // Both sides are awaited below; attach immediately so a failing source cannot become unhandled.
    void writing.catch(() => {});
  }
  let car: Awaited<ReturnType<typeof readTaskBundleCar>> | undefined;
  try {
    car = await readTaskBundleCar(input, {
      ...(signal ? { signal } : {}),
      maxBlocks: reader.limits.blocks,
      maxBlockBytes: reader.limits.blockBytes,
      retainedBytes: Math.min(
        taskBundleLimits.archiveBytes,
        reader.limits.bytes,
      ),
    });
    await writing;
    if (
      car.resolved.runtime.type !== "browser" ||
      car.resolved.entry !== "main.mjs"
    )
      throw new TaskError(
        "unsupported_runtime",
        "ipfsaw run requires a browser Task with an ESM main.mjs entry.",
      );
    const files = new Map<string, Uint8Array>();
    const visit = async (path: string): Promise<void> => {
      for (const entry of await car!.tree.list(path)) {
        const next = path ? `${path}/${entry.name}` : entry.name;
        if (entry.kind === "directory") await visit(next);
        else
          files.set(
            next,
            await readBytes(car!.tree, next, taskBundleLimits.fileBytes),
          );
      }
    };
    await visit("");
    const verified = car;
    const store = IpfsStore.fromClient(
      {
        block: {
          async get(cid, options) {
            try {
              return await verified.block.get(cid, options);
            } catch {
              return shared.block.get(cid, options);
            }
          },
        },
      },
      shared.limits,
    );
    return {
      cid: verified.cid,
      resolved: verified.resolved,
      files: files as ReadonlyMap<string, Uint8Array>,
      store,
      parameters(value: unknown): IpfsPayload {
        return acceptPayload(
          parametersFromJson(value, limits.document),
          verified.resolved.parametersSchema,
          { maxBytes: limits.document },
        );
      },
      async close() {
        try {
          await store.close();
        } finally {
          await verified.close();
        }
      },
    };
  } catch (error) {
    await input.cancel().catch(() => {});
    await writing?.catch(() => {});
    await car?.close();
    throw error;
  } finally {
    await reader.close();
  }
}

export type BrowserTask = Awaited<ReturnType<typeof loadBrowserTask>>;

/** One startup call, not the lifetime of the DOM or app it creates. */
export class TaskInvocation {
  readonly id = randomUUID();
  readonly scope = randomUUID();
  readonly startedAt = new Date().toISOString();
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  state: "starting" | "completed" | "cancelled" | "failed" = "starting";
  private readonly reader: IpfsStore;
  private readonly authorized: Set<string>;
  private closed = false;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly requests = new Map<number, AbortController>();
  private readonly active = new Set<AbortController>();
  private closing?: Promise<void>;

  constructor(
    readonly task: BrowserTask,
    readonly parameters: IpfsPayload,
  ) {
    this.parameters = task.parameters(parameters);
    this.reader = task.store.scope();
    this.authorized = new Set(
      [task.cid, ...payloadCids(this.parameters, limits.document)].map((cid) =>
        CID.parse(cid).toV1().toString(),
      ),
    );
  }

  complete(value: unknown): IpfsPayload {
    if (this.closed || this.state !== "starting")
      throw new TaskError("run_finished", "Startup call has finished.");
    const result = acceptPayload(value, this.task.resolved.resultSchema);
    if (
      payloadCids(result).some(
        (cid) => !this.authorized.has(CID.parse(cid).toV1().toString()),
      )
    )
      throw new TaskError(
        "content_forbidden",
        "Result references unapproved content.",
      );
    this.state = "completed";
    return result;
  }

  async cancel(): Promise<boolean> {
    if (this.state !== "starting") return false;
    this.state = "cancelled";
    this.controller.abort();
    await this.close();
    return true;
  }

  async fail(): Promise<void> {
    if (this.state === "starting") this.state = "failed";
    await this.close();
  }

  close(): Promise<void> {
    return (this.closing ??= (async () => {
      this.closed = true;
      if (this.state === "starting") {
        this.state = "cancelled";
        this.controller.abort();
      }
      for (const operation of this.active) operation.abort();
      try {
        await this.reader.close();
      } finally {
        await Promise.allSettled([...this.pending]);
      }
    })());
  }

  cancelContent(id: number): boolean {
    const request = this.requests.get(id);
    request?.abort();
    return !!request;
  }

  async request(value: {
    operation: string;
    cid?: string;
    path?: string;
    id?: number;
  }): Promise<unknown> {
    if (this.closed || this.state !== "starting")
      throw new TaskError("run_finished", "Startup call has finished.");
    if (!["readContent", "resolveContent"].includes(value.operation))
      throw new TaskError(
        "unsupported_capability",
        "This browser host does not support this Task capability.",
      );
    if (this.pending.size >= 8)
      throw new TaskError(
        "capacity_exceeded",
        "Too many concurrent content requests.",
      );
    const cid = CID.parse(value.cid ?? "").toV1();
    if (!this.authorized.has(cid.toString()))
      throw new TaskError(
        "content_forbidden",
        "Content is outside the startup capability scope.",
      );
    const cancellation = new AbortController();
    const signal = AbortSignal.any([this.signal, cancellation.signal]);
    if (value.id !== undefined) {
      if (!Number.isSafeInteger(value.id) || this.requests.has(value.id))
        throw new TaskError(
          "invalid_request",
          "Invalid content request identity.",
        );
      this.requests.set(value.id, cancellation);
    }
    this.active.add(cancellation);
    const operation = (async () => {
      if (value.operation === "resolveContent") {
        if (!value.path || !isTaskBundlePath(value.path))
          throw new TaskError("invalid_path", "Unsafe content path.");
        const resolved = await this.reader.resolveContent(cid, value.path, {
          signal,
        });
        this.authorized.add(resolved.toV1().toString());
        return resolved.toString();
      }
      const node = await this.reader.readContent(cid, { signal });
      if (node.kind === "file") {
        const bytes = new Uint8Array(
          await new Response(node.content).arrayBuffer(),
        );
        return { kind: "file", bytes };
      }
      const entries = [];
      for await (const entry of node.entries) {
        this.authorized.add(entry.cid.toV1().toString());
        entries.push({ ...entry, cid: entry.cid.toString() });
      }
      return { kind: "directory", entries };
    })();
    this.pending.add(operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(operation);
      this.active.delete(cancellation);
      if (value.id !== undefined) this.requests.delete(value.id);
    }
  }
}
