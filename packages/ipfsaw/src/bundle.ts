import { CarReader, CarWriter } from "@ipld/car";
import { importer } from "ipfs-unixfs-importer";
import { CID } from "multiformats/cid";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { limits, record } from "./document.js";
import { rootCid } from "./configuration.js";

export interface RendererManifest {
  protocol: "ipfsaw-renderer/v1";
  entry: string;
  styles: string[];
}
export interface RendererBundle {
  cid: string;
  manifest: RendererManifest;
  files: ReadonlyMap<string, Uint8Array>;
}
const mimes: Record<string, string> = {
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  map: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain",
  wasm: "application/wasm",
};
export function assetPath(path: string): string {
  if (
    !path ||
    path.length > 1024 ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\:%?#]/u.test(path) ||
    [...path].some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    ) ||
    path.startsWith("/")
  )
    throw new Error("Renderer has an unsafe asset path.");
  return path;
}
export function mime(path: string): string {
  const type = mimes[path.split(".").at(-1)!];
  if (!type)
    throw new Error("Renderer asset has an unsupported MIME extension.");
  return type;
}
export function validateFiles(
  files: ReadonlyMap<string, Uint8Array>,
): RendererManifest {
  if (files.size > limits.files)
    throw new Error("Renderer exceeds 2048 files.");
  let total = 0;
  for (const [path, bytes] of files) {
    assetPath(path);
    mime(path);
    total += bytes.byteLength;
    if (total > limits.renderer)
      throw new Error("Renderer exceeds 16 MiB logical content.");
  }
  const bytes = files.get("ipfsaw.renderer.json");
  if (!bytes) throw new Error("Renderer is missing ipfsaw.renderer.json.");
  if (bytes.byteLength > limits.manifest)
    throw new Error("Renderer manifest exceeds 64 KiB.");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Invalid renderer manifest JSON.");
  }
  if (
    !record(value) ||
    value.protocol !== "ipfsaw-renderer/v1" ||
    typeof value.entry !== "string" ||
    !Array.isArray(value.styles) ||
    !value.styles.every((item: unknown) => typeof item === "string") ||
    Object.keys(value).some(
      (key) => !["protocol", "entry", "styles"].includes(key),
    )
  )
    throw new Error("Invalid ipfsaw-renderer/v1 manifest.");
  const styles = value.styles;
  if (
    !["text/javascript"].includes(mime(assetPath(value.entry))) ||
    styles.some((path) => mime(assetPath(path)) !== "text/css")
  )
    throw new Error("Renderer entry/styles have incorrect MIME types.");
  for (const path of [value.entry, ...styles])
    if (!files.has(path))
      throw new Error("Renderer manifest references a missing asset.");
  return { protocol: "ipfsaw-renderer/v1", entry: value.entry, styles };
}

export async function loadRenderer(
  store: IpfsStore,
  value: string,
  signal?: AbortSignal,
): Promise<RendererBundle> {
  const cid = rootCid(value);
  const reader = store.scope({ bytes: limits.renderer });
  try {
    // Verify every linked block, including links not used by the manifest.
    await reader.prepare(cid, signal ? { signal } : {});
    const files = new Map<string, Uint8Array>();
    let total = 0;
    let entries = 0;
    const maximumEntries =
      limits.files * (Math.min(100, reader.limits.depth) + 1) + 1;
    const visit = async (path: string, depth: number): Promise<void> => {
      if (depth > 100 || ++entries > maximumEntries)
        throw new Error("Renderer directory exceeds traversal limits.");
      const node = await reader.read(
        path ? `${cid}/${path}` : cid,
        signal ? { signal } : {},
      );
      if (node.type === "directory") {
        for await (const child of node.entries()) {
          const next = path ? `${path}/${child.name}` : child.name;
          assetPath(next);
          await visit(next, depth + 1);
        }
      } else {
        if (!path) throw new Error("Renderer root must be a directory.");
        if (files.size >= limits.files)
          throw new Error("Renderer exceeds 2048 files.");
        mime(path);
        const parts: Uint8Array[] = [];
        let length = 0;
        const maximum =
          path === "ipfsaw.renderer.json" ? limits.manifest : limits.renderer;
        for await (const part of node.content()) {
          length += part.byteLength;
          total += part.byteLength;
          if (length > maximum || total > limits.renderer)
            throw new Error("Renderer exceeds its content limit.");
          parts.push(part);
        }
        files.set(path, Buffer.concat(parts, length));
      }
    };
    await visit("", 0);
    return { cid, manifest: validateFiles(files), files };
  } finally {
    await reader.close();
  }
}

/** Generic UnixFS directory encoder. Does not read Task metadata or execute assets. */
export async function packRenderer(
  files: ReadonlyMap<string, Uint8Array>,
): Promise<{ cid: string; car: Uint8Array }> {
  validateFiles(files);
  const blocks = new Map<string, { cid: CID; bytes: Uint8Array }>();
  const blockstore = {
    put(cid: CID, bytes: Uint8Array) {
      blocks.set(cid.toString(), { cid, bytes });
      return cid;
    },
  };
  let root: CID | undefined;
  const source = [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => ({ path, content }));
  for await (const entry of importer(source, blockstore, {
    wrapWithDirectory: true,
    cidVersion: 1,
    rawLeaves: true,
  }))
    root = entry.cid;
  if (!root) throw new Error("Renderer directory is empty.");
  const { writer, out } = CarWriter.create([root]);
  const collecting = (async () => {
    const parts: Uint8Array[] = [];
    for await (const part of out) parts.push(part);
    return Buffer.concat(parts);
  })();
  for (const block of blocks.values()) await writer.put(block);
  await writer.close();
  const car = await collecting;
  // Use the same verified Store path consumers use before calling this deliverable valid.
  const store = IpfsStore.fromClient(
    {
      block: {
        get: (value) => {
          const block = blocks.get(CID.parse(value).toString());
          if (!block) throw new Error("Missing renderer block.");
          return Promise.resolve(block.bytes);
        },
      },
    },
    { bytes: limits.renderer },
  );
  try {
    await loadRenderer(store, root.toString());
  } finally {
    await store.close();
  }
  return { cid: root.toString(), car };
}

/** Explicit import into a caller-owned local Store; no upload, pins or daemon shutdown. */
export async function importRendererCar(
  store: IpfsStore,
  bytes: Uint8Array,
): Promise<RendererBundle> {
  if (store.configuration.backend !== "local")
    throw new Error(
      "Renderer CAR import requires an explicitly caller-owned local Store.",
    );
  if (bytes.byteLength > limits.renderer * 2)
    throw new Error("Renderer CAR exceeds import limit.");
  const car = await CarReader.fromBytes(bytes);
  const roots = await car.getRoots();
  if (roots.length !== 1) throw new Error("Expected one renderer CAR root.");
  for await (const { cid, bytes: block } of car.blocks())
    await store.put(cid, block);
  return loadRenderer(store, roots[0]!.toString());
}
