import assert from "node:assert/strict";
import { readFile, mkdir, readdir, writeFile, rm } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";
import console from "node:console";
import { Blob, Buffer } from "node:buffer";
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

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const carPath = resolve(
  process.argv[2] ?? join(packageDirectory, "dist", "nodejs-toolchain.car"),
);
const directory = resolve(
  process.argv[3] ?? join(packageDirectory, "..", ".."),
);
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
const owned = join(directory, "dist", `.toolchain-engine-${randomUUID()}`);
const project = join(owned, "project");
const userOnly = join(owned, "user-only");
const interpolation = join(owned, "interpolation");
const configDependencies = join(owned, "config-dependencies");
const standaloneConfigDependencies = join(
  owned,
  "standalone-config-dependencies",
);
// The harness is the authorized local execution host. Empty PATH segments
// (implicit cwd) are deliberately not selected; no other environment is copied.
const executionEnvironment = {
  path: [
    join(packageDirectory, "node_modules", ".bin"),
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((p) => p.replace(/^"|"$/g, "")),
  ],
  ...(process.platform === "win32"
    ? {
        pathExtensions: [".COM", ".EXE", ".BAT", ".CMD"],
        userProfile: owned,
        appData: owned,
        localAppData: owned,
      }
    : {}),
  home: owned,
  xdgConfigHome: owned,
  npmConfig: {
    userConfig: join(owned, ".npmrc"),
    globalConfig: join(owned, "global.npmrc"),
  },
};
const caller = { scope: "toolchain-smoke", subject: "toolchain-smoke" };
const context = (projectDirectory, environment = executionEnvironment) => ({
  projectDirectory,
  executionEnvironment: environment,
});
const active = (url) => ({
  active: {
    npm: { allowedUrls: [url] },
    pnpm: { allowedUrls: [url] },
  },
});
const realTools = { node: {}, npm: {}, pnpm: {}, nrm: {} };
const cases = [
  {
    name: "node-only",
    input: { context: context(project), requirements: { tools: { node: {} } } },
    pass: true,
  },
  {
    name: "multiple-problems",
    input: {
      context: context(project),
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
    pass: false,
  },
  {
    name: "real-tools-project",
    input: {
      context: context(project),
      requirements: {
        tools: realTools,
        pairing: { npmWithNode: true },
        registries: {
          ...active("https://project.example.test/custom/"),
          nrm: {
            required: [
              { name: "owned", url: "https://registered.example.test/" },
            ],
          },
        },
      },
    },
    pass: true,
  },
  {
    name: "real-tools-user",
    input: {
      context: context(userOnly),
      requirements: {
        tools: { npm: {}, pnpm: {} },
        registries: active("https://user.example.test/"),
      },
    },
    pass: true,
  },
  {
    name: "real-tools-environment",
    input: {
      context: context(project, {
        ...executionEnvironment,
        npmConfig: {
          ...executionEnvironment.npmConfig,
          registry: "https://env.example.test/",
        },
      }),
      requirements: {
        tools: { npm: {}, pnpm: {} },
        registries: active("https://env.example.test/"),
      },
    },
    pass: true,
  },
  {
    name: "real-nrm-missing-and-mismatch",
    input: {
      context: context(project),
      requirements: {
        registries: {
          nrm: {
            required: [
              { name: "owned", url: "https://different.example.test/" },
              { name: "absent", url: "https://missing.example.test/" },
            ],
          },
        },
      },
    },
    pass: false,
    codes: ["nrm-registration-mismatch", "nrm-registration-missing"],
  },
  {
    name: "directory-fault",
    input: {
      context: context(join(owned, "missing")),
      requirements: { tools: { node: {} } },
    },
    stage: "failed",
  },
  {
    name: "pnpm-interpolation-fault",
    input: {
      context: context(interpolation),
      requirements: {
        tools: { pnpm: {} },
        registries: {
          active: { pnpm: { allowedUrls: ["https://user.example.test/"] } },
        },
      },
    },
    stage: "failed",
  },
  {
    name: "pnpm-config-dependencies-fault",
    input: {
      context: context(configDependencies),
      requirements: { tools: { pnpm: {} } },
    },
    stage: "failed",
  },
  {
    name: "standalone-pnpm-config-dependencies-fault",
    input: {
      context: context(standaloneConfigDependencies),
      requirements: { tools: { pnpm: {} } },
    },
    stage: "failed",
  },
];
if (process.argv.includes("--nvm")) {
  const managed = {
    ...executionEnvironment,
    ...(process.env.NVM_HOME ? { nvmHome: process.env.NVM_HOME } : {}),
    ...(process.env.NVM_SYMLINK ? { nvmSymlink: process.env.NVM_SYMLINK } : {}),
    ...(process.env.NVM_DIR ? { nvmDir: process.env.NVM_DIR } : {}),
  };
  cases.push({
    name: "real-nvm-managed",
    input: {
      context: context(project, managed),
      requirements: {
        tools: { node: {}, npm: {}, nvm: {} },
        pairing: { npmWithNode: true },
        management: { provider: "nvm", appliesTo: ["node", "npm"] },
      },
    },
    pass: true,
  });
}
const tracked = [];
const fixturePids = [];
async function until(action, budget = 20_000) {
  const end = Date.now() + budget;
  while (Date.now() < end) {
    const result = await action();
    if (result) return result;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("Owned smoke fixture did not become ready.");
}
async function fixture(name, taskTimeoutMs) {
  const home = join(owned, name);
  await mkdir(home);
  const script = join(home, "fixture.cjs");
  const marker = join(home, "child.pid");
  await writeFile(
    script,
    `const cp=require("node:child_process"),fs=require("node:fs");
const child=cp.spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});
fs.writeFileSync(${JSON.stringify(marker)},String(child.pid));setInterval(()=>{},1000);`,
  );
  const shim =
    process.platform === "win32" ? join(home, "node.cmd") : join(home, "node");
  await writeFile(
    shim,
    process.platform === "win32"
      ? `@"${process.execPath}" "${script}"\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${script}"\n`,
    { mode: 0o755 },
  );
  return {
    name,
    timeoutMs: taskTimeoutMs,
    marker,
    stage: "failed",
    input: {
      context: context(project, {
        ...executionEnvironment,
        path: [home],
      }),
      requirements: { tools: { node: {} } },
    },
  };
}
function cleanupOwnedChild(pid) {
  try {
    process.kill(pid, 0);
    process.kill(pid);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
try {
  await mkdir(project, { recursive: true });
  await mkdir(userOnly);
  await mkdir(interpolation);
  await mkdir(configDependencies);
  await mkdir(standaloneConfigDependencies);
  const snapshots = new Map([
    [
      join(owned, ".npmrc"),
      "registry=https://user.example.test/\n# keep this comment\n",
    ],
    [join(owned, "global.npmrc"), ""],
    [
      join(owned, ".nrmrc"),
      "[owned]\nregistry=https://registered.example.test/\n[extra]\nregistry=https://extra.example.test/\n",
    ],
    [
      join(project, ".npmrc"),
      "registry=https://project.example.test/custom/\n",
    ],
    [
      join(project, "package.json"),
      '{"private":true,"packageManager":"pnpm@0.0.0","scripts":{"preinstall":"exit 99"}}\n',
    ],
    [
      join(project, ".pnpmfile.cjs"),
      'throw new Error("Project hooks must not execute during this check");\n',
    ],
    [
      join(project, ".pnpmfile.mjs"),
      'throw new Error("Project hooks must not execute during this check");\n',
    ],
    [join(userOnly, "package.json"), '{"private":true}\n'],
    [join(project, "pnpm-workspace.yaml"), "packages: []\n"],
    [join(userOnly, "pnpm-workspace.yaml"), "packages: []\n"],
    [join(interpolation, "package.json"), '{"private":true}\n'],
    [
      join(interpolation, "pnpm-workspace.yaml"),
      "packages: []\nregistry: https://${UNAPPROVED_REGISTRY_HOST}/\n",
    ],
    [join(configDependencies, "package.json"), '{"private":true}\n'],
    [
      join(configDependencies, "pnpm-workspace.yaml"),
      "packages: []\nconfigDependencies:\n  fake: 0.0.0\n",
    ],
    [join(standaloneConfigDependencies, "package.json"), '{"private":true}\n'],
    [
      join(standaloneConfigDependencies, ".npmrc"),
      "[configDependencies]\nowned=0.0.0\n",
    ],
  ]);
  for (const [path, content] of snapshots) await writeFile(path, content);
  cases.push(
    await fixture("cancel", 30_000),
    await fixture("task-timeout", 1500),
    await fixture("command-timeout", 30_000),
  );
  await engine.start();
  const probeInput = {
    context: context(project),
    requirements: {
      tools: { pnpm: { minimumVersion: "999999999999999999999999" } },
    },
  };
  let probe = await engine.submit(
    {
      requestId: newId(),
      bundle: car.cid,
      input: probeInput,
      timeoutMs: 30_000,
    },
    caller,
  );
  if (probe.status === "preparing")
    probe = await until(async () => {
      const status = await engine.getRequestStatus(
        probe.requestId,
        { waitMs: 100 },
        caller,
      );
      return status.status === "preparing" ? undefined : status;
    });
  assert.equal(probe.status, "accepted");
  const observed = await until(async () => {
    const task = engine.getTask(probe.taskId, caller);
    if (task.stage === "failed") assert.fail(JSON.stringify(task));
    return task.stage === "completed" ? task.output.result : undefined;
  });
  assert.equal(observed.pass, false);
  assert.equal(observed.problems[0].code, "version-too-low");
  const major = Number(/当前 (\d+)/.exec(observed.problems[0].brief)?.[1]);
  assert.ok(
    [10, 11].includes(major),
    "The native smoke matrix currently verifies pnpm 10/11 only.",
  );
  // pnpm 11 treats npm_config_registry as a user-level source; a project
  // registry wins. pnpm 10 treats it as an environment override. Both must be
  // observed natively, independently of npm's own precedence.
  cases.find(
    (sample) => sample.name === "real-tools-environment",
  ).input.requirements.registries.active.pnpm.allowedUrls = [
    major === 11
      ? "https://project.example.test/custom/"
      : "https://env.example.test/",
  ];
  tracked.push({
    name: "pnpm-version",
    taskId: probe.taskId,
    pass: false,
    codes: ["version-too-low"],
  });
  for (const sample of cases) {
    let submitted = await engine.submit(
      {
        requestId: newId(),
        bundle: car.cid,
        input: sample.input,
        timeoutMs: sample.timeoutMs ?? 30_000,
      },
      caller,
    );
    if (submitted.status === "preparing")
      submitted = await until(async () => {
        const status = await engine.getRequestStatus(
          submitted.requestId,
          { waitMs: 100 },
          caller,
        );
        return status.status === "preparing" ? undefined : status;
      });
    assert.equal(submitted.status, "accepted", JSON.stringify(submitted));
    tracked.push({ ...sample, taskId: submitted.taskId });
    if (sample.marker) {
      const pid = await until(async () => {
        try {
          return Number(await readFile(sample.marker, "utf8"));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        }
      });
      fixturePids.push(pid);
      if (sample.name === "cancel") engine.cancelTask(submitted.taskId, caller);
    }
  }
  const drained = await engine.drain();
  const results = [];
  for (const sample of tracked) {
    const task = drained.tasks.find((t) => t.taskId === sample.taskId);
    const run = drained.runs.find((r) => r.runId === task?.run?.runId);
    assert.ok(run, JSON.stringify(drained));
    assert.ok(run.reclaimedAt, JSON.stringify(run));
    if (sample.stage) {
      assert.equal(run.stage, sample.stage, JSON.stringify(run));
      assert.equal(run.output, undefined);
      if (sample.name === "cancel") {
        assert.equal(task.canceled, true);
        assert.match(run.error.message, /cancelled/);
        assert.ok(run.stopRequested);
      }
      if (sample.name === "task-timeout") {
        assert.equal(task.canceled, false);
        assert.ok(Date.parse(run.failedAt) >= Date.parse(task.deadlineAt));
        assert.match(run.error.message, /cancelled/);
      }
      if (sample.name === "command-timeout")
        assert.match(run.error.message, /timed out/);
      if (sample.name === "pnpm-interpolation-fault")
        assert.match(run.error.message, /interpolation/i);
      if (
        [
          "pnpm-config-dependencies-fault",
          "standalone-pnpm-config-dependencies-fault",
        ].includes(sample.name)
      )
        assert.match(
          run.error.message,
          /must not install configuration packages/,
        );
      results.push({ name: sample.name, stage: run.stage, reclaimed: true });
      continue;
    }
    assert.equal(run.stage, "completed", JSON.stringify(run));
    const output = run.output;
    assert.ok(output);
    const result = output.result;
    assert.equal(
      result.pass,
      sample.pass,
      JSON.stringify({ sample: sample.name, result }),
    );
    assert.equal("problems" in result, !sample.pass);
    assert.equal(result.documentation, "references/check.md");
    if (!sample.pass) {
      if (sample.codes)
        assert.deepEqual(
          result.problems.map((p) => p.code),
          sample.codes,
        );
      else assert.equal(result.problems.length, 3);
    }
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
      const file = await exporter(`${output.cid}/${path}`, {
        async *get(cid) {
          yield store.readContentBlock(cid.toString()) ??
            (await car.block.get(cid.toString()));
        },
      });
      assert.ok(file.type === "file" || file.type === "raw");
      const chunks = [];
      for await (const chunk of file.content()) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      assert.deepEqual(
        bytes,
        Buffer.from(await readBytes(car.tree, `resources/${path}`, 262144)),
      );
      assert.match(bytes.toString("utf8"), /[\u4e00-\u9fff]/);
    }
    results.push({
      name: sample.name,
      stage: run.stage,
      pass: result.pass,
      problems: result.problems?.map((p) => p.code) ?? [],
      documents: [...new Set(paths)],
      outputCid: output.cid,
      reclaimed: true,
    });
  }
  for (const pid of fixturePids)
    assert.throws(
      () => process.kill(pid, 0),
      undefined,
      `Owned child ${pid} still exists`,
    );
  for (const [path, content] of snapshots)
    assert.equal(await readFile(path, "utf8"), content);
  assert.deepEqual((await readdir(configDependencies)).sort(), [
    "package.json",
    "pnpm-workspace.yaml",
  ]);
  assert.deepEqual((await readdir(standaloneConfigDependencies)).sort(), [
    ".npmrc",
    "package.json",
  ]);
  console.log(
    JSON.stringify({
      ok: true,
      carPath,
      bundleCid: car.cid,
      results,
      configurationUnchanged: true,
      fixtureChildrenReclaimed: true,
    }),
  );
} finally {
  await engine.close();
  await ipfsStore.close();
  store.close();
  await car.close();
  // Only owned fixture descendants are eligible for emergency cleanup on assertion failure.
  for (const pid of fixturePids) cleanupOwnedChild(pid);
  await rm(owned, { recursive: true, force: true });
}
