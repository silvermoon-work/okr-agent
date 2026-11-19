import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { readTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import {
  createTaskEngine,
  MemoryStore,
  newId,
} from "@silvermoon-work/task-engine";
import { exporter } from "ipfs-unixfs-exporter";
import { deviceFixture } from "./lib/device-fixture.mjs";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fixture = args.includes("--fixture");
let carPath = join(directory, "dist", "nodejs-toolchain.car");
let parameters = {};
let sourceSelected = false;
let parameterSelected = false;
for (let index = 0; index < args.length; index++) {
  const value = args[index];
  if (value === "--fixture") continue;
  if (value === "--parameters" && args[index + 1] && !parameterSelected) {
    parameters = JSON.parse(await readFile(resolve(args[++index]), "utf8"));
    parameterSelected = true;
  } else if (!value.startsWith("-") && !sourceSelected) {
    carPath = resolve(value);
    sourceSelected = true;
  } else
    throw new Error("Usage: smoke [CAR] [--fixture | --parameters JSON-file]");
}
if (fixture && parameterSelected)
  throw new Error("Fixture mode owns its business cases.");
const owned = await mkdtemp(join(tmpdir(), "toolchain-car-device-"));
let car;
let content;
let engine;
try {
  const controlled = fixture ? await deviceFixture(owned) : undefined;
  const keys = [
    "PATH",
    "PATHEXT",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "XDG_CONFIG_HOME",
    "NVM_DIR",
    "NVM_HOME",
    "NVM_SYMLINK",
    "PNPM_HOME",
    "TEMP",
    "TMP",
    "npm_config_userconfig",
    "npm_config_globalconfig",
    "npm_config_prefix",
    "npm_config_registry",
    "npm_config_global",
    "npm_config_location",
  ];
  const workerEnv =
    controlled?.environment ??
    Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const digest = async (path) =>
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const before = await Promise.all(
    (controlled?.configurationFiles ?? []).map(digest),
  );
  car = await readTaskBundleCar(new Blob([await readFile(carPath)]).stream());
  const store = new MemoryStore();
  content = IpfsStore.fromClient({ block: car.block });
  engine = createTaskEngine({
    store,
    ipfsStore: content,
    authorize: () => true,
    workerEnv,
    limits: { stopGraceMs: 5000, forceExitWaitMs: 5000 },
  });
  await engine.start();
  const caller = { scope: "device-toolchain", subject: "device-toolchain" };
  const cases = fixture
    ? [
        { name: "baseline", parameters: {}, pass: true },
        {
          name: "minimum",
          parameters: { minimumVersions: { nvm: "99999999999999999999" } },
          pass: false,
          code: "nvm-installation-version-valid",
        },
        {
          name: "registry",
          parameters: {
            additionalRegistries: [
              { name: "missing", url: "https://missing.example.test/" },
            ],
            defaultRegistry: "missing",
          },
          pass: false,
          code: "nrm-configuration-registration-present",
        },
      ]
    : [{ name: "device", parameters }];
  const results = [];
  for (const sample of cases) {
    let submitted = await engine.submit(
      {
        requestId: newId(),
        bundle: car.cid,
        parameters: { data: sample.parameters, cidPaths: [] },
        timeoutMs: 60_000,
      },
      caller,
    );
    const deadline = Date.now() + 70_000;
    while (submitted.status === "preparing" && Date.now() < deadline)
      submitted = await engine.getRequestStatus(
        submitted.requestId,
        { waitMs: 100 },
        caller,
      );
    assert.equal(submitted.status, "accepted", JSON.stringify(submitted));
    let task = engine.getTask(submitted.taskId, caller);
    while (
      !["completed", "failed", "stopped"].includes(task.stage) &&
      Date.now() < deadline
    ) {
      await setTimeout(20);
      task = engine.getTask(submitted.taskId, caller);
    }
    if (fixture) assert.equal(task.stage, "completed", JSON.stringify(task));
    const run = task.run ? engine.getRun(task.run.runId, caller) : undefined;
    const report = task.result?.data;
    if (fixture) {
      assert.equal(report.pass, sample.pass, JSON.stringify(report));
      if (sample.code) assert.equal(report.problems[0].code, sample.code);
    }
    if (report) {
      for (const cid of [
        report.documentation,
        ...report.references.map((reference) => reference.documentation),
      ]) {
        const file = await exporter(cid, {
          async *get(value) {
            yield (
              store.readContentBlock(value.toString()) ??
              (await car.block.get(value.toString()))
            );
          },
        });
        assert.ok(file.type === "file" || file.type === "raw");
        const chunks = [];
        for await (const chunk of file.content())
          chunks.push(Buffer.from(chunk));
        assert.match(Buffer.concat(chunks).toString("utf8"), /[\u4e00-\u9fff]/);
      }
    }
    await engine.waitForTaskRelease(task.taskId, caller, 10_000);
    const released = task.run
      ? engine.getRun(task.run.runId, caller)
      : undefined;
    assert.ok(released?.reclaimedAt, "Run resources must be reclaimed.");
    results.push({
      name: sample.name,
      stage: task.stage,
      report,
      error: run?.error,
      reclaimed: true,
    });
  }
  const after = await Promise.all(
    (controlled?.configurationFiles ?? []).map(digest),
  );
  assert.deepEqual(after, before);
  const ok =
    fixture ||
    results.every(
      (result) => result.stage === "completed" && result.report?.pass === true,
    );
  console.log(
    JSON.stringify(
      {
        ok,
        mode: fixture ? "fixture" : "device",
        bundleCid: car.cid,
        ...(controlled ? { configurationUnchanged: true } : {}),
        results,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exitCode = 1;
} finally {
  try {
    if (engine) await engine.close();
  } finally {
    try {
      if (content) await content.close();
    } finally {
      try {
        if (car) await car.close();
      } finally {
        await rm(owned, { recursive: true, force: true });
      }
    }
  }
}
