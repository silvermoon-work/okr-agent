import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

const directory = resolve(process.argv[2]);
const authorRoot = resolve(process.argv[3]);
assert.ok(isAbsolute(relative(authorRoot, directory)) || relative(authorRoot, directory).startsWith(".."));
const project = join(directory, "toolchain-project");
const environment = {
  path: [join(directory, "owned-node-npm")],
  pathExtensions: [".COM", ".EXE", ".BAT", ".CMD"],
  home: project,
  userProfile: project,
  appData: project,
  localAppData: project,
  npmConfig: {
    userConfig: join(project, "user.npmrc"),
    globalConfig: join(project, "global.npmrc"),
    prefix: join(directory, "owned-node-npm"),
  },
};
const input = (requirements) => ({
  context: { projectDirectory: project, executionEnvironment: environment },
  requirements,
});
const toolchain = [
  {
    name: "node-only",
    input: input({ tools: { node: {} } }),
    pass: true,
    codes: [],
  },
  {
    name: "node-npm-pairing-registry",
    input: input({
      tools: { node: {}, npm: {} },
      pairing: { npmWithNode: true },
      registries: {
        active: { npm: { allowedUrls: ["https://user.consumer.example.test/"] } },
      },
    }),
    pass: true,
    codes: [],
  },
  {
    name: "minimum-failures-do-not-block-registry",
    input: input({
      tools: {
        node: { minimumVersion: "999" },
        npm: { minimumVersion: "999" },
      },
      registries: {
        active: { npm: { allowedUrls: ["https://different.consumer.example.test/"] } },
      },
    }),
    pass: false,
    codes: ["version-too-low", "version-too-low", "registry-mismatch"],
  },
  {
    name: "missing-npm-prunes-only-dependent-relationships",
    input: {
      ...input({
        tools: { node: { minimumVersion: "999" }, npm: {} },
        pairing: { npmWithNode: true },
        registries: {
          active: { npm: { allowedUrls: ["https://user.consumer.example.test/"] } },
        },
      }),
      context: {
        projectDirectory: project,
        executionEnvironment: {
          ...environment,
          path: [join(directory, "..", "node-v26.13.1")],
        },
      },
    },
    pass: false,
    codes: ["version-too-low", "tool-missing"],
    forbiddenCodes: ["pairing-unconfirmed", "registry-unusable"],
  },
  {
    name: "invalid-directory-is-execution-fault",
    input: {
      ...input({ tools: { node: {} } }),
      context: {
        projectDirectory: join(directory, "directory-not-created"),
        executionEnvironment: environment,
      },
    },
    fault: true,
  },
  {
    name: "cancel-no-normal-output",
    input: input({ tools: { node: {}, npm: {} } }),
    cancel: true,
  },
];
const assets = ["AGENTS.md", "commands.mjs", "npm-publish.mjs", "deliverables.mjs"];
const scope = join(directory, "ts-production-scope");
await mkdir(scope, { recursive: true });
const ts = (name) => ({ projectDirectory: join(directory, `ts-${name}`) });
const configuration = {
  authorRoot,
  reportPath: "consumer-verification.json",
  archives: [
    {
      name: "nodejs-toolchain",
      role: "production",
      path: "nodejs-toolchain.car",
      cid: "bafybeihg3hca453wf4ukcx6ulqw76qzxdlyfuaij37tsrckxjnrdyrnu6i",
      samples: toolchain,
    },
    {
      name: "typescript-project",
      role: "production-live-metadata-adapter",
      path: "typescript-project.car",
      cid: "bafybeifmac4srult3w6hunlixc2afhrdbdrvpdgmn6tdmybegab7hogbba",
      samples: [
        {
          name: "scope-missing-independent-root-findings",
          input: { projectDirectory: scope },
          pass: false,
          requiredCodes: ["scope-unconfirmed", "document-missing", "environment-missing"],
          assets,
        },
        {
          name: "relative-directory-execution-fault",
          input: { projectDirectory: "relative-target" },
          fault: true,
        },
        {
          name: "cancel-no-normal-output",
          input: { projectDirectory: scope },
          cancel: true,
        },
      ],
    },
    {
      name: "typescript-project-deterministic",
      role: "controlled-metadata-verification-not-production",
      path: "typescript-verification.car",
      cid: "bafybeidqbbwbfczams6roqphvrsa6jowrwikxbxl2txtwvcxssao5wzsde",
      samples: [
        { name: "ordinary-pass", input: ts("good"), pass: true, codes: [], assets },
        { name: "npm-pass", input: ts("npm"), pass: true, codes: [], assets },
        {
          name: "independent-multiple-findings",
          input: ts("bad"),
          pass: false,
          requiredCodes: ["gate-missing", "coverage-mismatch", "document-mismatch"],
          assets,
        },
        {
          name: "bad-member-pruned-independent-root-continues",
          input: ts("member-pruning"),
          pass: false,
          requiredCodes: ["scope-unconfirmed", "document-mismatch"],
          forbiddenCodes: ["typescript-missing", "lint-missing", "testing-missing"],
          assets,
        },
      ],
    },
  ],
};
await writeFile(
  join(directory, "consumption.json"),
  `${JSON.stringify(configuration, null, 2)}\n`,
);
