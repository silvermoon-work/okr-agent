import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join, posix } from "node:path";
import process from "node:process";
import console from "node:console";
import { Blob, Buffer } from "node:buffer";
import { setTimeout } from "node:timers/promises";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import { exporter } from "ipfs-unixfs-exporter";

const carPath = resolve(process.argv[2] ?? "dist\\typescript-project.car");
const directories = process.argv.slice(3).map((path) => resolve(path));
if (!directories.length)
  throw new Error("Provide absolute project directories.");
const bytes = await readFile(carPath);
const car = await readTaskBundleCar(new Blob([bytes]).stream());
const store = new MemoryStore();
const ipfsStore = IpfsStore.fromClient({ block: car.block });
const engine = createTaskEngine({
  store,
  ipfsStore,
  requestInputEnvelope: true,
  authorize: () => true,
});
const caller = {
  scope: "typescript-project-smoke",
  subject: "typescript-project-smoke",
};
const results = [];
const taskIds = [];
async function until(action) {
  for (let i = 0; i < 1200; i++) {
    const result = await action();
    if (result !== undefined) return result;
    await setTimeout(50);
  }
  throw new Error("Engine smoke timed out");
}
async function document(output, path) {
  const entry = await exporter(`${output.cid}/${path}`, {
    async *get(cid) {
      yield store.readContentBlock(cid.toString()) ??
        (await car.block.get(cid.toString()));
    },
  });
  assert.ok(entry.type === "file" || entry.type === "raw");
  const chunks = [];
  for await (const chunk of entry.content()) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function submit(input) {
  let request = await engine.submit(
    {
      requestId: newId(),
      bundle: car.cid,
      input,
      timeoutMs: 120_000,
    },
    caller,
  );
  if (request.status === "preparing")
    request = await until(async () => {
      const current = await engine.getRequestStatus(
        request.requestId,
        { waitMs: 100 },
        caller,
      );
      return current.status === "preparing" ? undefined : current;
    });
  if (request.status === "accepted") taskIds.push(request.taskId);
  return request;
}
async function terminal(taskId) {
  return until(() => {
    const task = engine.getTask(taskId, caller);
    return task.canceled ||
      ["completed", "failed", "stopped"].includes(task.stage)
      ? task
      : undefined;
  });
}
await engine.start();
try {
  const canonical = Buffer.from(
    await readBytes(car.tree, "resources/assets/AGENTS.md", 262_144),
  );
  const standardAssets = [
    "AGENTS.md",
    "npm-publish.mjs",
    "npm-publish.yaml",
    "npm-ci.yaml",
  ];
  for (const projectDirectory of directories) {
    console.error("smoke: project", projectDirectory);
    const request = await submit({ projectDirectory });
    assert.equal(request.status, "accepted", JSON.stringify(request));
    const task = await terminal(request.taskId);
    assert.equal(task.stage, "completed", JSON.stringify(task));
    const result = task.output.result;
    assert.match(
      (await document(task.output, result.documentation)).toString("utf8"),
      /TypeScript 项目/,
    );
    assert.deepEqual(
      await document(task.output, "assets/AGENTS.md"),
      canonical,
    );
    for (const name of standardAssets)
      assert.deepEqual(
        await document(task.output, `assets/${name}`),
        Buffer.from(
          await readBytes(car.tree, `resources/assets/${name}`, 262_144),
        ),
      );
    for (const problem of result.problems ?? []) {
      assert.equal(
        problem.documentation,
        `references/problems/${problem.code}.md`,
      );
      const text = (
        await document(task.output, problem.documentation)
      ).toString("utf8");
      assert.ok(text.trim());
      if (problem.code.startsWith("document-")) {
        assert.match(text, /\.\.\/\.\.\/assets\/AGENTS\.md/);
        const path = posix.normalize(
          posix.join(
            posix.dirname(problem.documentation),
            "../../assets/AGENTS.md",
          ),
        );
        assert.deepEqual(await document(task.output, path), canonical);
      }
    }
    results.push({
      projectDirectory,
      ...result,
      documentationReadable: true,
      assetsExact: true,
      outputCid: task.output.cid,
    });
  }
  const invalid = [];
  for (const input of [
    {},
    { context: { projectDirectory: directories[0] } },
    { projectDirectory: directories[0], requirements: {} },
    { projectDirectory: directories[0], projectScopes: ["packages/a"] },
    { projectDirectory: directories[0], metadataProfile: "canonical-v1" },
    { projectDirectory: directories[0], source: "https://example.invalid" },
    { projectDirectory: directories[0], skipMetadata: true },
  ]) {
    console.error("smoke: invalid", JSON.stringify(input));
    const request = await submit(input);
    if (request.status === "accepted") {
      const task = await terminal(request.taskId);
      assert.equal(task.stage, "failed");
      assert.equal(task.output, undefined);
      invalid.push("failed");
    } else {
      assert.equal(request.status, "rejected", JSON.stringify(request));
      invalid.push("rejected");
    }
  }
  const fault = await submit({
    projectDirectory: join(directories[0], "absent"),
  });
  assert.equal(fault.status, "accepted");
  const failed = await terminal(fault.taskId);
  console.error("smoke: fault", failed.stage);
  assert.equal(failed.stage, "failed");
  assert.equal(failed.output, undefined);
  const cancel = await submit({ projectDirectory: directories[0] });
  assert.equal(cancel.status, "accepted");
  engine.cancelTask(cancel.taskId, caller);
  const canceled = await terminal(cancel.taskId);
  console.error("smoke: cancel", canceled.stage);
  assert.equal(canceled.canceled, true);
  assert.equal(canceled.output, undefined);
  const drained = await engine.drain();
  console.error("smoke: drained");
  for (const taskId of taskIds) {
    const task = drained.tasks.find((t) => t.taskId === taskId);
    if (task?.run) {
      const run = drained.runs.find((r) => r.runId === task.run.runId);
      assert.ok(run?.reclaimedAt, JSON.stringify(run));
    }
  }
  console.log(
    JSON.stringify({
      bundleCid: car.cid.toString(),
      size: bytes.length,
      results,
      invalid,
      fault: failed.stage,
      cancel: canceled.canceled,
      reclaimed: true,
    }),
  );
} finally {
  await engine.close();
  await ipfsStore.close();
  store.close();
  await car.close();
}
