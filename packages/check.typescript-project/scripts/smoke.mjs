import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { Blob, Buffer } from "node:buffer";
import { setTimeout } from "node:timers/promises";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import { exporter } from "ipfs-unixfs-exporter";

const carPath = resolve(process.argv[2] ?? "dist/typescript-project.car");
const directories = process.argv.slice(3).map((path) => resolve(path));
if (!directories.length)
  throw new Error("Provide one or more absolute project directories.");
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
async function until(action) {
  for (let i = 0; i < 600; i++) {
    const result = await action();
    if (result !== undefined) return result;
    await setTimeout(50);
  }
  throw new Error("Engine smoke timed out");
}
async function textDocument(output, path) {
  const entry = await exporter(`${output.cid}/${path}`, {
    async *get(cid) {
      yield store.readContentBlock(cid.toString()) ??
        (await car.block.get(cid.toString()));
    },
  });
  // Output links reference bundle documentation, so the CAR block source owns these blocks.
  assert.ok(entry.type === "file" || entry.type === "raw");
  const chunks = [];
  for await (const chunk of entry.content()) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
await engine.start();
try {
  for (const projectDirectory of directories) {
    let request = await engine.submit(
      {
        requestId: newId(),
        bundle: car.cid,
        input: { context: { projectDirectory } },
        timeoutMs: 30_000,
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
    assert.equal(request.status, "accepted", JSON.stringify(request));
    const task = await until(() => {
      const current = engine.getTask(request.taskId, caller);
      if (current.stage === "failed") throw new Error(JSON.stringify(current));
      return current.stage === "completed" ? current : undefined;
    });
    const result = task.output.result;
    const documentation = await textDocument(task.output, result.documentation);
    assert.match(documentation, /TypeScript 项目/);
    for (const problem of result.problems ?? []) {
      assert.equal(
        problem.documentation,
        `references/problems/${problem.code}.md`,
      );
      assert.ok(
        (await textDocument(task.output, problem.documentation)).trim(),
      );
    }
    results.push({ projectDirectory, ...result, documentationReadable: true });
  }
  console.log(
    JSON.stringify({
      bundleCid: car.cid.toString(),
      size: bytes.length,
      results,
    }),
  );
} finally {
  await engine.close();
  await ipfsStore.close();
  store.close();
  await car.close();
}
