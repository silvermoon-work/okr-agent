import assert from "node:assert/strict";
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
import { resolve } from "node:path";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { directoryTree } from "@silvermoon-work/task-builder-cli/node";
import {
  encodeTaskBundleCar,
  readTaskBundleCar,
} from "@silvermoon-work/task-builder/car";
import { listTree, readBytes } from "@silvermoon-work/task-builder/tree";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import { exporter } from "ipfs-unixfs-exporter";

// Copy this standalone harness into a consumer with the same published dependencies installed.
const directory = resolve(process.argv[2] ?? "dist/text-check");
const fault = process.argv[3] === "fault";
const tree = await directoryTree(directory);
const files = new Map();
async function walk(path) {
  for (const entry of await listTree(tree, path)) {
    const child = path ? `${path}/${entry.name}` : entry.name;
    if (entry.kind === "directory") await walk(child);
    else files.set(child, await readBytes(tree, child, 16 * 1024 * 1024));
  }
}
await walk("");
const ancillary = [...files.keys()]
  .filter(
    (path) =>
      path.startsWith("resources/references/") &&
      path !== "resources/references/check.md" &&
      !path.startsWith("resources/references/problems/"),
  )
  .map((path) => path.slice("resources/".length));
const archive = await encodeTaskBundleCar(tree);
const car = await readTaskBundleCar(archive.stream);
const cid = car.cid;
const store = new MemoryStore();
const ipfsStore = IpfsStore.fromClient({ block: car.block });
const caller = { scope: "check-smoke", subject: "check-smoke" };
const engine = createTaskEngine({
  store,
  ipfsStore,
  requestInputEnvelope: true,
  authorize: () => true,
});
try {
  await engine.start();
  for (const text of fault ? ["hello"] : ["hello", "other"]) {
    const submitted = await engine.submit(
      {
        requestId: newId(),
        bundle: cid,
        input: { text },
        timeoutMs: 15_000,
      },
      caller,
    );
    assert.notEqual(submitted.status, "rejected", JSON.stringify(submitted));
  }
  const drained = await engine.drain();
  assert.equal(drained.runs.length, fault ? 1 : 2, JSON.stringify(drained));
  const results = [];
  for (const run of drained.runs) {
    assert.ok(run.reclaimedAt, JSON.stringify(run));
    if (fault) {
      assert.equal(run.stage, "failed", JSON.stringify(run));
      assert.equal(run.output, undefined);
      results.push({ kind: "failed", reclaimed: true });
      continue;
    }
    assert.equal(run.stage, "completed", JSON.stringify(run));
    assert.ok(run.output);
    const result = run.output.result;
    const outputCid = run.output.cid;
    assert.ok(outputCid);
    assert.equal(typeof result.pass, "boolean");
    assert.equal(result.documentation, "references/check.md");
    assert.equal("outputCid" in result, false);
    assert.equal("problems" in result, !result.pass);
    const paths = [
      result.documentation,
      ...(result.pass
        ? []
        : result.problems.map((problem) => problem.documentation)),
    ];
    for (const path of new Set([...paths, ...ancillary])) {
      const node = await exporter(`${outputCid}/${path}`, {
        async *get(cid) {
          yield store.readContentBlock(cid.toString()) ??
            (await ipfsStore.block.get(cid.toString()));
        },
      });
      assert.ok(node.type === "file" || node.type === "raw");
      const chunks = [];
      for await (const chunk of node.content()) chunks.push(chunk);
      const actual = Buffer.concat(chunks);
      assert.deepEqual(actual, Buffer.from(files.get(`resources/${path}`)));
      if (paths.includes(path)) assert.ok(actual.toString("utf8").trim());
    }
    assert.equal(files.has("result.json"), false);
    results.push({
      kind: "completed",
      pass: result.pass,
      output: run.output,
      documentation: paths,
      resources: ancillary,
      reclaimed: true,
    });
  }
  if (!fault)
    assert.deepEqual(results.map((result) => result.pass).sort(), [
      false,
      true,
    ]);
  console.log(JSON.stringify({ ok: true, bundleCid: cid, results }));
} finally {
  await engine.close();
  await ipfsStore.close();
  store.close();
  await car.close();
  await archive.close();
}
