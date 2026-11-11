import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import { exporter } from "ipfs-unixfs-exporter";

const directory = dirname(fileURLToPath(import.meta.url));
const carPath = resolve(process.argv[2] ?? "nodejs-toolchain.car");
const expectedCid = process.argv[3];
const forbiddenRoot = process.argv[4] && resolve(process.argv[4]);
assert.ok(expectedCid, "Supply the independently verified Bundle root CID.");
assert.equal(process.platform, "win32", "This evidence targets Windows.");
const within = (root, path) => {
  const delta = relative(root, path);
  return (
    delta === "" ||
    (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`))
  );
};
assert.ok(within(directory, carPath), "Copy the CAR into the consumer tree.");
if (forbiddenRoot) assert.equal(within(forbiddenRoot, directory), false);
const require = createRequire(import.meta.url);
for (const name of [
  "@silvermoon-work/check.nodejs-toolchain",
  "@silvermoon-work/check-task-sdk",
]) {
  assert.throws(
    () => require.resolve(name),
    (error) => error.code === "MODULE_NOT_FOUND",
    `${name} must not be installed in this independent consumer.`,
  );
}
const dependencies = {};
for (const name of [
  "@silvermoon-work/task-engine",
  "@silvermoon-work/task-builder",
  "ipfs-unixfs-exporter",
]) {
  const path = await realpath(require.resolve(name));
  if (forbiddenRoot) assert.equal(within(forbiddenRoot, path), false);
  dependencies[name] = "published dependency outside author repository";
}

const archive = await readFile(carPath);
const car = await readTaskBundleCar(new Blob([archive]).stream());
assert.equal(car.cid, expectedCid);
const store = new MemoryStore();
const engine = createTaskEngine({
  store,
  ipfsClient: { block: car.block },
  requestInputEnvelope: true,
  authorize: () => true,
});
const owned = join(directory, `owned-context-${randomUUID()}`);
const project = join(owned, "project");
const userConfig = join(owned, "user.npmrc");
const globalConfig = join(owned, "global.npmrc");
const sourceNode = await realpath(process.execPath);
const toolDirectory = dirname(sourceNode);
const systemRoot = process.env.SystemRoot;
assert.ok(systemRoot && isAbsolute(systemRoot));
const executionEnvironment = {
  path: [toolDirectory, join(systemRoot, "System32")],
  pathExtensions: [".COM", ".EXE", ".BAT", ".CMD"],
  home: owned,
  userProfile: owned,
  appData: owned,
  localAppData: owned,
  npmConfig: {
    userConfig,
    globalConfig,
    prefix: toolDirectory,
  },
};
const input = (requirements, environment = executionEnvironment) => ({
  context: { projectDirectory: project, executionEnvironment: environment },
  requirements,
});
const samples = [
  {
    name: "independent-node",
    input: input({ tools: { node: {} } }),
    codes: [],
  },
  {
    name: "independent-pairing-and-user-registry",
    input: input({
      tools: { node: {}, npm: {} },
      pairing: { npmWithNode: true },
      registries: {
        active: {
          npm: {
            allowedUrls: ["https://user.consumer.example.test/"],
          },
        },
      },
    }),
    codes: [],
  },
  {
    name: "independent-environment-registry",
    input: input(
      {
        tools: { npm: {} },
        registries: {
          active: {
            npm: {
              allowedUrls: ["https://environment.consumer.example.test/"],
            },
          },
        },
      },
      {
        ...executionEnvironment,
        npmConfig: {
          ...executionEnvironment.npmConfig,
          registry: "https://environment.consumer.example.test/",
        },
      },
    ),
    codes: [],
  },
  {
    name: "independent-multiple-problems",
    input: input({
      tools: {
        node: { minimumVersion: "999" },
        npm: { minimumVersion: "999" },
      },
      registries: {
        active: {
          npm: { allowedUrls: ["https://other.consumer.example.test/"] },
        },
      },
    }),
    codes: ["version-too-low", "version-too-low", "registry-mismatch"],
  },
  {
    name: "independent-execution-fault",
    input: {
      ...input({ tools: { node: {} } }),
      context: {
        projectDirectory: join(owned, "not-created"),
        executionEnvironment,
      },
    },
    fault: true,
  },
];
const snapshots = new Map([
  [userConfig, "registry=https://user.consumer.example.test/\n# preserve\n"],
  [globalConfig, ""],
  [join(project, "package.json"), '{"private":true}\n'],
]);
const caller = { scope: "independent-car", subject: "authorized-local-host" };
const results = [];
try {
  await mkdir(project, { recursive: true });
  for (const [path, content] of snapshots) await writeFile(path, content);
  await engine.start();
  for (const sample of samples) {
    let response = await engine.submit(
      {
        requestId: newId(),
        bundle: car.cid,
        input: sample.input,
        timeoutMs: 30_000,
      },
      caller,
    );
    const deadline = Date.now() + 30_000;
    while (response.status === "preparing" && Date.now() < deadline) {
      response = await engine.getRequestStatus(
        response.requestId,
        { waitMs: 100 },
        caller,
      );
    }
    assert.equal(response.status, "accepted", JSON.stringify(response));
    sample.taskId = response.taskId;
  }
  const drained = await engine.drain();
  for (const sample of samples) {
    const task = drained.tasks.find((item) => item.taskId === sample.taskId);
    const run = drained.runs.find((item) => item.runId === task?.run?.runId);
    assert.ok(run);
    assert.ok(run.reclaimedAt);
    assert.equal(run.exit.forced, false);
    if (sample.fault) {
      assert.equal(run.stage, "failed");
      assert.equal(run.output, undefined);
      results.push({ name: sample.name, stage: run.stage, reclaimed: true });
      continue;
    }
    assert.equal(run.stage, "completed", JSON.stringify(run));
    assert.ok(run.output);
    const result = run.output.result;
    assert.equal(result.pass, sample.codes.length === 0);
    assert.deepEqual(
      result.problems?.map((problem) => problem.code) ?? [],
      sample.codes,
    );
    assert.equal("problems" in result, sample.codes.length > 0);
    for (const problem of result.problems ?? [])
      assert.deepEqual(Object.keys(problem).sort(), [
        "brief",
        "code",
        "documentation",
      ]);
    const documents = [
      result.documentation,
      ...(result.problems ?? []).map((problem) => problem.documentation),
    ];
    for (const path of new Set(documents)) {
      const file = await exporter(`${run.output.cid}/${path}`, {
        async *get(cid) {
          yield store.readContentBlock(cid.toString()) ??
            (await car.block.get(cid.toString()));
        },
      });
      assert.ok(file.type === "file" || file.type === "raw");
      const chunks = [];
      for await (const chunk of file.content()) chunks.push(chunk);
      const actual = Buffer.concat(chunks);
      assert.deepEqual(
        actual,
        Buffer.from(await readBytes(car.tree, `resources/${path}`, 262144)),
      );
      assert.match(actual.toString("utf8"), /[\u4e00-\u9fff]/);
    }
    results.push({
      name: sample.name,
      stage: run.stage,
      pass: result.pass,
      problems: sample.codes,
      outputCid: run.output.cid,
      documents: [...new Set(documents)],
      reclaimed: true,
    });
  }
  for (const [path, content] of snapshots)
    assert.equal(await readFile(path, "utf8"), content);
  assert.equal(await realpath(process.execPath), sourceNode);
} finally {
  await engine.close();
  store.close();
  await car.close();
  await rm(owned, { recursive: true, force: true });
}
await assert.rejects(access(owned), { code: "ENOENT" });
console.log(
  JSON.stringify({
    ok: true,
    bundleCid: expectedCid,
    carSha256: createHash("sha256").update(archive).digest("hex"),
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    dependencies,
    authorPackageInstalled: false,
    authorSdkInstalled: false,
    configurationUnchanged: true,
    ownedEnvironmentRemoved: true,
    results,
  }),
);
