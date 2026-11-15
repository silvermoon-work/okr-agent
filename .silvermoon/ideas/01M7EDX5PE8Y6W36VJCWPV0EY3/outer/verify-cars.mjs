import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
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

const directory = dirname(fileURLToPath(import.meta.url));
const configuration = JSON.parse(await readFile(process.argv[2], "utf8"));
const forbidden = resolve(configuration.authorRoot);
const within = (root, path) => {
  const delta = relative(root, path);
  return (
    delta === "" ||
    (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`))
  );
};
async function snapshot(root) {
  const entries = [];
  async function visit(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const full = resolve(path, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) await visit(full);
      else
        entries.push([
          relative(root, full).replaceAll("\\", "/"),
          createHash("sha256").update(await readFile(full)).digest("hex"),
        ]);
    }
  }
  await visit(root);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
assert.equal(within(forbidden, directory), false);
const dependencies = {};
for (const name of [
  "@silvermoon-work/task-engine",
  "@silvermoon-work/task-builder",
  "@silvermoon-work/ipfs-store",
  "ipfs-unixfs-exporter",
]) {
  const location = await realpath(fileURLToPath(import.meta.resolve(name)));
  assert.equal(within(forbidden, location), false, `${name} links to author`);
  dependencies[name] = "published dependency resolved outside author repository";
}
for (const name of [
  "@silvermoon-work/check.nodejs-toolchain",
  "@silvermoon-work/check.typescript-project",
]) {
  assert.throws(
    () => import.meta.resolve(name),
    (error) => error.code === "ERR_MODULE_NOT_FOUND",
    `${name} must not be installed`,
  );
}

const report = {
  observedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  dependencies,
  authorPackagesInstalled: false,
  remotePublication: false,
  archives: [],
  results: [],
};
for (const item of configuration.archives) {
  const path = await realpath(resolve(directory, item.path));
  assert.equal(within(directory, path), true);
  const bytes = await readFile(path);
  const car = await readTaskBundleCar(new Blob([bytes]).stream(), {
    expectedCid: item.cid,
  });
  const identity = {
    name: item.name,
    role: item.role,
    cid: car.cid,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
  report.archives.push(identity);
  try {
    for (const sample of item.samples) {
      const projectDirectory =
        sample.input.projectDirectory ?? sample.input.context.projectDirectory;
      const targetBefore = sample.fault
        ? undefined
        : await snapshot(projectDirectory);
      const store = new MemoryStore();
      const content = IpfsStore.fromClient({ block: car.block });
      const engine = createTaskEngine({
        store,
        ipfsStore: content,
        requestInputEnvelope: true,
        authorize: (caller, _operation, scope) => caller.scope === scope,
      });
      const caller = {
        subject: "authorized-independent-consumer",
        scope: "target-checker-consumer",
      };
      try {
        await engine.start();
        const requestId = newId();
        let submitted = await engine.submit(
          {
            requestId,
            bundle: car.cid,
            input: sample.input,
            timeoutMs: sample.timeoutMs ?? 60000,
          },
          caller,
        );
        const deadline = Date.now() + 60000;
        while (submitted.status === "preparing" && Date.now() < deadline) {
          submitted = await engine.getRequestStatus(
            requestId,
            { waitMs: 1000 },
            caller,
          );
        }
        assert.equal(submitted.status, "accepted", JSON.stringify(submitted));
        if (sample.cancel) engine.cancelTask(submitted.taskId, caller);
        const drained = await engine.drain({
          signal: AbortSignal.timeout(90000),
        });
        assert.equal(drained.rejections.length, 0);
        const task = drained.tasks.find(
          (entry) => entry.taskId === submitted.taskId,
        );
        assert.ok(task, `${sample.name}: missing Task`);
        const run = drained.runs.find(
          (entry) => entry.runId === task.run?.runId,
        );
        if (sample.cancel) {
          assert.equal(task.canceled, true, JSON.stringify(task));
          if (run) {
            assert.ok(run.reclaimedAt);
            assert.equal(run.output, undefined);
          }
          report.results.push({
            archive: item.name,
            name: sample.name,
            canceled: true,
            stage: task.stage,
            runStarted: Boolean(run),
            reclaimed: !run || Boolean(run.reclaimedAt),
            targetUnchanged: true,
          });
          continue;
        }
        assert.ok(run, `${sample.name}: missing Run`);
        assert.ok(run.reclaimedAt, `${sample.name}: Run not reclaimed`);
        if (sample.fault) {
          assert.equal(run.stage, "failed", JSON.stringify(run));
          assert.equal(run.output, undefined);
          report.results.push({
            archive: item.name,
            name: sample.name,
            stage: run.stage,
            reclaimed: true,
          });
          continue;
        }
        assert.equal(run.stage, "completed", JSON.stringify(run));
        assert.ok(run.output);
        const result = run.output.result;
        assert.equal(result.pass, sample.pass, JSON.stringify(result));
        const actualCodes = (result.problems ?? []).map(
          (problem) => problem.code,
        );
        if (sample.codes) assert.deepEqual(actualCodes, sample.codes);
        for (const code of sample.requiredCodes ?? [])
          assert.ok(actualCodes.includes(code), JSON.stringify(result));
        for (const code of sample.forbiddenCodes ?? [])
          assert.equal(actualCodes.includes(code), false, JSON.stringify(result));
        assert.equal("problems" in result, !sample.pass);
        const documents = new Set([
          result.documentation,
          ...(result.problems ?? []).map((problem) => problem.documentation),
        ]);
        for (const problem of result.problems ?? [])
          assert.deepEqual(Object.keys(problem).sort(), [
            "brief",
            "code",
            "documentation",
          ]);
        const blockstore = {
          async *get(cid) {
            const retained = store.readContentBlock(cid.toString());
            yield retained === undefined
              ? await car.block.get(cid.toString())
              : retained;
          },
        };
        for (const document of documents) {
          const node = await exporter(`${run.output.cid}/${document}`, blockstore);
          assert.ok(node.type === "file" || node.type === "raw");
          const chunks = [];
          for await (const chunk of node.content()) chunks.push(chunk);
          assert.deepEqual(
            Buffer.concat(chunks),
            Buffer.from(
              await readBytes(car.tree, `resources/${document}`, 262144),
            ),
          );
        }
        const assets = [];
        for (const asset of sample.assets ?? []) {
          const node = await exporter(
            `${run.output.cid}/assets/${asset}`,
            blockstore,
          );
          assert.ok(node.type === "file" || node.type === "raw");
          const chunks = [];
          for await (const chunk of node.content()) chunks.push(chunk);
          assert.deepEqual(
            Buffer.concat(chunks),
            Buffer.from(
              await readBytes(car.tree, `resources/assets/${asset}`, 1048576),
            ),
          );
          assets.push(asset);
        }
        await content.prepare(car.cid);
        report.results.push({
          archive: item.name,
          name: sample.name,
          stage: run.stage,
          pass: result.pass,
          problems: actualCodes,
          outputCid: run.output.cid,
          documents: [...documents],
          assets,
          reclaimed: true,
          callerContentStillOpenAfterDrain: true,
          targetUnchanged: true,
        });
      } finally {
        await engine.close();
        store.close();
        await content.close();
        if (targetBefore !== undefined)
          assert.equal(
            await snapshot(projectDirectory),
            targetBefore,
            `${sample.name}: target was modified`,
          );
      }
    }
  } finally {
    await car.close();
  }
}
report.passed = true;
await writeFile(
  resolve(directory, configuration.reportPath),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    passed: true,
    archives: report.archives,
    scenarios: report.results.length,
    reportPath: configuration.reportPath,
  }),
);
