import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { CarReader } from "@ipld/car";
import { importer } from "ipfs-unixfs-importer";
import type { CID } from "multiformats/cid";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { buildTaskBundle } from "@silvermoon-work/task-builder";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { memoryTree } from "@silvermoon-work/task-builder/tree";
import { packRenderer } from "../src/bundle.js";

export async function taskFixture(
  script = "export default async (parameters) => parameters.text;",
  result: unknown = { type: "string" },
  runtime: { type: "browser" } | { type: "node"; minVersion: string } = {
    type: "browser",
  },
  parameters: unknown = {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
) {
  const tree = await buildTaskBundle(
    memoryTree(
      new Map([
        ["main.js", Buffer.from(script)],
        ["note.txt", Buffer.from("actual bundled resource")],
      ]),
    ),
    {
      name: "browser acceptance",
      runtime,
      source: {
        entry: "main.js",
        mode: "explicit",
        contract: { parameters, result, message: false },
      },
      include: [{ from: "note.txt", to: "resources/" }],
    },
  );
  const encoded = await encodeTaskBundleCar(tree);
  try {
    return {
      cid: encoded.cid,
      car: new Uint8Array(await new Response(encoded.stream).arrayBuffer()),
    };
  } finally {
    await encoded.close();
  }
}

export async function fixtureDirectory(): Promise<{
  directory: string;
  cleanup(): Promise<void>;
}> {
  const base = resolve(".test-work");
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(resolve(base, "ipfsaw-"));
  return {
    directory,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
export function rendererFiles(
  script = "export default {mount(){},update(){},dispose(){}}",
) {
  return new Map([
    [
      "ipfsaw.renderer.json",
      Buffer.from(
        JSON.stringify({
          protocol: "ipfsaw-renderer/v1",
          entry: "renderer.js",
          styles: [],
        }),
      ),
    ],
    ["renderer.js", Buffer.from(script)],
  ]);
}
export async function rendererFixture(
  script?: string,
  extra: ReadonlyMap<string, Uint8Array> = new Map(),
) {
  const packed = await packRenderer(
    new Map([...rendererFiles(script), ...extra]),
  );
  const car = await CarReader.fromBytes(packed.car);
  const blocks = new Map<string, Uint8Array>();
  for await (const block of car.blocks())
    blocks.set(block.cid.toString(), block.bytes);
  const store = IpfsStore.fromClient({
    block: {
      get: (value) => {
        const bytes = blocks.get(value);
        if (!bytes) return Promise.reject(new Error("Missing test block."));
        return Promise.resolve(bytes);
      },
    },
  });
  return { ...packed, store, blocks };
}
/** Construct deliberately invalid immutable fixtures without the production pack validator. */
export async function rawDirectory(
  files: ReadonlyMap<string, Uint8Array>,
  wrapWithDirectory = true,
) {
  const blocks = new Map<string, Uint8Array>();
  const blockstore = {
    put: (cid: CID, bytes: Uint8Array) => {
      blocks.set(cid.toString(), bytes);
      return cid;
    },
  };
  let root = "";
  for await (const entry of importer(
    [...files].map(([path, content]) => ({ path, content })),
    blockstore,
    { cidVersion: 1, rawLeaves: true, wrapWithDirectory },
  ))
    root = entry.cid.toString();
  const store = IpfsStore.fromClient({
    block: {
      get: (value) => {
        const bytes = blocks.get(value);
        if (!bytes) return Promise.reject(new Error("Missing test block."));
        return Promise.resolve(bytes);
      },
    },
  });
  return { cid: root, store, blocks };
}
