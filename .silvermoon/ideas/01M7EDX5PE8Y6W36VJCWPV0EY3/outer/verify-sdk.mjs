import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "@sinclair/typebox";
import { createTargetCheckers } from "@silvermoon-work/check-task-sdk";

const directory = dirname(fileURLToPath(import.meta.url));
const entry = await realpath(
  fileURLToPath(import.meta.resolve("@silvermoon-work/check-task-sdk")),
);
assert.ok(entry.startsWith(directory), "SDK must be the isolated packed artifact.");
const selector = Type.Object(
  { text: Type.String() },
  { additionalProperties: false },
);
const schemas = {
  $root: selector,
  branch: selector,
  blocked: selector,
  leaf: selector,
};
const visited = [];
const problems = [];
const run = createTargetCheckers(schemas, {
  $root: (target) => {
    assert.equal(target.type, "$root");
    assert.deepEqual(target.selector, { text: "root" });
    visited.push("root");
    return {
      pass: true,
      targets: [
        { type: "branch", selector: { text: "parent" } },
        { type: "leaf", selector: { text: "sibling" } },
      ],
    };
  },
  branch: (target) => {
    assert.equal(target.type, "branch");
    visited.push(target.selector.text);
    return {
      pass: true,
      targets: [
        { type: "blocked", selector: { text: "blocked" } },
        { type: "leaf", selector: { text: "child-sibling" } },
      ],
    };
  },
  blocked: (target) => {
    visited.push(target.selector.text);
    return {
      pass: false,
      problems: [{ code: "blocked", brief: "Prerequisite unavailable." }],
    };
  },
  leaf: (target) => {
    assert.equal(target.type, "leaf");
    visited.push(target.selector.text);
    return { pass: true, targets: [] };
  },
});
await run(
  { text: "root" },
  new AbortController().signal,
  (code, brief) => problems.push({ code, brief }),
);
assert.deepEqual(visited, [
  "root",
  "parent",
  "blocked",
  "child-sibling",
  "sibling",
]);
assert.deepEqual(problems, [
  { code: "blocked", brief: "Prerequisite unavailable." },
]);

let rootInvoked = false;
const aborted = new AbortController();
aborted.abort(new Error("Explicit cancellation."));
await assert.rejects(
  createTargetCheckers({ $root: selector }, {
    $root: () => {
      rootInvoked = true;
      return { pass: true, targets: [] };
    },
  })({ text: "root" }, aborted.signal, () => {}),
  /Explicit cancellation/,
);
assert.equal(rootInvoked, false);
await assert.rejects(
  createTargetCheckers({ $root: selector }, {
    $root: () => ({
      pass: true,
      targets: [{ type: "unknown", selector: { text: "child" } }],
    }),
  })({ text: "root" }, new AbortController().signal, () => {}),
  /Unknown target type/,
);
await assert.rejects(
  createTargetCheckers({ $root: selector }, {
    $root: () => ({ pass: false, problems: [] }),
  })({ text: "root" }, new AbortController().signal, () => {}),
  /nonempty problems/,
);
const archive = await readFile(resolve(directory, "check-task-sdk.tgz"));
const report = {
  observedAt: new Date().toISOString(),
  node: process.version,
  entry: "SDK dist resolved in independent consumer, outside author repository",
  packageSource: "local exact unpublished tarball, not registry rc.1",
  archiveSha256: createHash("sha256").update(archive).digest("hex"),
  fullTargetDelivered: true,
  dfsOrder: visited,
  problems,
  failedBranchPrunedAndSiblingsContinued: true,
  cancellationBeforeRoot: true,
  unknownTypeRejected: true,
  emptyFailureRejected: true,
  passed: true,
};
await writeFile(
  resolve(directory, "sdk-consumer-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report));
