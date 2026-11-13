import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Blob, Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import { exporter } from "ipfs-unixfs-exporter";

assert.equal(
  process.platform,
  "win32",
  "This evidence harness is for real nvm-windows, not Unix fixtures.",
);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const carPath = resolve(
  process.argv[2] ?? join(packageDirectory, "dist", "nodejs-toolchain.car"),
);
assert.ok(
  process.argv[3],
  "Supply the checksum-verified official 1.2.2 portable directory.",
);
const portable = resolve(process.argv[3]);
const sha256 = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const archive = join(dirname(portable), "nvm-noinstall.zip");
const archiveMd5 = createHash("md5")
  .update(await readFile(archive))
  .digest("hex");
const officialChecksum = (await readFile(`${archive}.checksum.txt`, "utf8"))
  .trim()
  .toLowerCase();
assert.equal(officialChecksum, "d654c26a04e35a318d5939f8ceb09934");
assert.equal(
  archiveMd5,
  officialChecksum,
  "Archive must match the official checksum asset.",
);
const archiveSha256 = await sha256(archive);
assert.equal(
  archiveSha256,
  "74232ea51c060ecd44ecf2cebee314ed9e3f6da56e1f9484d8d46c4e8bb6ae0e",
);
const nvmHash = await sha256(join(portable, "nvm.exe"));
assert.equal(
  nvmHash,
  "665b0b033e88098367381e929b71cfc96dc4058a3cb6fef760a0ccc9a883dd13",
  "Portable executable must match the verified official 1.2.2 artifact.",
);
const sourceNode = await realpath(process.execPath);
const sourceDirectory = dirname(sourceNode);
const sourceNpm = join(sourceDirectory, "node_modules", "npm");
const owned = join(packageDirectory, "dist", `nvm-managed-${randomUUID()}`);
const home = join(owned, "nvm");
const version = process.version;
assert.match(version, /^v\d+\.\d+\.\d+$/);
const managedVersion = join(home, version);
const current = join(owned, "current");
const unmanaged = join(owned, "unmanaged");
const npmOnly = join(owned, "npm-only");
const profile = join(owned, "profile");
const project = join(owned, "project");
const root = process.env.SystemRoot;
assert.ok(root);
const settings = `root: ${home}\npath: ${current}\narch: 64\nproxy: none\n`;
const car = await readTaskBundleCar(
  new Blob([await readFile(carPath)]).stream(),
);
const store = new MemoryStore();
const ipfsStore = IpfsStore.fromClient({ block: car.block });
const engine = createTaskEngine({
  store,
  ipfsStore,
  requestInputEnvelope: true,
  authorize: () => true,
  limits: { stopGraceMs: 5000, forceExitWaitMs: 5000 },
});
const caller = {
  scope: "portable-nvm-evidence",
  subject: "authorized-local-host",
};
const context = (path, npmPrefix) => ({
  projectDirectory: project,
  executionEnvironment: {
    path: [...path, home, join(root, "System32")],
    pathExtensions: [".COM", ".EXE", ".BAT", ".CMD"],
    home: profile,
    userProfile: profile,
    appData: profile,
    localAppData: profile,
    nvmHome: home,
    nvmSymlink: current,
    npmConfig: {
      userConfig: join(profile, ".npmrc"),
      globalConfig: join(profile, "global.npmrc"),
      ...(npmPrefix ? { prefix: npmPrefix } : {}),
    },
  },
});
const requirements = {
  tools: { node: {}, npm: {}, nvm: { minimumVersion: "1.2.2" } },
  pairing: { npmWithNode: true },
  management: { provider: "nvm", appliesTo: ["node", "npm"] },
};
const samples = [
  {
    name: "portable-nvm-managed-and-paired",
    context: context([current]),
    codes: [],
  },
  {
    name: "portable-nvm-unmanaged-tools",
    context: context([unmanaged]),
    codes: ["management-mismatch", "management-mismatch"],
  },
  {
    name: "portable-nvm-unmanaged-npm",
    context: context([npmOnly, current], npmOnly),
    codes: ["pairing-mismatch", "management-mismatch"],
  },
  {
    name: "portable-nvm-version-observation",
    context: context([current]),
    requirements: { tools: { nvm: { minimumVersion: "999" } } },
    codes: ["version-too-low"],
  },
];
let evidence;
async function copyNpm(target) {
  await mkdir(target, { recursive: true });
  await copyFile(join(sourceDirectory, "npm.cmd"), join(target, "npm.cmd"));
  await cp(sourceNpm, join(target, "node_modules", "npm"), { recursive: true });
}
async function accepted(request) {
  let submitted = await engine.submit(request, caller);
  const end = Date.now() + 30_000;
  while (submitted.status === "preparing" && Date.now() < end) {
    submitted = await engine.getRequestStatus(
      submitted.requestId,
      { waitMs: 100 },
      caller,
    );
    if (submitted.status === "preparing")
      await new Promise((done) => setTimeout(done, 10));
  }
  assert.equal(submitted.status, "accepted", JSON.stringify(submitted));
  return submitted.taskId;
}
try {
  await mkdir(owned);
  for (const path of [home, managedVersion, profile, project])
    await mkdir(path, { recursive: true });
  // Only copied official portable files are used. No setup, install, use or shared symlink is invoked.
  await cp(portable, home, { recursive: true });
  await copyFile(sourceNode, join(managedVersion, "node.exe"));
  await copyFile(
    join(sourceDirectory, "LICENSE"),
    join(managedVersion, "LICENSE"),
  );
  await copyNpm(managedVersion);
  await cp(managedVersion, unmanaged, { recursive: true });
  await copyNpm(npmOnly);
  assert.ok(
    relative(owned, current) &&
      !relative(owned, current).startsWith(`..${sep}`),
  );
  assert.ok(
    relative(owned, managedVersion) &&
      !relative(owned, managedVersion).startsWith(`..${sep}`),
  );
  await symlink(managedVersion, current, "junction");
  assert.equal(await realpath(current), await realpath(managedVersion));
  await writeFile(join(home, "settings.txt"), settings);
  const snapshots = new Map([
    [join(home, "settings.txt"), settings],
    [
      join(profile, ".npmrc"),
      "registry=https://owned.example.test/\n# keep this comment\n",
    ],
    [join(profile, "global.npmrc"), ""],
    [
      join(project, "package.json"),
      '{"private":true,"scripts":{"preinstall":"exit 99"}}\n',
    ],
  ]);
  for (const [path, content] of snapshots) await writeFile(path, content);
  const nodeHash = await sha256(sourceNode);
  assert.equal(await sha256(join(managedVersion, "node.exe")), nodeHash);
  assert.equal(await sha256(join(unmanaged, "node.exe")), nodeHash);
  const npmHash = await sha256(join(sourceNpm, "bin", "npm-cli.js"));
  for (const path of [managedVersion, unmanaged, npmOnly])
    assert.equal(
      await sha256(join(path, "node_modules", "npm", "bin", "npm-cli.js")),
      npmHash,
    );
  await engine.start();
  const tracked = [];
  for (const sample of samples) {
    tracked.push({
      ...sample,
      taskId: await accepted({
        requestId: newId(),
        bundle: car.cid,
        input: {
          context: sample.context,
          requirements: sample.requirements ?? requirements,
        },
        timeoutMs: 30_000,
      }),
    });
  }
  const drained = await engine.drain();
  const results = [];
  for (const sample of tracked) {
    const task = drained.tasks.find(
      (candidate) => candidate.taskId === sample.taskId,
    );
    const run = drained.runs.find(
      (candidate) => candidate.runId === task?.run?.runId,
    );
    assert.ok(run);
    assert.equal(
      run.stage,
      "completed",
      JSON.stringify({ sample: sample.name, run }),
    );
    assert.ok(run.reclaimedAt);
    assert.equal(run.exit.forced, false);
    assert.ok(run.output);
    const result = run.output.result;
    assert.equal(
      result.pass,
      sample.codes.length === 0,
      JSON.stringify({ sample: sample.name, result }),
    );
    assert.deepEqual(
      result.problems?.map((problem) => problem.code) ?? [],
      sample.codes,
    );
    if (sample.name === "portable-nvm-version-observation")
      assert.match(result.problems[0].brief, /当前 1\.2\.2，/);
    const documents = [
      result.documentation,
      ...(result.problems ?? []).map((problem) => problem.documentation),
    ];
    for (const path of new Set(documents)) {
      const file = await exporter(`${run.output.cid}/${path}`, {
        async *get(cid) {
          yield (
            store.readContentBlock(cid.toString()) ??
            (await car.block.get(cid.toString()))
          );
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
      pass: result.pass,
      codes: sample.codes,
      briefs: result.problems?.map((problem) => problem.brief) ?? [],
      outputCid: run.output.cid,
      documents: [...new Set(documents)],
      reclaimed: true,
    });
  }
  for (const [path, content] of snapshots)
    assert.equal(await readFile(path, "utf8"), content);
  assert.equal(await realpath(current), await realpath(managedVersion));
  assert.equal(await realpath(process.execPath), sourceNode);
  assert.equal(await sha256(sourceNode), nodeHash);
  assert.equal(await sha256(join(sourceNpm, "bin", "npm-cli.js")), npmHash);
  evidence = {
    ok: true,
    bundleCid: car.cid,
    nvm: {
      tag: "1.2.2",
      executableSha256: nvmHash,
      release: "https://github.com/nvm-windows/nvm/releases/tag/1.2.2",
      archiveMd5,
      archiveSha256,
    },
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: version,
    nodeSha256: nodeHash,
    npmCliSha256: npmHash,
    configurationUnchanged: true,
    sourceToolFilesUnchanged: true,
    privateCurrentLinkUnchanged: true,
    activationCommandsInvoked: false,
    results,
  };
} finally {
  await engine.close();
  await ipfsStore.close();
  store.close();
  await car.close();
  await rm(owned, { recursive: true, force: true });
}
await assert.rejects(access(owned), { code: "ENOENT" });
console.log(JSON.stringify({ ...evidence, ownedEnvironmentRemoved: true }));
