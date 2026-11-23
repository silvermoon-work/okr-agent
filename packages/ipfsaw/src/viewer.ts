import { CarReader } from "@ipld/car";
import { CID } from "multiformats/cid";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { taskBundleLimits } from "@silvermoon-work/task-protocol";
import { loadRenderer } from "./bundle.js";
import { rootCid } from "./configuration.js";
import { loadBrowserTask } from "./task.js";
import type { TaskSource } from "./task.js";

export async function loadViewer(
  shared: IpfsStore,
  source: TaskSource,
  signal?: AbortSignal,
) {
  let archive: IpfsStore | undefined;
  let cid: string;
  if ("car" in source) {
    if (source.car.byteLength > taskBundleLimits.archiveBytes)
      throw new Error("Viewer CAR exceeds its archive limit.");
    const car = await CarReader.fromBytes(source.car);
    const roots = await car.getRoots();
    if (roots.length !== 1) throw new Error("Expected one Viewer CAR root.");
    cid = rootCid(roots[0]!.toString());
    archive = IpfsStore.fromClient(
      {
        block: {
          async get(value) {
            const block = await car.get(CID.parse(value));
            if (!block) throw new Error("Missing Viewer CAR block.");
            return block.bytes;
          },
        },
      },
      shared.limits,
    );
  } else cid = rootCid(source.cid);
  const reader = (archive ?? shared).scope();
  try {
    await reader.prepare(cid, signal ? { signal } : {});
    const root = await reader.read(cid, signal ? { signal } : {});
    if (root.type !== "directory")
      throw new Error("Viewer root must be a directory.");
    let task = false;
    let renderer = false;
    for await (const entry of root.entries()) {
      if (entry.name === "task.yaml") task = true;
      if (entry.name === "ipfsaw.renderer.json") renderer = true;
    }
    if (task === renderer)
      throw new Error("Expected exactly one supported Viewer manifest.");
    if (task)
      return {
        type: "task" as const,
        bundle: await loadBrowserTask(shared, source, signal),
      };
    return {
      type: "renderer" as const,
      bundle: await loadRenderer(reader, cid, signal),
    };
  } finally {
    try {
      await reader.close();
    } finally {
      await archive?.close();
    }
  }
}
