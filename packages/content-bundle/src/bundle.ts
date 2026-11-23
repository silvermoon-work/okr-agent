import {
  ContentError,
  IpfsStore,
  openContent,
} from "@silvermoon-work/ipfs-store";
import type { UnixfsNode } from "@silvermoon-work/ipfs-store";
import { CID } from "multiformats/cid";
import { ContentBundleError } from "./errors.js";
import {
  parseBundleManifest,
  parseContentRef,
  parseData,
  record,
  safePath,
} from "./parsing.js";
import { Schemas } from "./schema.js";
import type {
  BundleLimits,
  BundleManifest,
  ContentBundle,
  ContentType,
  OpenBundleOptions,
} from "./types.js";

const defaults: BundleLimits = {
  bytes: 64 * 1024 * 1024,
  blocks: 16_384,
  blockBytes: 4 * 1024 * 1024,
  files: 2048,
  depth: 64,
  manifestBytes: 64 * 1024,
  schemaBytes: 1024 * 1024,
  documentBytes: 8 * 1024 * 1024,
  schemas: 128,
  references: 4096,
  nodes: 100_000,
};

function capacity(options: OpenBundleOptions): BundleLimits {
  const result = { ...defaults, ...options.limits };
  for (const [key, value] of Object.entries(result))
    if (
      !Object.hasOwn(defaults, key) ||
      !Number.isSafeInteger(value) ||
      value <= 0
    )
      throw new ContentBundleError(
        "OPTIONS_INVALID",
        "Limits must be positive safe integers with known names.",
      );
  if (typeof options.resolveCid !== "function")
    throw new ContentBundleError(
      "OPTIONS_INVALID",
      "A CID block resolver is required.",
    );
  return result;
}

function contextual(
  cause: unknown,
  path: string,
  pointer = "",
  chain: readonly string[] = [],
  signal?: AbortSignal,
): ContentBundleError {
  if (cause instanceof ContentBundleError)
    return new ContentBundleError(
      cause.code,
      cause.message,
      cause.path || path,
      cause.pointer || pointer,
      [...chain, ...cause.referenceChain],
      { cause },
    );
  const capacityFailure =
    (cause instanceof ContentError && cause.code === "capacity_exceeded") ||
    (cause instanceof Error &&
      [
        "IPFS DAG depth capacity exceeded.",
        "IPFS block capacity exceeded.",
        "IPFS file capacity exceeded.",
      ].includes(cause.message));
  const code = signal?.aborted
    ? "ABORTED"
    : capacityFailure
      ? "LIMIT_EXCEEDED"
      : "CONTENT_UNAVAILABLE";
  return new ContentBundleError(
    code,
    "Cannot read or verify bundle content.",
    path,
    pointer,
    chain,
    { cause },
  );
}

function storeFor(options: OpenBundleOptions, limits: BundleLimits): IpfsStore {
  return IpfsStore.fromClient(
    {
      block: {
        get: async (value, request) => {
          const cid = CID.parse(value);
          const bytes = await options.resolveCid(cid, request ?? {});
          return Uint8Array.from(bytes);
        },
      },
    },
    {
      bytes: limits.bytes,
      blocks: limits.blocks,
      blockBytes: limits.blockBytes,
      depth: limits.depth,
    },
  );
}

async function collect(node: UnixfsNode, maximum: number): Promise<Uint8Array> {
  if (node.type === "directory")
    throw new ContentBundleError("CONTENT_INVALID", "Expected a regular file.");
  if (node.size > BigInt(maximum))
    throw new ContentBundleError(
      "LIMIT_EXCEEDED",
      "File exceeds its parsing byte limit.",
    );
  const parts: Uint8Array[] = [];
  let length = 0;
  for await (const part of node.content()) {
    length += part.byteLength;
    if (length > maximum)
      throw new ContentBundleError(
        "LIMIT_EXCEEDED",
        "File exceeds its parsing byte limit.",
      );
    parts.push(part);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

export async function openBundle(
  rootCid: CID,
  options: OpenBundleOptions,
): Promise<ContentBundle> {
  const limits = capacity(options);
  const cid = CID.decode(Uint8Array.from(rootCid.bytes));
  if (cid.code !== 0x70)
    throw new ContentBundleError(
      "CONTENT_INVALID",
      "Bundle root must be a UnixFS directory CID.",
    );
  const source = { resolveCid: options.resolveCid.bind(options) };
  const store = storeFor(source, limits);
  const readOptions = options.signal ? { signal: options.signal } : {};
  const files = new Set<string>();
  const directories = new Set<string>();
  const manifests = new Map<string, BundleManifest>();
  const seenContent = new Set<string>();
  let references = 0;
  let entries = 0;
  let parsedBytes = 0;
  const read = (path: string) =>
    store.read(path ? `${cid.toString()}/${path}` : cid, readOptions);
  const schemas = new Schemas(
    (schema) => store.block.get(schema.toString(), readOptions),
    limits,
  );
  const join = (base: string, path: string) =>
    base ? `${base}/${safePath(path)}` : safePath(path);
  const bytesAt = async (path: string, maximum: number) => {
    if (!files.has(path))
      throw new ContentBundleError(
        "CONTENT_UNAVAILABLE",
        "Bundle file does not exist.",
        path,
      );
    const bytes = await collect(await read(path), maximum);
    parsedBytes += bytes.byteLength;
    if (parsedBytes > limits.bytes)
      throw new ContentBundleError(
        "LIMIT_EXCEEDED",
        "Parsed content exceeds the total byte limit.",
      );
    return bytes;
  };
  const index = async (path: string, depth: number): Promise<void> => {
    if (depth > limits.depth || ++entries > limits.files * (limits.depth + 1))
      throw new ContentBundleError(
        "LIMIT_EXCEEDED",
        "Directory traversal limit exceeded.",
        path,
      );
    const node = await read(path);
    if (node.type === "directory") {
      directories.add(path);
      for await (const child of node.entries())
        await index(join(path, child.name), depth + 1);
    } else {
      if (!path)
        throw new ContentBundleError(
          "CONTENT_INVALID",
          "Bundle root is not a directory.",
        );
      if (files.size >= limits.files)
        throw new ContentBundleError(
          "LIMIT_EXCEEDED",
          "Bundle file count exceeded.",
          path,
        );
      files.add(path);
    }
  };
  const validateContent = async (
    base: string,
    path: string,
    schema: CID,
    type: ContentType,
    depth: number,
    chain: readonly string[],
  ): Promise<void> => {
    const absolute = join(base, path);
    const key = JSON.stringify([base, absolute, schema.toString(), type]);
    if (seenContent.has(key)) return;
    seenContent.add(key);
    try {
      const uri = await schemas.load(schema);
      const definition = schemas.node(uri).schema;
      if (
        type === "application/jsonl" &&
        (!record(definition) || definition.type !== "array")
      )
        throw new ContentBundleError(
          "SCHEMA_INVALID",
          "JSONL requires an explicit root type: array Schema.",
        );
      const value = parseData(
        await bytesAt(absolute, limits.documentBytes),
        type,
        limits.nodes,
        limits.depth,
      );
      schemas.validate(uri, value);
      await schemas.references(uri, value, async (text, pointer) => {
        const nextChain = [...chain, `${absolute}#${pointer} -> ${text}`];
        try {
          if (++references > limits.references || depth >= limits.depth)
            throw new ContentBundleError(
              "LIMIT_EXCEEDED",
              "Content reference traversal limit exceeded.",
            );
          const ref = parseContentRef(text);
          if (ref.kind === "bundle")
            await validateBundle(join(base, ref.path), depth + 1, nextChain);
          else
            await validateContent(
              base,
              ref.path,
              ref.schemaCid,
              `application/${ref.kind}`,
              depth + 1,
              nextChain,
            );
        } catch (cause) {
          throw contextual(cause, absolute, pointer, nextChain, options.signal);
        }
      });
    } catch (cause) {
      throw contextual(cause, absolute, "", chain, options.signal);
    }
  };
  const validateBundle = async (
    base: string,
    depth: number,
    chain: readonly string[],
  ): Promise<void> => {
    if (manifests.has(base)) return;
    try {
      if (!directories.has(base))
        throw new ContentBundleError(
          "CONTENT_INVALID",
          "Bundle reference must identify a directory.",
          base,
        );
      const manifest = parseBundleManifest(
        await bytesAt(join(base, ".bundle.yaml"), limits.manifestBytes),
      );
      manifests.set(base, manifest);
      await validateContent(
        base,
        manifest.entry.path,
        manifest.entry.schemaCid,
        manifest.entry.contentType,
        depth,
        chain,
      );
    } catch (cause) {
      throw contextual(cause, base, "", chain, options.signal);
    }
  };
  try {
    // Preparation verifies the entire UnixFS DAG, including unreferenced attachments.
    await store.prepare(cid, readOptions);
    await index("", 0);
    await validateBundle("", 0, []);
  } catch (cause) {
    throw contextual(cause, cid.toString(), "", [], options.signal);
  } finally {
    await store.close();
  }
  const manifest = manifests.get("")!;
  return Object.freeze({
    get cid() {
      return CID.decode(Uint8Array.from(cid.bytes));
    },
    get manifest() {
      return Object.freeze({
        entry: Object.freeze({
          ...manifest.entry,
          schemaCid: CID.decode(
            Uint8Array.from(manifest.entry.schemaCid.bytes),
          ),
        }),
      });
    },
    async readFile(path: string, request: { signal?: AbortSignal } = {}) {
      safePath(path);
      if (!files.has(path))
        throw new ContentBundleError(
          "CONTENT_UNAVAILABLE",
          "Bundle file does not exist.",
          path,
        );
      const lifetime = new AbortController();
      const signal = request.signal
        ? AbortSignal.any([request.signal, lifetime.signal])
        : lifetime.signal;
      const seen = new Set<string>();
      let bytesRead = 0;
      let node: Awaited<ReturnType<typeof openContent>>;
      try {
        node = await openContent(
          {
            block: {
              async get(value, request) {
                const block = CID.parse(value);
                const bytes = await source.resolveCid(block, request ?? {});
                const key = block.toV1().toString();
                if (!seen.has(key)) {
                  seen.add(key);
                  bytesRead += bytes.byteLength;
                  if (seen.size > limits.blocks || bytesRead > limits.bytes)
                    throw new ContentBundleError(
                      "LIMIT_EXCEEDED",
                      "File stream exceeds its block/byte limits.",
                      path,
                    );
                }
                return bytes;
              },
            },
          },
          `${cid.toString()}/${path}`,
          {
            cacheBlocks: false,
            signal,
            retainedBlocks: new Map(),
            retentionBudget: { bytes: 0, limit: limits.bytes },
            maxBlockBytes: limits.blockBytes,
            maxDagBlocks: limits.blocks,
            depth: limits.depth,
          },
        );
        if (node.type !== "file" && node.type !== "raw")
          throw new ContentBundleError(
            "CONTENT_INVALID",
            "Expected a file.",
            path,
          );
      } catch (cause) {
        const failure = contextual(cause, path, "", [], signal);
        lifetime.abort();
        throw failure;
      }
      const iterator = node.content()[Symbol.asyncIterator]();
      let finished = false;
      const release = async () => {
        if (finished) return;
        finished = true;
        lifetime.abort();
        await iterator.return();
      };
      return new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            try {
              signal.throwIfAborted();
              const part = await iterator.next();
              if (part.done) {
                await release();
                controller.close();
              } else controller.enqueue(Uint8Array.from(part.value));
            } catch (cause) {
              const failure = contextual(cause, path, "", [], signal);
              try {
                await release();
              } finally {
                controller.error(failure);
              }
            }
          },
          cancel: release,
        },
        { highWaterMark: 0 },
      );
    },
  });
}
