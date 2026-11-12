import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeEach, afterEach, expect, it } from "vitest";
import { inspect } from "../src/inspect.js";
import type { ProblemCode } from "../src/contract.js";
import { npmFixture, put, testEvidence, fixture, manifest } from "./fixture.js";

let root: string;
beforeEach(async () => {
  root = resolve("dist", `.publisher-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  await npmFixture(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function check() {
  const problems: { code: ProblemCode; brief: string }[] = [];
  await inspect(
    { projectDirectory: root },
    new AbortController().signal,
    (code, brief) => {
      problems.push({ code, brief });
    },
    await testEvidence(),
  );
  return problems;
}
it("proves a complete single-package tsc ESM/maps/source + exact standard OIDC publisher profile without executing target code", async () => {
  expect(await check()).toEqual([]);
});
it.each([
  [
    "source delivery",
    "package.json",
    (text: string) => text.replace('"dist","src"', '"dist"'),
    "delivery-mismatch",
  ],
  [
    "entry relation",
    "package.json",
    (text: string) => text.replace("./dist/index.d.ts", "./dist/other.d.ts"),
    "delivery-mismatch",
  ],
  [
    "rootDir",
    "tsconfig.build.json",
    (text: string) => text.replace('"rootDir":"src"', '"rootDir":"test"'),
    "delivery-mismatch",
  ],
  [
    "client OIDC support",
    ".github/workflows/npm-publish.yaml",
    (text: string) => text.replace("npm@11.21.0", "npm@10.0.0"),
    "release-unconfirmed",
  ],
  [
    "actual helper bytes",
    ".github/scripts/npm-publish.mjs",
    (text: string) => `${text}\n// custom bypass\n`,
    "release-unconfirmed",
  ],
  [
    "complete CI aggregate",
    ".github/workflows/ci.yaml",
    (text: string) => text.replace("exit 1", "exit 0"),
    "release-unconfirmed",
  ],
  [
    "unknown YAML semantics",
    ".github/workflows/ci.yaml",
    (text: string) =>
      text.replace("run: pnpm check", "run: !custom pnpm check"),
    "release-unconfirmed",
  ],
] as const)(
  "does not pass after mutation of %s",
  async (_label, path, mutate, code) => {
    await put(root, path, mutate(await readFile(join(root, path), "utf8")));
    expect((await check()).map((p) => p.code)).toContain(code);
  },
);
it("requires the actual engine minimum in the compatibility matrix, not just a higher happy path", async () => {
  const text = await readFile(join(root, "package.json"), "utf8");
  await put(root, "package.json", text.replace(">=22.15.0", ">=22.14.0"));
  expect((await check()).map((p) => p.code)).toContain("ci-mismatch");
});
it("does not infer an npm library from private:false alone", async () => {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await fixture(root);
  await put(root, "package.json", { ...manifest, private: false });
  const problems = await check();
  expect(
    problems.some(
      (p) => p.code === "delivery-unconfirmed" && p.brief.includes("职责"),
    ),
  ).toBe(true);
  expect(problems.some((p) => p.code.startsWith("release-"))).toBe(false);
  await put(root, "package.json", { ...manifest, main: "./dist/server.js" });
  const application = await check();
  expect(
    application.some(
      (p) => p.code === "delivery-unconfirmed" && p.brief.includes("应用 main"),
    ),
  ).toBe(true);
  expect(application.some((p) => p.code.startsWith("release-"))).toBe(false);
  await put(root, "package.json", {
    ...manifest,
    exports: { ".": "./src/index.ts" },
  });
  const internal = await check();
  expect(internal.some((p) => p.code === "delivery-unconfirmed")).toBe(true);
  expect(internal.some((p) => p.code.startsWith("release-"))).toBe(false);
});
