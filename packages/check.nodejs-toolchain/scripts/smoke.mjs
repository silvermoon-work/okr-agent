import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";
import console from "node:console";
import { Blob, Buffer } from "node:buffer";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import { exporter } from "ipfs-unixfs-exporter";

const carPath = resolve(process.argv[2] ?? "dist/nodejs-toolchain.car");
const directory = resolve(process.argv[3] ?? "../..");
const car = await readTaskBundleCar(
  new Blob([await readFile(carPath)]).stream(),
);
const store = new MemoryStore();
const engine = createTaskEngine({
  store,
  ipfsClient: { block: car.block },
  requestInputEnvelope: true,
  authorize: () => true,
});
const owned = join(directory, `.toolchain-engine-${randomUUID()}`);
const caller = { scope: "toolchain-smoke", subject: "toolchain-smoke" };
const samples = [
  {
    context: { projectDirectory: directory },
    requirements: { tools: { node: {} } },
  },
  {
    context: { projectDirectory: directory },
    requirements: {
      tools: {
        node: { minimumVersion: "999999999999999999999999" },
        npm: { minimumVersion: "999999999999999999999999" },
      },
      registries: {
        active: { npm: { allowedUrls: ["https://invalid.example/never"] } },
      },
    },
  },
  {
    context: { projectDirectory: owned },
    requirements: { tools: { node: {} } },
  },
];
const results = [];
try {
  await mkdir(owned);
  await writeFile(join(owned, "sentinel.txt"), "unchanged");
  await engine.start();
  for (const [index, input] of samples.entries()) {
    if (index === 2) await rm(owned, { recursive: true });
    const submitted = await engine.submit(
      {
        requestId: newId(),
        bundle: car.cid,
        input,
        timeoutMs: 30_000,
      },
      caller,
    );
    assert.notEqual(submitted.status, "rejected", JSON.stringify(submitted));
    const drained = await engine.drain();
    const run = drained.runs.find(
      (r) => !results.some((previous) => previous.id === r.id),
    );
    assert.ok(run, JSON.stringify(drained));
    assert.ok(run.reclaimedAt, JSON.stringify(run));
    if (index === 2) {
      assert.equal(run.stage, "failed", JSON.stringify(run));
      assert.equal(run.output, undefined);
      results.push({ id: run.id, stage: run.stage, reclaimed: true });
      continue;
    }
    assert.equal(run.stage, "completed", JSON.stringify(run));
    assert.ok(run.output);
    const result = run.output.result;
    assert.equal(result.pass, index === 0, JSON.stringify(result));
    assert.equal("problems" in result, index !== 0);
    assert.equal(result.documentation, "references/check.md");
    const paths = [
      result.documentation,
      ...(result.problems ?? []).map((p) => p.documentation),
    ];
    for (const problem of result.problems ?? [])
      assert.deepEqual(Object.keys(problem).sort(), [
        "brief",
        "code",
        "documentation",
      ]);
    for (const path of new Set(paths)) {
      const file = await exporter(`${run.output.cid}/${path}`, {
        async *get(cid) {
          yield store.readContentBlock(cid.toString()) ??
            (await car.block.get(cid.toString()));
        },
      });
      assert.ok(file.type === "file" || file.type === "raw");
      const chunks = [];
      for await (const chunk of file.content()) chunks.push(chunk);
      assert.deepEqual(
        Buffer.concat(chunks),
        Buffer.from(await readBytes(car.tree, `resources/${path}`, 262144)),
      );
    }
    results.push({
      id: run.id,
      stage: run.stage,
      pass: result.pass,
      problems: result.problems?.map((p) => p.code) ?? [],
      documents: [...new Set(paths)],
      outputCid: run.output.cid,
      reclaimed: true,
    });
  }
  console.log(
    JSON.stringify({ ok: true, carPath, bundleCid: car.cid, results }),
  );
} finally {
  await engine.close();
  store.close();
  await car.close();
  await rm(owned, { recursive: true, force: true });
}
