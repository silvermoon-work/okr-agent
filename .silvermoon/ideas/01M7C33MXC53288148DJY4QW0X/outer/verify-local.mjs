import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const outer = dirname(fileURLToPath(import.meta.url));
const root = resolve(outer, "..", "..", "..", "..");
const checker = join(root, "packages", "check.typescript-project");
const owned = join(checker, "dist", "verification");
const casesRoot = join(owned, "delivery-cases");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const put = async (directory, path, value) =>
  writeFile(join(directory, path), typeof value === "string" ? value : JSON.stringify(value));
function execute(args, cwd = root) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}
async function snapshot(directory) {
  const entries = [];
  async function walk(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(path, entry.name);
      assert(!entry.isSymbolicLink(), "Controlled fixtures must not contain links");
      if (entry.isDirectory()) await walk(full);
      else entries.push([relative(directory, full).replaceAll("\\", "/"), digest(await readFile(full))]);
    }
  }
  await walk(directory);
  return digest(JSON.stringify(entries));
}
const acceptedSource = "9c098ff3c76251ed314b581747a0103e4d75ec6b";
const acceptedImplementation = "6b1a3b63a29c0181a379a0615e384a1bd593476c";
const verifiedContract = "db70181f8f6e68da24caf0fa0ad90b31eb2d3b7b";
const synchronizedContractCommit = "2c509486077f46c18b87dc57057d27564430fbc0";
const production = join(checker, "dist", "typescript-project.car");
assert.equal(digest(await readFile(production)), "7d80c258d37f4f90e244b7645639de52a76d5438269ecac9d6765687072402fc");
const baseline = await json(join(owned, "engine-fixture-report.json"));
assert.deepEqual(baseline.results.map((entry) => entry.pass), [true, false, true]);
assert.equal(baseline.reclaimed, true);
await mkdir(casesRoot);
const cases = [
  { name: "ordinary", template: "good", pass: true },
  { name: "npm-library", template: "npm", pass: true },
  { name: "npm-cli", template: "npm", pass: true, cli: true },
  { name: "cloudflare", template: "good", pass: true, entries: [{ path: ".", type: "cloudflare" }] },
  { name: "custom", template: "good", pass: true, entries: [{ path: ".", type: "my-target", opaque: { command: "DO NOT EXECUTE" } }] },
  { name: "duplicate", template: "good", pass: false, code: "delivery-mismatch", entries: [{ path: ".", type: "cloudflare" }, { path: ".", type: "custom" }] },
  { name: "escape", template: "good", pass: false, code: "delivery-mismatch", entries: [{ path: "../outside", type: "custom" }] },
  { name: "private-npm", template: "npm", pass: false, code: "delivery-mismatch", private: true },
  { name: "unregistered-publish", template: "good", pass: false, code: "delivery-missing", publish: true },
];
for (const item of cases) {
  item.directory = join(casesRoot, item.name);
  await cp(join(owned, item.template), item.directory, { recursive: true, errorOnExist: true, force: false });
  if (item.entries) await put(item.directory, "silvermoon.yaml", { deliverables: item.entries });
  if (item.name === "cloudflare")
    await put(item.directory, "wrangler.jsonc", '{ "main": "src/index.ts" }');
  if (item.cli || item.private) {
    const manifest = await json(join(item.directory, "package.json"));
    if (item.cli) manifest.bin = { "fixture-cli": "./dist/index.js" };
    if (item.private) manifest.private = true;
    await put(item.directory, "package.json", manifest);
  }
  if (item.publish)
    await put(item.directory, join(".github", "workflows", "release.yaml"), { jobs: { release: { steps: [{ run: "npm publish" }] } } });
  item.before = await snapshot(item.directory);
}
const engine = execute([
  join(checker, "scripts", "smoke.mjs"),
  join(owned, "bundle.car"),
  ...cases.map((item) => item.directory),
], checker);
assert.equal(engine.results.length, cases.length);
for (const [index, item] of cases.entries()) {
  const result = engine.results[index];
  assert.equal(result.pass, item.pass, JSON.stringify({ item: item.name, result }));
  if (item.code) assert(result.problems.some((problem) => problem.code === item.code), JSON.stringify(result));
  assert.equal(result.assetsExact, true);
  assert.equal(result.documentationReadable, true);
  item.after = await snapshot(item.directory);
  assert.equal(item.before, item.after, `${item.name}: target was modified`);
}
assert.equal(engine.reclaimed, true);
const identity = execute(["--input-type=module", "--eval", `
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {readTaskBundleCar} from "@silvermoon-work/task-builder/car";
import {readBytes} from "@silvermoon-work/task-builder/tree";
const paths=process.argv.slice(1);
const cars=[];
for(const path of paths) {
 const bytes=await readFile(path);
 const car=await readTaskBundleCar(new Blob([bytes]).stream());
 const assets={};
 for(const name of ["AGENTS.md","commands.mjs","deliverables.mjs","npm-publish.mjs","workflow-predicates.mjs"]) {
  const resource=await readBytes(car.tree,"resources/assets/"+name,262144);
  assets[name]=createHash("sha256").update(resource).digest("hex");
 }
 cars.push({path,cid:car.cid.toString(),sha256:createHash("sha256").update(bytes).digest("hex"),size:bytes.length,assets});
 await car.close();
}
assert.deepEqual(cars[0].assets,cars[1].assets);
assert.notEqual(cars[0].cid,cars[1].cid);
console.log(JSON.stringify({production:cars[0],deterministicVerification:cars[1],sharedAssetsExact:true}));
`, production, join(owned, "bundle.car")], checker);
assert.equal(identity.production.cid, "bafybeidwniqa77leuzpddh56ln4zyyxbz5z3vn66emoqtpn6bk5z33ya4i");
const { loadDeliverables, npmMappings } = await import(pathToFileURL(join(root, "scripts", "lib", "deliverables.mjs")));
const { plan } = await import(pathToFileURL(join(root, "scripts", "lib", "commands.mjs")));
const { resolveConfiguration } = await import(pathToFileURL(join(root, "scripts", "lib", "npm-publish.mjs")));
const entries = loadDeliverables(root);
const projects = await Promise.all([".", "packages/core", ...entries.map((entry) => entry.path)].map(async (directory) => ({
  directory,
  manifest: await json(join(root, directory, "package.json")),
  delivery: entries.find((entry) => entry.path === directory)?.type,
})));
const mappings = npmMappings(entries, projects);
assert.deepEqual(mappings.map((entry) => entry.id), ["check-task-sdk", "check-task-builder"]);
const selected = plan(projects, "lint-package").map((entry) => entry.directory);
assert.deepEqual(selected, ["packages/check-task-sdk", "packages/check-task-builder"]);
const core = projects.find((entry) => entry.directory === "packages/core");
assert.equal(core.manifest.private, true);
assert.equal(core.delivery, undefined);
const chosen = resolveConfiguration(projects, mappings, ["22.15.0", "24.11.1"], "workflow_dispatch", undefined, "check-task-sdk");
assert.equal(chosen.package.name, "@silvermoon-work/check-task-sdk");
assert.throws(() => resolveConfiguration(projects, mappings, ["22.15.0", "24.11.1"], "workflow_dispatch", undefined, "core"), /exactly one/);
const report = {
  observedAt: new Date().toISOString(),
  acceptedSource, acceptedImplementation, verifiedContract, synchronizedContractCommit,
  node: process.version, pinnedNode: "26.13.1", metadata: "accepted deterministic fixture provider; no live registry facts",
  productionAndVerificationIdentity: identity,
  baseline,
  engine,
  cases,
  rootSelection: { entries, mappings, publintDirectories: selected, dryRunIdentityPlan: chosen.package, corePrivate: true, coreSelectable: false },
  targetScriptsExecuted: false,
  remotePublicationOrResourceChanges: false,
  passed: true,
};
await writeFile(join(outer, "local-verification.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: true, cases: cases.length, report: join(outer, "local-verification.json"), production: identity.production.cid, verification: identity.deterministicVerification.cid }, null, 2));
