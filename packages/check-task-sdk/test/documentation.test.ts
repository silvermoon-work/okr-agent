import { Type } from "@sinclair/typebox";
import { expect, it } from "vitest";
import {
  defineCheckpoint,
  renderCheckpointDocumentation,
  validateCheckpointRules,
  validateOutputDocumentation,
  type OutputDocumentation,
} from "../src/index.js";

it("renders one acceptance list and inert goal/output documentation", () => {
  const markdown = renderCheckpointDocumentation({
    id: "read",
    title: "Read target",
    description: "Inspect <script> and [do not fetch](https://example.test).",
    instructions:
      '1. Review the current document.\n\n```json\n{"type":"signOff"}\n```',
    rules: [{ code: "target-ready", description: "Target must be ready." }],
    output: {
      description: "An execution-local capability; never published.",
      fields: [
        { name: "resource", description: "Reuse in later checkpoints." },
      ],
    },
  });
  expect(markdown).toContain("# Read target");
  expect(markdown).toContain("## Description");
  expect(markdown).toContain(
    '## Agent instructions\n\n1. Review the current document.\n\n```json\n{"type":"signOff"}\n```',
  );
  expect(markdown.indexOf("## Description")).toBeLessThan(
    markdown.indexOf("## Agent instructions"),
  );
  expect(markdown.indexOf("## Agent instructions")).toBeLessThan(
    markdown.indexOf("## Acceptance rules"),
  );
  expect(markdown).toContain("&lt;script&gt;");
  expect(markdown).toContain("\\[do not fetch\\]");
  expect(markdown.match(/`target-ready`/g)).toHaveLength(1);
  expect(markdown).toContain("## Successful Context output");
  expect(markdown).toContain("**resource**: Reuse in later checkpoints");
  expect(
    renderCheckpointDocumentation({
      id: "read",
      description: "Read.",
      rules: [{ code: "ready", description: "Ready." }],
    }),
  ).not.toContain("Successful Context output");
});

it("copies and deeply freezes only output documentation", () => {
  const metadata = {
    description: "Capability.",
    fields: [{ name: "map", description: "Mutable local cache." }],
  };
  const output = new Map<string, () => void>();
  const checkpoint = defineCheckpoint({
    id: "read",
    target: Type.Object({}),
    description: "Read.",
    instructions: "Review before continuing.",
    rules: [{ code: "ready", description: "Ready." }],
    output: metadata,
    check: () => Promise.resolve({ pass: true, output }),
  });
  expect(checkpoint.output).not.toBe(metadata);
  expect(checkpoint.instructions).toBe("Review before continuing.");
  expect(checkpoint.output?.fields).not.toBe(metadata.fields);
  expect(Object.isFrozen(checkpoint.output)).toBe(true);
  expect(Object.isFrozen(checkpoint.output?.fields)).toBe(true);
  expect(Object.isFrozen(checkpoint.output?.fields?.[0])).toBe(true);
  metadata.fields[0]!.description = "Changed.";
  expect(checkpoint.output?.fields?.[0]?.description).toBe(
    "Mutable local cache.",
  );
  expect(Object.isFrozen(output)).toBe(false);
  validateOutputDocumentation({ description: "Undefined output." });
  expect(
    defineCheckpoint({
      id: "none",
      target: Type.Object({}),
      description: "Read.",
      rules: [{ code: "ready", description: "Ready." }],
      output: { description: "Undefined." },
      check: () => Promise.resolve({ pass: true, output: undefined }),
    }).output,
  ).toEqual({ description: "Undefined." });
});

it.each([
  null,
  [],
  {},
  { description: " " },
  { description: 1 },
  { description: "Output.", schema: {} },
  { description: "Output.", fields: [] },
  { description: "Output.", fields: "field" },
  { description: "Output.", fields: [null] },
  { description: "Output.", fields: [{ name: "", description: "Field." }] },
  { description: "Output.", fields: [{ name: "field", description: " " }] },
  {
    description: "Output.",
    fields: [{ name: "field", description: "Field.", type: "string" }],
  },
  {
    description: "Output.",
    fields: [
      { name: "field", description: "One." },
      { name: "field", description: "Two." },
    ],
  },
])(
  "rejects malformed documentation before defining or rendering: %j",
  (output) => {
    expect(() => {
      validateOutputDocumentation(output);
    }).toThrow(/output documentation/i);
    const definition = {
      id: "read",
      target: Type.Object({}),
      description: "Read.",
      rules: [{ code: "ready", description: "Ready." }] as const,
      output: output as OutputDocumentation,
      check: () => Promise.resolve({ pass: true, output: undefined } as const),
    };
    expect(() => defineCheckpoint(definition)).toThrow(/output documentation/i);
    expect(() => renderCheckpointDocumentation(definition)).toThrow(
      /output documentation/i,
    );
  },
);

it.each([
  null,
  [],
  [null],
  [{ code: "bad/code", description: "Rule." }],
  [{ code: "ready", description: "" }],
  [{ code: "ready", description: "Ready.", documentation: "per-rule.md" }],
])(
  "validates untyped rule documentation with the shared helper: %j",
  (rules) => {
    expect(() => {
      validateCheckpointRules(rules);
    }).toThrow(/rules/);
  },
);

it.each([
  { id: "../read" },
  { description: "" },
  { title: " " },
  { instructions: " " },
])("rejects invalid checkpoint documentation: %j", (changes) => {
  expect(() =>
    renderCheckpointDocumentation({
      id: "read",
      description: "Read.",
      rules: [{ code: "ready", description: "Ready." }],
      ...changes,
    }),
  ).toThrow(/checkpoint documentation/i);
});

it("rejects blank runtime instructions rather than silently dropping them", () => {
  expect(() =>
    defineCheckpoint({
      id: "read",
      target: Type.Object({}),
      description: "Read.",
      instructions: " ",
      rules: [{ code: "ready", description: "Ready." }],
      check: () => Promise.resolve({ pass: true, output: undefined }),
    }),
  ).toThrow(/instructions/);
});
