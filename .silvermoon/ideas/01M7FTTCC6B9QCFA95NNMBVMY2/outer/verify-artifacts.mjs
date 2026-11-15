import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { createTaskEngine, MemoryStore } from "@silvermoon-work/task-engine";
import { validateCheckReport } from "@silvermoon-work/check-task-sdk";
import { enginePort } from "./engine-port.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const author = process.argv[2];
for (const name of ["@silvermoon-work/task-engine", "@silvermoon-work/check-task-sdk"]) {
  const path = await realpath(fileURLToPath(import.meta.resolve(name)));
  const delta = relative(author, path);
  assert.ok(isAbsolute(delta) || delta.startsWith(".."), "Consumer linked author sources");
}
for (const name of ["@silvermoon-work/check.nodejs-toolchain", "@silvermoon-work/check.typescript-project"])
  assert.throws(() => import.meta.resolve(name), (error) => error.code === "ERR_MODULE_NOT_FOUND");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function snapshot(root) {
  const entries = [];
  async function visit(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const full = join(path, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) await visit(full);
      else entries.push([relative(root, full).replaceAll("\\", "/"), digest(await readFile(full))]);
    }
  }
  await visit(root);
  return digest(JSON.stringify(entries));
}
const project = join(directory, "toolchain-target");
await mkdir(project, { recursive: true });
await writeFile(join(project, "package.json"), '{"private":true}\n');
await writeFile(join(project, "user.npmrc"), "registry=https://graph.consumer.example.test/\n");
await writeFile(join(project, "global.npmrc"), "# isolated\n");
const env = {
  path: [join(directory, "owned-node-npm")],
  pathExtensions: [".COM", ".EXE", ".BAT", ".CMD"],
  home: project, userProfile: project, appData: project, localAppData: project,
  npmConfig: { userConfig: join(project, "user.npmrc"), globalConfig: join(project, "global.npmrc"), prefix: join(directory, "owned-node-npm") },
};
const input = (requirements, environment = env) => ({
  context: { projectDirectory: project, executionEnvironment: environment }, requirements,
});
const emptyProject = join(directory, "ts-empty");
await mkdir(emptyProject, { recursive: true });
const ts = (name) => ({ projectDirectory: join(directory, `ts-${name}`) });
const specs = [
  {
    name: "toolchain-production", file: "toolchain.car",
    cid: "bafybeidrewa4ommkoogtndb5idog2cfn5xuhjstnsb2hxm4l6nd6tm7taa",
    sha256: "d98229bbadc311591ace3d14041341d713d1aebcf60ecd7950aa6dfe5e2cf24f",
    cases: [
      { name: "node-pass", input: input({ tools: { node: {} } }), codes: [] },
      { name: "npm-pairing-registry-pass", input: input({ tools: { node: {}, npm: {} }, pairing: { npmWithNode: true }, registries: { active: { npm: { allowedUrls: ["https://graph.consumer.example.test/"] } } } }), codes: [] },
      { name: "low-version-independent-registry", input: input({ tools: { node: { minimumVersion: "999" }, npm: { minimumVersion: "999" } }, registries: { active: { npm: { allowedUrls: ["https://different.example.test/"] } } } }), codes: ["version-too-low", "version-too-low", "registry-mismatch"] },
      { name: "missing-tool-local-pruning", input: input({ tools: { node: { minimumVersion: "999" }, npm: {} }, pairing: { npmWithNode: true }, registries: { active: { npm: { allowedUrls: ["https://graph.consumer.example.test/"] } } } }, { ...env, path: [join(directory, "..", "node-v26.13.1")] }), codes: ["version-too-low", "tool-missing"] },
      { name: "execution-fault", input: { ...input({ tools: { node: {} } }), context: { projectDirectory: join(directory, "not-created"), executionEnvironment: env } }, fault: true },
    ],
  },
  {
    name: "typescript-production", file: "typescript.car",
    cid: "bafybeiaqow5thznglyi4ufkulzrk5fel5bc5zl77xya6qvnbmt55ujcnci",
    sha256: "2bda7acb3c901f4ca2547d4d0c8cda42081367013a91d46b5726bf0aec338709",
    assets: true,
    cases: [
      { name: "missing-scope-independent-root", input: { projectDirectory: emptyProject }, required: ["scope-unconfirmed", "document-missing", "environment-missing"] },
      { name: "invalid-path-fault", input: { projectDirectory: "relative" }, fault: true },
    ],
  },
  {
    name: "typescript-deterministic-not-production", file: "typescript-fixture.car",
    cid: "bafybeid6vx2qztpjyp732yqixxwz2yt2p2dpguodrwhoa3d5yjohawalsa",
    sha256: "40eda472726ede7645623baad889ab666ddff916dc55549917105f7771e8dc0b",
    assets: true,
    cases: [
      { name: "ordinary-pass", input: ts("good"), codes: [] },
      { name: "npm-pass", input: ts("npm"), codes: [] },
      { name: "independent-multiple-findings", input: ts("bad"), required: ["gate-missing", "coverage-mismatch", "document-mismatch"] },
      { name: "member-pruning", input: ts("member-pruning"), codes: ["scope-unconfirmed", "document-mismatch"] },
    ],
  },
];
const evidence = { observedAt: new Date().toISOString(), node: process.version, platform: process.platform, architecture: process.arch, archives: [], cases: [], passed: false };
for (const spec of specs) {
  const bytes = await readFile(join(directory, spec.file));
  assert.equal(digest(bytes), spec.sha256);
  const car = await readTaskBundleCar(new Blob([bytes]).stream(), { expectedCid: spec.cid });
  evidence.archives.push({ name: spec.name, cid: car.cid, sha256: spec.sha256, bytes: bytes.length });
  const store = new MemoryStore();
  const content = IpfsStore.fromClient({ block: car.block });
  const outputs = IpfsStore.fromClient({ block: { async get(cid) { return store.readContentBlock(cid) ?? await car.block.get(cid); } } });
  const engine = createTaskEngine({ store, ipfsStore: content, requestInputEnvelope: true, authorize: (caller, _op, scope) => caller.scope === scope });
  const calls = [];
  const execute = enginePort(engine, { subject: "independent-artifact-consumer", scope: spec.name }, calls);
  try {
    await engine.start();
    for (const sample of spec.cases) {
      const targetPath = sample.input.projectDirectory ?? sample.input.context.projectDirectory;
      const before = sample.fault ? undefined : await snapshot(targetPath);
      if (sample.fault) {
        await assert.rejects(execute(car.cid, sample.input, new AbortController().signal));
        assert.equal(calls.at(-1).runStage, "failed");
        assert.equal(calls.at(-1).reclaimed, true);
        evidence.cases.push({ archive: spec.name, name: sample.name, stage: "failed", reclaimed: true });
        continue;
      }
      const output = await execute(car.cid, sample.input, new AbortController().signal);
      const report = validateCheckReport(output.result);
      const codes = report.pass ? [] : report.problems.map((problem) => problem.code);
      if (sample.codes) assert.deepEqual([...codes].sort(), [...sample.codes].sort(), JSON.stringify(report));
      if (sample.required) {
        assert.equal(report.pass, false);
        for (const code of sample.required) assert.ok(codes.includes(code), JSON.stringify(report));
      }
      const documents = new Set([report.documentation]);
      if (!report.pass) for (const problem of report.problems) {
        assert.equal(problem.source.kind, "local");
        documents.add(problem.documentation);
      }
      for (const path of documents) {
        const node = await outputs.read(`${output.cid}/${path}`);
        assert.ok(node.type === "file" || node.type === "raw");
        const chunks = [];
        for await (const chunk of node.content()) chunks.push(chunk);
        assert.deepEqual(Buffer.concat(chunks), Buffer.from(await readBytes(car.tree, `resources/${path}`, 1048576)));
      }
      const assets = spec.assets ? ["AGENTS.md", "commands.mjs", "npm-publish.mjs", "deliverables.mjs"] : [];
      for (const name of assets) {
        const node = await outputs.read(`${output.cid}/assets/${name}`);
        assert.ok(node.type === "file" || node.type === "raw");
        const chunks = [];
        for await (const chunk of node.content()) chunks.push(chunk);
        assert.deepEqual(Buffer.concat(chunks), Buffer.from(await readBytes(car.tree, `resources/assets/${name}`, 1048576)));
      }
      assert.equal(await snapshot(targetPath), before);
      evidence.cases.push({ archive: spec.name, name: sample.name, pass: report.pass, codes, nodes: report.nodes.length, edges: report.edges.length, outputCid: output.cid, documents: [...documents], assets, targetUnchanged: true, reclaimed: calls.at(-1).reclaimed });
    }
    await engine.close();
    await content.prepare(car.cid);
  } finally {
    await engine.close();
    await outputs.close();
    store.close();
    await content.close();
    await car.close();
  }
}
evidence.passed = true;
await writeFile(join(directory, "artifact-consumer-report.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ passed: true, archives: evidence.archives.length, cases: evidence.cases.length }));
