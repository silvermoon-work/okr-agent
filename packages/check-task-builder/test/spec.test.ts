import { expect, it } from "vitest";
import { stringify } from "yaml";
import {
  memoryTree,
  readBytes,
  type ReadonlyFileTree,
} from "@silvermoon-work/task-builder/tree";
import {
  readSpecification,
  specificationTree,
  validateSpecificationContract,
} from "../src/spec.js";

const checkpoint = {
  id: "text",
  title: "Text comparison",
  description: "Compare supplied text.",
  instructions:
    "Read the input, compare it with the standard and explain any mismatch.",
  rules: [{ code: "text-ready", description: "Text must match." }],
  output: { description: "Undefined; no additional Context value." },
};
const document = {
  $schema: "urn:ipfsaw:check-bundle:1",
  specVersion: "1.0",
  name: "Text task",
  description: "Compare the caller-selected input within this Task's scope.",
  parameter: {
    schema: { type: "object", properties: { text: { type: "string" } } },
  },
  checkpoints: [checkpoint],
};
const tree = (files: Record<string, string | Uint8Array> = {}) =>
  memoryTree(
    new Map(
      Object.entries(files).map(([name, text]) => [
        name,
        typeof text === "string" ? Buffer.from(text) : text,
      ]),
    ),
  );
const read = (input: ReadonlyFileTree, name = "spec.yaml") =>
  readSpecification(input, "check.build.yaml", name, {});
const text = async (input: ReadonlyFileTree, path: string) =>
  Buffer.from(await readBytes(input, path, 1024 * 1024)).toString();

it("resolves parent-relative Spec within the provided tree and keeps nested data inert", async () => {
  const parsed = await readSpecification(
    tree({ "docs/task.yaml": stringify(document) }),
    "packages/check/check.build.yaml",
    "../../docs/task.yaml",
    {},
  );
  expect(parsed).toEqual(document);
  validateSpecificationContract(parsed, ["text"], ["text-ready"]);
});

it.each([
  "",
  "/spec.yaml",
  "../../../spec.yaml",
  "https://example.test/spec.yaml",
  "C:\\spec.yaml",
  "docs\\spec.yaml",
  "docs/*.yaml",
  "docs/[spec].yaml",
  null,
  1,
  ".",
])("rejects unsafe spec paths: %j", async (spec) => {
  await expect(
    readSpecification(tree(), "check.build.yaml", spec, {}),
  ).rejects.toThrow();
});

it.each([
  "name: [",
  "x: !execute shell",
  "x: &x [*x]",
  "x: &x hello\ny: *x",
  "name: one\nname: two",
  "- not an object",
  stringify({ ...document, $schema: "urn:ipfsaw:check-bundle:2" }),
  stringify({ ...document, specVersion: "2.0" }),
  stringify({ ...document, name: "" }),
  stringify({ ...document, description: undefined }),
  stringify({ ...document, description: " " }),
  stringify({ ...document, description: 1 }),
  stringify({ ...document, preconditions: [] }),
  stringify({ ...document, parameter: { schema: [] } }),
  stringify({ ...document, parameter: { schema: {}, preconditions: [] } }),
  stringify({
    ...document,
    parameter: { schema: {}, preconditions: ["Caller selected the input."] },
  }),
  stringify({ ...document, checkpoints: "text" }),
  stringify({ ...document, checkpoints: [null] }),
  stringify({
    ...document,
    checkpoints: [{ ...checkpoint, preconditions: [] }],
  }),
  stringify({
    ...document,
    checkpoints: [
      { ...checkpoint, preconditions: ["Caller selected the input."] },
    ],
  }),
  stringify({
    ...document,
    checkpoints: [{ ...checkpoint, output: undefined }],
  }),
  stringify({
    ...document,
    checkpoints: [{ ...checkpoint, instructions: undefined }],
  }),
  stringify({
    ...document,
    checkpoints: [{ ...checkpoint, instructions: " " }],
  }),
  stringify({ ...document, checkpoints: [{ ...checkpoint, instructions: 1 }] }),
  stringify({
    ...document,
    checkpoints: [{ ...checkpoint, output: { description: "" } }],
  }),
  stringify({ ...document, checkpoints: [checkpoint, checkpoint] }),
  stringify({
    ...document,
    checkpoints: [
      { ...checkpoint, rules: [{ code: "bad/code", description: "No." }] },
    ],
  }),
])("rejects invalid or unsafe Spec documentation", async (yaml) => {
  await expect(read(tree({ "spec.yaml": yaml }))).rejects.toThrow();
});

it("bounds input bytes, rejects invalid UTF8 and propagates missing/read failures", async () => {
  await expect(
    read(tree({ "spec.yaml": " ".repeat(1024 * 1024 + 1) })),
  ).rejects.toThrow(/byte limit/);
  await expect(
    read(tree({ "spec.yaml": Uint8Array.of(255) })),
  ).rejects.toThrow();
  await expect(read(tree())).rejects.toThrow(/not found/);
  const error = new Error("Permission denied.");
  await expect(
    read({
      list: () => Promise.resolve([]),
      read: () => Promise.reject(error),
    }),
  ).rejects.toBe(error);
});

it("requires ordered compiled checkpoint IDs and exact global rule membership", () => {
  for (const [ids, codes] of [
    [[], ["text-ready"]],
    [["other"], ["text-ready"]],
    [["text"], ["other"]],
    [["text"], ["text-ready", "unused"]],
  ]) {
    expect(() => {
      validateSpecificationContract(document, ids!, codes!);
    }).toThrow(/compiled contract/);
  }
  const two = {
    ...document,
    checkpoints: [checkpoint, { ...checkpoint, id: "second" }],
  };
  expect(() => {
    validateSpecificationContract(two, ["second", "text"], ["text-ready"]);
  }).toThrow(/order/);
  validateSpecificationContract(two, ["text", "second"], ["text-ready"]);
});

it("generates absent reference directories and appends authored references without overwriting", async () => {
  const authored = tree({
    "config/check.build.yaml": "unchanged",
    "config/references/idea/checkpoints/text.md": "Extra diagnosis.",
    "config/references/idea/check.md": "Usage hints.",
    "config/references/idea/assets/one.txt": "preserved",
    "config/references/commit/check.md": "unselected",
  });
  const overlay = await specificationTree(
    authored,
    "config/references/idea",
    document,
    {},
  );
  const global = await text(overlay, "config/references/idea/check.md");
  expect(global).toContain("## Checked parameters");
  expect(global.match(/Compare the caller\\-selected input/g)).toHaveLength(1);
  expect(global.match(/## Checked parameters/g)).toHaveLength(1);
  expect(global).not.toContain("Preconditions");
  expect(global.indexOf("Compare the caller")).toBeLessThan(
    global.indexOf("## Checked parameters"),
  );
  expect(global.indexOf("## Checked parameters")).toBeLessThan(
    global.indexOf("## Supplementary guidance"),
  );
  expect(global).toContain("## Supplementary guidance\n\nUsage hints.");
  const local = await text(
    overlay,
    "config/references/idea/checkpoints/text.md",
  );
  expect(local.match(/`text-ready`/g)).toHaveLength(1);
  expect(local).toContain("## Description");
  expect(local).toContain(
    `## Agent instructions\n\n${checkpoint.instructions}`,
  );
  expect(local).toContain("## Successful Context output");
  expect(local).toContain("## Supplementary guidance\n\nExtra diagnosis.");
  expect(await text(authored, "config/references/idea/check.md")).toBe(
    "Usage hints.",
  );
  expect(await text(overlay, "config/references/idea/assets/one.txt")).toBe(
    "preserved",
  );
  expect(await overlay.list("config/references/idea/assets")).toEqual([
    { name: "one.txt", kind: "file" },
  ]);
  expect(await overlay.list("config/references/idea")).toContainEqual({
    name: "checkpoints",
    kind: "directory",
  });
  const absent = await specificationTree(
    tree(),
    "config/references/commit",
    document,
    {},
  );
  expect(await absent.list("")).toEqual([
    { name: "config", kind: "directory" },
  ]);
  expect(await absent.list("config/references/commit/checkpoints")).toEqual([
    { name: "text.md", kind: "file" },
  ]);
  expect(
    await text(absent, "config/references/commit/checkpoints/text.md"),
  ).not.toContain("Supplementary");
});

it.each([
  { "references/Check.md": "case" },
  { "References/check.md": "case" },
  { "references/Checkpoints/text.md": "case" },
  { "references/checkpoints/Text.md": "case" },
  { references: "not a directory" },
  { "references/checkpoints": "not a directory" },
  { "references/check.md/child.txt": "not a file" },
  { "references/checkpoints/text.md/child.txt": "not a file" },
  { "references/check.md": " " },
  { "references/checkpoints/text.md": Uint8Array.of(255) },
])(
  "rejects invalid supplementary references rather than replacing them",
  async (files) => {
    await expect(
      specificationTree(tree(files), "references", document, {}),
    ).rejects.toThrow();
  },
);

it("propagates unreadable directory/file and cancellation errors from authored references", async () => {
  const error = new Error("Denied.");
  await expect(
    specificationTree(
      {
        list: () => Promise.reject(error),
        read: () => Promise.reject(error),
      },
      "references",
      document,
      {},
    ),
  ).rejects.toBe(error);
  const input = tree({ "references/check.md": "authored" });
  await expect(
    specificationTree(
      {
        list: (path, options) => input.list(path, options),
        read: () => Promise.reject(error),
      },
      "references",
      document,
      {},
    ),
  ).rejects.toBe(error);
  const overlay = await specificationTree(input, "references", document, {});
  const abort = new AbortController();
  abort.abort(error);
  await expect(
    overlay.list("references", { signal: abort.signal }),
  ).rejects.toBe(error);
});
