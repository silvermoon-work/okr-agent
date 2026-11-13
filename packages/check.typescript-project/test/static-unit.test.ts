import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { Files, Unconfirmed, glob, stringArray } from "../src/files.js";
import { Scripts, words } from "../src/commands.js";
import {
  compilerConsistency,
  javascript,
  jsonc,
  tsconfig,
  tsIncludes,
} from "../src/static.js";
import { repository } from "../src/repository.js";

it.each([
  "export default /x/;",
  "export default 1n;",
  "export default missing;",
  "export default {}['x'];",
  "export default [...{}];",
  "export default { get x() { return 1; } };",
  "export default { ['x']: 1 };",
  "export default { 1: true };",
  "export default { constructor: 1 };",
  "export default [].map(x => x);",
  'import ts from "typescript-eslint"; export default ts.configs.recommendedTypeChecked.map();',
  'import ts from "typescript-eslint"; export default ts.configs.recommendedTypeChecked.map(async x => x);',
  'import ts from "typescript-eslint"; export default ts.configs.recommendedTypeChecked.map(({x}) => x);',
  'import {defineConfig} from "vitest/config"; export default defineConfig(...{});',
  'import {defineConfig} from "vitest/config"; export default defineConfig([]);',
  'import ts from "typescript-eslint"; export default ts.configs.unknown;',
  'import x from "untrusted"; export default x;',
  "const {x} = {}; export default x;",
  "let x = {}; export default x;",
  "const x = {};",
  "export default !true;",
])("rejects non-declarative configuration without execution: %s", (source) => {
  expect(() => javascript(source)).toThrow(Unconfirmed);
});
it("evaluates literal properties, known globals and declarative call spreads", () => {
  expect(
    javascript(
      'import globals from "globals"; import {defineConfig} from "eslint/config"; const data = [{languageOptions: {globals: globals.node}}, {"x": 1}]; ; export default defineConfig(...data);',
    ),
  ).toEqual([{ languageOptions: { globals: {} } }, { x: 1 }]);
  expect(javascript("const data = {x: 2}; export default data.x;")).toBe(2);
});
it.each(['{"x":"unterminated}', "/* missing", "{oops}", "[]"])(
  "rejects malformed JSONC: %s",
  (source) => {
    expect(() => jsonc(source)).toThrow(Unconfirmed);
  },
);
it("keeps escaped strings and comment-looking string data intact", () => {
  expect(jsonc('{"x": "a\\"//b", /* comment */ "y": [1,],}')).toEqual({
    x: 'a"//b',
    y: [1],
  });
});
it.each(["", "node 'unterminated", 'node "a\\b"', "node x && other"])(
  "rejects unsafe or incomplete shell words: %s",
  (source) => {
    expect(() => words(source)).toThrow(Unconfirmed);
  },
);
it("preserves quoted empty arguments and whitespace inside arguments", () => {
  expect(words(" node  \"\" 'a b' x ")).toEqual(["node", "", "a b", "x"]);
  expect(() => stringArray(["a", 1])).toThrow(Unconfirmed);
  expect(glob("**/a?.ts", "src/ab.ts")).toBe(true);
  expect(glob("**", "/absolute")).toBe(false);
  expect(glob("**", "a/../b")).toBe(false);
});
it("propagates unexpected script path failures", () => {
  const files = new Files(resolve("."), new AbortController().signal);
  vi.spyOn(files, "path").mockImplementation((base, child) => {
    if (child.startsWith("scripts")) throw new Error("unexpected");
    return child;
  });
  expect(() =>
    new Scripts(files).validate({
      directory: "",
      manifest: { scripts: { test: "node scripts/test.mjs" } },
      sources: [],
      tests: [],
    }),
  ).toThrow("unexpected");
});

it.each([
  ["", undefined, "不可用"],
  ["[include]\npath=x", undefined, "include"],
  ['[remote "origin"]\ninvalid', undefined, "语法"],
  [
    '[remote "origin"]\nurl=https://github.com/a/b\nurl=https://github.com/a/c',
    undefined,
    "多个",
  ],
  ['[branch "main"]\nmerge=refs/heads/main', undefined, "origin 缺失"],
  [
    '[remote "origin"]\nurl=https://user:secret@github.com/a/b',
    undefined,
    "凭据",
  ],
  ['[remote "origin"]\nurl=git@github.com:a/b', undefined, "主分支"],
])(
  "rejects unprovable repository configuration",
  async (config, head, reason) => {
    const files = new Files(resolve("."), new AbortController().signal);
    vi.spyOn(files, "optionalText").mockImplementation((path) =>
      Promise.resolve(path === ".git/config" ? config : head),
    );
    await expect(repository(files)).rejects.toThrow(reason);
  },
);
it("resolves explicit remote HEAD for non-GitHub origins", async () => {
  const files = new Files(resolve("."), new AbortController().signal);
  vi.spyOn(files, "optionalText").mockImplementation((path) =>
    Promise.resolve(
      path === ".git/config"
        ? '# comment\n; comment\n[remote "origin"]\nurl=https://git.acme.org/a/b'
        : "ref: refs/remotes/origin/trunk\n",
    ),
  );
  await expect(repository(files)).resolves.toEqual({
    github: false,
    primary: "trunk",
  });
});
it.each([
  { extends: ["./base"] },
  { include: [1] },
  { exclude: "src" },
  { references: {} },
  { references: [{ path: 1 }] },
  { compilerOptions: { outDir: 1 } },
  { compilerOptions: { declarationDir: false } },
])("rejects invalid tsconfig data: %j", async (raw) => {
  const files = new Files(resolve("."), new AbortController().signal);
  vi.spyOn(files, "text").mockResolvedValue(JSON.stringify(raw));
  await expect(tsconfig(files, "tsconfig.json")).rejects.toThrow(Unconfirmed);
});
it("inherits explicit files and output directories, and resolves project references", async () => {
  const files = new Files(resolve("."), new AbortController().signal);
  vi.spyOn(files, "text").mockImplementation((path) =>
    Promise.resolve(
      JSON.stringify(
        path === "base.json"
          ? { files: ["src/index.ts"], compilerOptions: { outDir: "dist" } }
          : {
              extends: "./base",
              references: [{ path: "./lib" }, { path: "./other.json" }],
            },
      ),
    ),
  );
  const config = await tsconfig(files, "tsconfig.json");
  expect(config.references).toEqual(["lib/tsconfig.json", "other.json"]);
  expect(tsIncludes(files, config, "src/index.ts")).toBe(true);
  expect(tsIncludes(files, config, "dist/generated.ts")).toBe(false);
  expect(tsIncludes(files, config, "other.ts")).toBe(false);
});
it("rejects unprovable module/resolution combinations", () => {
  expect(() => compilerConsistency({ moduleResolution: "NodeNext" })).toThrow(
    "explicit module",
  );
  expect(() =>
    compilerConsistency({ module: "CommonJS", moduleResolution: "Bundler" }),
  ).toThrow("depends");
});
