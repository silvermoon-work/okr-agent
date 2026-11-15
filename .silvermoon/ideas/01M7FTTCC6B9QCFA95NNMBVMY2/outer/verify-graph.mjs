import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Type } from "@sinclair/typebox";
import { defineChecker, executeCheck, checkerFromBundle, validateCheckReport } from "@silvermoon-work/check-task-sdk";
import { buildTaskBundle } from "@silvermoon-work/task-builder";
import { encodeTaskBundleCar, readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { directoryTree, writeStreamFile } from "@silvermoon-work/task-builder-cli/node";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { createTaskEngine, MemoryStore } from "@silvermoon-work/task-engine";
import { enginePort } from "./engine-port.mjs";
import contract from "./probe-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const author = process.argv[2];
const outside = (path) => {
  const delta = relative(author, path);
  assert.ok(isAbsolute(delta) || delta.startsWith(".."));
};
outside(directory);
for (const name of ["@silvermoon-work/check-task-sdk", "@silvermoon-work/task-engine", "@silvermoon-work/task-builder"])
  outside(await realpath(fileURLToPath(import.meta.resolve(name))));
const results = [];
const empty = Type.Object({}, { additionalProperties: false });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const check = (target, action) => defineChecker({ target, check: action });
const pass = (...children) => ({ pass: true, children });
const item = (checker, target = {}) => ({ checker, target });
const failure = (code = "local-only") => ({ pass: false, problems: [{ code, brief: "独立问题。" }] });
const signal = () => new AbortController().signal;

let sharedCalls = 0;
const value = Type.Object({ a: Type.Number(), b: Type.Number() }, { additionalProperties: false });
const registry = {
  root: check(empty, async () => pass(item("left"), item("right"), item("local"))),
  left: check(empty, async () => pass(item("shared", { a: 1, b: 2 }))),
  right: check(empty, async () => pass(item("shared", { b: 2, a: 1 }))),
  shared: check(value, async () => { sharedCalls++; return failure(); }),
  local: check(empty, async () => failure()),
};
const diamond = validateCheckReport(await executeCheck({ registry, root: item("root"), signal: signal() }));
assert.equal(sharedCalls, 1);
assert.equal(diamond.problems.length, 2);
const sharedNode = diamond.nodes.find((node) => node.item.checker === "shared");
assert.equal(diamond.edges.filter((edge) => edge.to === sharedNode.key).length, 2);
await executeCheck({ registry, root: item("root"), signal: signal() });
assert.equal(sharedCalls, 2);
results.push({ name: "canonical-diamond-and-execution-isolation", passed: true, nodes: diamond.nodes.length });

async function ordering(reverse) {
  const slow = deferred();
  const bothStarted = deferred();
  const starts = [];
  let active = 0;
  let maximum = 0;
  const local = {
    root: check(empty, async () => pass(item("slow"), item("fast"))),
    slow: check(empty, async () => {
      starts.push("slow"); maximum = Math.max(maximum, ++active);
      if (reverse) await bothStarted.promise;
      else await slow.promise;
      active--;
      return failure();
    }),
    fast: check(empty, async () => {
      starts.push("fast"); maximum = Math.max(maximum, ++active);
      bothStarted.resolve();
      active--;
      return pass(item("child"));
    }),
    child: check(empty, async () => {
      starts.push("child"); maximum = Math.max(maximum, ++active);
      slow.resolve(); active--;
      return failure();
    }),
  };
  const result = await executeCheck({ registry: local, root: item("root"), signal: signal(), limits: { concurrency: 2 } });
  assert.ok(maximum <= 2);
  assert.equal(maximum, 2);
  assert.deepEqual(starts, ["slow", "fast", "child"]);
  return result;
}
assert.deepEqual(await ordering(false), await ordering(true));
results.push({ name: "fifo-concurrency-no-level-barrier-stable-report", passed: true });

const controller = new AbortController();
const started = deferred();
const cleaned = deferred();
let childCalls = 0;
let settled = false;
const canceled = executeCheck({
  registry: {
    root: check(empty, async () => pass(item("waiting"))),
    waiting: check(empty, async (_target, currentSignal) => {
      started.resolve();
      await new Promise((resolve) => currentSignal.addEventListener("abort", resolve, { once: true }));
      await cleaned.promise;
      return pass(item("late"));
    }),
    late: check(empty, async () => { childCalls++; return pass(); }),
  },
  root: item("root"), signal: controller.signal,
});
const observed = canceled.then(() => { settled = true; }, () => { settled = true; });
await started.promise;
controller.abort(new Error("Host graph cancellation"));
await delay(0);
assert.equal(settled, false);
cleaned.resolve();
await assert.rejects(canceled, /Host graph cancellation/);
await observed;
assert.equal(childCalls, 0);
results.push({ name: "local-midflight-abort-waits-cleanup-no-late-child", passed: true });

await writeFile(join(directory, "probe-check.md"), "# 独立检查\n受控组合验证。\n");
await writeFile(join(directory, "probe-problem.md"), "# 子问题\n独立子输出文档。\n");
const tree = await buildTaskBundle(await directoryTree(directory), {
  name: "Independent v2 Check graph probe",
  runtime: { minVersion: "22.15.0" },
  source: { entry: "probe-graph-worker.mjs", contract, mode: "explicit" },
  include: [
    { from: "probe-check.md", to: "resources/references/check.md" },
    { from: "probe-problem.md", to: "resources/references/problems/child-only.md" },
  ],
});
const encoded = await encodeTaskBundleCar(tree);
await rm(join(directory, "graph-probe.car"), { force: true });
try { await writeStreamFile(encoded.stream, join(directory, "graph-probe.car")); }
finally { await encoded.close(); }
const bytes = await readFile(join(directory, "graph-probe.car"));
const car = await readTaskBundleCar(new Blob([bytes]).stream(), { expectedCid: encoded.cid });
const store = new MemoryStore();
const content = IpfsStore.fromClient({ block: car.block });
const caller = { subject: "independent-graph-consumer", scope: "graph-outer" };
const engine = createTaskEngine({
  store, ipfsStore: content, requestInputEnvelope: true,
  authorize: (who, _op, scope) => who.scope === scope,
});
const calls = [];
const readOutput = IpfsStore.fromClient({
  block: {
    async get(cid) {
      return store.readContentBlock(cid) ?? await car.block.get(cid);
    },
  },
});
async function markerStarted(marker) {
  const deadline = Date.now() + 10000;
  for (;;) {
    try { assert.equal(await readFile(`${marker}.started`, "utf8"), "checker-started\n"); return; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      assert.ok(Date.now() < deadline, "Checker never entered its operation");
      await delay(10);
    }
  }
}
try {
  await engine.start();
  const execute = enginePort(engine, caller, calls);
  const port = { execute: ({ bundleCid, input, signal }) => execute(bundleCid, input, signal) };
  const remote = checkerFromBundle({ bundleCid: car.cid, contract, port });
  const passReport = await executeCheck({
    registry: { remote }, root: item("remote", { mode: "pass", marker: join(directory, "unused-pass") }), signal: signal(),
  });
  assert.equal(passReport.pass, true);
  const target = { mode: "fail", marker: join(directory, "unused-fail") };
  const mixed = await executeCheck({
    registry: {
      root: check(empty, async () => pass(item("branch"), item("remote", target), item("local"))),
      branch: check(empty, async () => pass(item("remote", target))),
      remote,
      local: check(empty, async () => failure()),
    }, root: item("root"), signal: signal(), problemCodes: ["local-only"],
  });
  validateCheckReport(mixed);
  assert.equal(calls.length, 2);
  assert.equal(mixed.nodes.length, 4);
  assert.equal(mixed.problems.length, 2);
  const foreign = mixed.problems.find((problem) => problem.code === "child-only");
  assert.equal(foreign.source.kind, "output");
  assert.equal(foreign.source.outputCid, calls[1].outputCid);
  assert.equal(foreign.source.bundleCid, car.cid);
  const document = await readOutput.read(`${foreign.source.outputCid}/${foreign.documentation}`);
  assert.ok(document.type === "file" || document.type === "raw");
  const chunks = [];
  for await (const chunk of document.content()) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString("utf8"), await readFile(join(directory, "probe-problem.md"), "utf8"));
  results.push({ name: "bundle-leaf-mixed-provenance-and-dedup", passed: true, outputCid: foreign.source.outputCid });

  for (const mode of ["cancel", "sibling-fault"]) {
    const marker = join(directory, `graph-${mode}`);
    await rm(`${marker}.started`, { force: true });
    await rm(`${marker}.cleaned`, { force: true });
    const current = new AbortController();
    const localCalls = [];
    const operating = deferred();
    const invoke = enginePort(engine, caller, localCalls, async ({ input }) => {
      await markerStarted(input.marker);
      operating.resolve();
      if (mode === "cancel") current.abort(new Error("Remote graph cancellation"));
    });
    const child = checkerFromBundle({
      bundleCid: car.cid, contract,
      port: { execute: ({ bundleCid, input, signal }) => invoke(bundleCid, input, signal) },
    });
    const execution = executeCheck({
      registry: {
        root: check(empty, async () => pass(item("remote", { mode: "wait", marker }), ...(mode === "sibling-fault" ? [item("fault")] : []))),
        remote: child,
        fault: check(empty, async () => { await operating.promise; throw new Error("Independent sibling failure"); }),
      }, root: item("root"), signal: current.signal, limits: { concurrency: 2 },
    });
    await assert.rejects(execution, mode === "cancel" ? /Remote graph cancellation/ : /Independent sibling failure/);
    assert.equal(await readFile(`${marker}.cleaned`, "utf8"), "checker-cleaned\n");
    assert.equal(localCalls.length, 1);
    assert.equal(localCalls[0].observedStarted, true);
    assert.equal(localCalls[0].canceled, true);
    assert.equal(localCalls[0].reclaimed, true);
    results.push({ name: `bundle-${mode}-after-operation-start-and-release`, passed: true, task: localCalls[0] });
    calls.push(...localCalls);
  }
  await content.prepare(car.cid);
} finally {
  await engine.close();
  await readOutput.close();
  store.close();
  await content.close();
  await car.close();
}
const sdkHash = createHash("sha256").update(await readFile(join(directory, "check-task-sdk.tgz"))).digest("hex");
assert.equal(sdkHash, "39306812d00ff01e8d10dff0be3ad68923c055409032e614bf03e468409e6821");
const report = {
  observedAt: new Date().toISOString(), node: process.version, platform: process.platform, architecture: process.arch,
  sdkSha256: sdkHash, dependenciesOutsideAuthor: true,
  fixture: { cid: encoded.cid, sha256: createHash("sha256").update(bytes).digest("hex"), role: "controlled-v2-graph-not-production" },
  results, calls, passed: true,
};
await writeFile(join(directory, "graph-consumer-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: true, checks: results.length, tasks: calls.length, fixtureCid: encoded.cid }));
