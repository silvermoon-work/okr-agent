import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import { exporter } from "ipfs-unixfs-exporter";

const root = dirname(fileURLToPath(import.meta.url));
const expectedCid = process.argv[2];
const offline = process.argv.includes("--deny-network");
assert.ok(expectedCid, "Provide the separately verified production CID.");
assert.equal(root.startsWith("/tmp/okr-convention-"), true);
for (const name of ["check-task-sdk", "check.typescript-project"]) {
  assert.throws(() => import.meta.resolve(`@silvermoon-work/${name}`), {
    code: "ERR_MODULE_NOT_FOUND",
  });
}
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const bytes = await readFile(join(root, "production.car"));
const car = await readTaskBundleCar(new Blob([bytes]).stream(), {
  expectedCid,
});
const ipfsStore = IpfsStore.fromClient({ block: car.block });
const store = new MemoryStore();
const engine = createTaskEngine({
  store,
  ipfsStore,
  requestInputEnvelope: true,
  authorize: () => true,
});
const caller = { scope: "independent-convention", subject: "authorized-host" };
const samples = [
  { name: "application-current", path: "projects/current", pass: true },
  { name: "application-old-config", path: "projects/good", pass: false },
  { name: "npm-current", path: "projects/npm-current", pass: true },
  { name: "workspace-current", path: "projects/workspace", pass: true },
  {
    name: "workspace-single-current",
    path: "projects/workspace-one",
    pass: true,
  },
  { name: "fixed-document-mismatch", path: "projects/bad", pass: false },
];
const snapshots = new Map();
async function snapshot(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  return Promise.all(
    entries.map(async (entry) => {
      assert.ok(entry.isDirectory() || entry.isFile());
      const path = join(directory, entry.name);
      return {
        name: entry.name,
        content: entry.isDirectory()
          ? await snapshot(path)
          : createHash("sha256")
              .update(await readFile(path))
              .digest("hex"),
      };
    }),
  );
}
for (const sample of samples) {
  const project = join(root, sample.path);
  snapshots.set(project, await snapshot(project));
}
async function submit(input) {
  let response = await engine.submit(
    {
      requestId: newId(),
      bundle: car.cid,
      input,
      timeoutMs: 180000,
    },
    caller,
  );
  const deadline = Date.now() + 180000;
  while (response.status === "preparing" && Date.now() < deadline) {
    response = await engine.getRequestStatus(
      response.requestId,
      { waitMs: 100 },
      caller,
    );
  }
  return response;
}
async function textOutput(output, path) {
  const file = await exporter(`${output.cid}/${path}`, {
    async *get(cid) {
      yield store.readContentBlock(cid.toString()) ??
        (await ipfsStore.block.get(cid.toString()));
    },
  });
  assert.ok(file.type === "file" || file.type === "raw");
  const chunks = [];
  for await (const chunk of file.content()) chunks.push(chunk);
  return Buffer.concat(chunks);
}
const invalid = [];
const taskIds = [];
let report;
try {
  await engine.start();
  for (const sample of samples) {
    const response = await submit({
      projectDirectory: join(root, sample.path),
    });
    assert.equal(response.status, "accepted", JSON.stringify(response));
    sample.taskId = response.taskId;
    taskIds.push(response.taskId);
  }
  for (const input of [
    {},
    { context: { projectDirectory: join(root, samples[0].path) } },
    { projectDirectory: join(root, samples[0].path), requirements: {} },
    {
      projectDirectory: join(root, samples[0].path),
      projectScopes: ["packages/a"],
    },
  ]) {
    const response = await submit(input);
    assert.equal(response.status, "rejected", JSON.stringify(response));
    invalid.push("rejected");
  }
  const fault = await submit({
    projectDirectory: join(root, "projects/not-created"),
  });
  assert.equal(fault.status, "accepted");
  taskIds.push(fault.taskId);
  const canceled = await submit({
    projectDirectory: join(root, samples[0].path),
  });
  assert.equal(canceled.status, "accepted");
  taskIds.push(canceled.taskId);
  engine.cancelTask(canceled.taskId, caller);
  const drained = await engine.drain();
  const results = [];
  for (const sample of samples) {
    const task = drained.tasks.find((t) => t.taskId === sample.taskId);
    const run = drained.runs.find((r) => r.runId === task?.run?.runId);
    assert.ok(run?.reclaimedAt);
    assert.equal(run.stage, "completed", JSON.stringify(run));
    const output = run.output;
    assert.ok(output);
    const result = output.result;
    const documents = [
      result.documentation,
      ...(result.problems ?? []).map((p) => p.documentation),
    ];
    for (const path of new Set(documents)) {
      const actual = await textOutput(output, path);
      assert.deepEqual(
        actual,
        Buffer.from(await readBytes(car.tree, `resources/${path}`, 262144)),
      );
      const body = actual.toString("utf8");
      for (const match of body.matchAll(/\]\((\.\.\/\.\.\/assets\/[^)]+)\)/g)) {
        const target = posix.normalize(
          posix.join(posix.dirname(path), match[1]),
        );
        assert.ok(target.startsWith("assets/"));
        assert.deepEqual(
          await textOutput(output, target),
          Buffer.from(await readBytes(car.tree, `resources/${target}`, 262144)),
        );
      }
    }
    for (const name of [
      "AGENTS.md",
      "npm-publish.mjs",
      "npm-publish.yaml",
      "npm-ci.yaml",
    ]) {
      assert.deepEqual(
        await textOutput(output, `assets/${name}`),
        Buffer.from(
          await readBytes(car.tree, `resources/assets/${name}`, 262144),
        ),
      );
    }
    results.push({
      name: sample.name,
      pass: result.pass,
      expectedPass: sample.pass && !offline,
      problems: result.problems ?? [],
      documentationReadable: true,
      assetsExact: true,
      outputCid: output.cid,
      reclaimed: true,
    });
  }
  const failed = drained.tasks.find((t) => t.taskId === fault.taskId);
  assert.equal(failed.stage, "failed");
  assert.equal(failed.output, undefined);
  const stopped = drained.tasks.find((t) => t.taskId === canceled.taskId);
  assert.equal(stopped.canceled, true);
  assert.equal(stopped.output, undefined);
  for (const taskId of taskIds) {
    const task = drained.tasks.find((t) => t.taskId === taskId);
    if (task?.run) {
      const run = drained.runs.find((r) => r.runId === task.run.runId);
      assert.ok(run?.reclaimedAt);
    }
  }
  for (const [path, before] of snapshots)
    assert.deepEqual(await snapshot(path), before);
  await engine.close();
  assert.equal((await ipfsStore.read(car.cid)).cid.toString(), car.cid);
  report = {
    ok:
      results.every((r) => r.pass === r.expectedPass) &&
      (!offline ||
        results.every((r) =>
          r.problems.some((problem) => problem.code.endsWith("-unconfirmed")),
        )),
    transport: offline ? "injected-ip-connect-rejection" : "canonical-live",
    host: hostname(),
    platform: process.platform,
    node: process.version,
    bundleCid: car.cid,
    carBytes: bytes.length,
    carSha256: createHash("sha256").update(bytes).digest("hex"),
    dependencies: manifest.dependencies,
    authorSdkInstalled: false,
    authorCheckInstalled: false,
    engineEntry: await realpath(
      fileURLToPath(import.meta.resolve("@silvermoon-work/task-engine")),
    ),
    results,
    invalid,
    fault: failed.stage,
    cancel: stopped.canceled,
    reclaimed: true,
    configurationUnchanged: true,
    configurationSnapshot: "all-project-file-bytes-and-paths",
    borrowedContentSurvivedClose: true,
  };
  await writeFile(
    join(root, offline ? "offline-report.json" : "independent-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  assert.ok(
    report.ok,
    "One or more actual project conclusions did not match; inspect persisted report.",
  );
} finally {
  await engine.close();
  await ipfsStore.close();
  store.close();
  await car.close();
}
