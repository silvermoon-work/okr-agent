import { describe, expect, it } from "vitest";
import { validateCheckBundleSpec } from "../src/spec.js";
import { typescriptProjectSpec } from "../src/typescript-project.js";
import { typescriptProjectDesignSpec } from "../src/typescript-project-design.js";
import type { CheckBundleSpec } from "../src/spec.js";
import { orderedSpec } from "./fixtures.js";

describe("Spec v2 validation", () => {
  it("accepts shipped definitions with one task Target and preserves checkpoint and rule order", () => {
    for (const spec of [
      typescriptProjectSpec,
      typescriptProjectDesignSpec,
      orderedSpec(),
    ]) {
      const before = structuredClone(spec);
      expect(validateCheckBundleSpec(spec)).toEqual({ valid: true, spec });
      expect(spec).toEqual(before);
    }
    expect(typescriptProjectSpec.checkpoints.map(({ id }) => id)).toEqual([
      "project",
      "workspace",
    ]);
    const scripts = typescriptProjectDesignSpec.checkpoints.find(
      ({ id }) => id === "workspace-scripts",
    )!;
    expect(scripts.rules.map(({ code }) => code)).toEqual([
      "workspace-script-missing",
      "workspace-script-unexpected",
      "workspace-script-command-invalid",
    ]);
    expect(
      typescriptProjectDesignSpec.checkpoints.find(
        ({ id }) => id === "tool-vitest-coverage-v8",
      )?.title,
    ).toContain("@vitest/coverage-v8");
  });

  it("allows identical codes in different checkpoints and treats descriptions as inert text", () => {
    const spec = orderedSpec();
    spec.checkpoints[0]!.rules[0]!.description =
      "globalThis.notExecuted = true; <script>alert('text')</script>";
    expect(validateCheckBundleSpec(spec)).toEqual({ valid: true, spec });
  });

  it.each([
    [
      "old version",
      (spec: CheckBundleSpec) => Object.assign(spec, { specVersion: "1.0" }),
    ],
    [
      "old annotation",
      (spec: CheckBundleSpec) =>
        Object.assign(spec, { $schema: "urn:ipfsaw:check-bundle:1" }),
    ],
    [
      "unknown annotation",
      (spec: CheckBundleSpec) =>
        Object.assign(spec, { $schema: "urn:unknown:2" }),
    ],
    [
      "old root",
      (spec: CheckBundleSpec) => Object.assign(spec, { root: "context" }),
    ],
    [
      "old checkers",
      (spec: CheckBundleSpec) => Object.assign(spec, { checkers: {} }),
    ],
    [
      "old children",
      (spec: CheckBundleSpec) =>
        Object.assign(spec.checkpoints[0]!, { children: [] }),
    ],
    [
      "old parents",
      (spec: CheckBundleSpec) =>
        Object.assign(spec.checkpoints[0]!, { parents: [] }),
    ],
    [
      "old problems",
      (spec: CheckBundleSpec) =>
        Object.assign(spec.checkpoints[0]!.rules[0]!, { problems: [] }),
    ],
    [
      "local parameter",
      (spec: CheckBundleSpec) =>
        Object.assign(spec.checkpoints[0]!, { parameter: spec.parameter }),
    ],
    [
      "empty checkpoints",
      (spec: CheckBundleSpec) => {
        spec.checkpoints = [];
      },
    ],
    [
      "empty rules",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.rules = [];
      },
    ],
    [
      "empty code",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.rules[0]!.code = " ";
      },
    ],
    [
      "empty description",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.description = " ";
      },
    ],
    [
      "empty title",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.title = "";
      },
    ],
    [
      "duplicate preconditions",
      (spec: CheckBundleSpec) => {
        spec.parameter.preconditions = ["same", "same"];
      },
    ],
    [
      "parameter shape",
      (spec: CheckBundleSpec) => {
        spec.parameter.schema = { type: "string" };
      },
    ],
  ])("rejects malformed %s with an explicit JSON Pointer", (_label, change) => {
    const spec = orderedSpec();
    change(spec);
    const result = validateCheckBundleSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.path).toMatch(/^\//);
  });

  it.each([
    "",
    "../escape",
    "a/b",
    "a b",
    "UPPER",
    "_leading",
    "a--b",
    "con",
    "nul.txt",
    "com1",
    "lpt9.md",
  ])("rejects nonportable checkpoint ID %j", (id) => {
    const spec = orderedSpec();
    spec.checkpoints[0]!.id = id;
    const result = validateCheckBundleSpec(spec);
    if (result.valid) throw new Error("expected invalid");
    expect(result.issues.some(({ path }) => path === "/checkpoints/0/id")).toBe(
      true,
    );
  });

  it("reports all duplicate IDs, locally duplicate codes and invalid schemas together", () => {
    const spec = orderedSpec();
    spec.parameter.schema = {
      type: "object",
      properties: { directory: { type: "unknown" } },
    };
    spec.checkpoints[1]!.id = spec.checkpoints[0]!.id;
    spec.checkpoints[1]!.rules.push({ ...spec.checkpoints[1]!.rules[0]! });
    const result = validateCheckBundleSpec(spec);
    if (result.valid) throw new Error("expected invalid");
    expect(result.issues.map(({ path }) => path)).toEqual([
      "/parameter/schema",
      "/checkpoints/1/id",
      "/checkpoints/1/rules/1/code",
    ]);
  });

  it("accepts local schema references but never fetches external ones", () => {
    const spec = orderedSpec();
    spec.parameter.schema = {
      $id: "urn:example:member",
      type: "object",
      $defs: { directory: { type: "string" } },
      properties: { directory: { $ref: "#/$defs/directory" } },
    };
    expect(validateCheckBundleSpec(spec).valid).toBe(true);
    expect(validateCheckBundleSpec(spec).valid).toBe(true);
    spec.parameter.schema.properties = {
      directory: { $ref: "https://example.invalid/schema" },
    };
    expect(validateCheckBundleSpec(spec).valid).toBe(false);
  });

  it.each([
    undefined,
    NaN,
    1n,
    () => undefined,
    new Date(),
    { value: undefined },
  ])("rejects non-JSON input %s", (value) => {
    expect(validateCheckBundleSpec(value).valid).toBe(false);
  });

  it("rejects object cycles, catches unreadable data and handles JSON primitives", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(validateCheckBundleSpec(cycle).valid).toBe(false);
    const unreadable = {
      get value(): unknown {
        throw new Error("unreadable");
      },
    };
    const result = validateCheckBundleSpec(unreadable);
    if (result.valid) throw new Error("expected invalid");
    expect(result.issues[0]?.message).toContain("无法读取");
    for (const value of [null, true, 1, "text", Object.create(null) as unknown])
      expect(validateCheckBundleSpec(value).valid).toBe(false);
  });

  it("rejects v1 documents rather than reinterpreting their definition order", () => {
    const result = validateCheckBundleSpec({
      specVersion: "1.0",
      name: "Legacy",
      root: "entry",
      checkers: {},
    });
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.issues.some(({ path }) => path === "/specVersion")).toBe(
        true,
      );
  });
});
