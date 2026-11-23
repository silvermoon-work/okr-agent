import { describe, expect, it } from "vitest";
import { validateCheckBundleSpec } from "../src/spec.js";
import { typescriptProjectSpec } from "../src/typescript-project.js";
import { typescriptProjectDesignSpec } from "../src/typescript-project-design.js";
import type { CheckBundleSpec } from "../src/spec.js";
import { orderedSpec } from "./fixtures.js";

describe("Spec v1 validation", () => {
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
      "workspace-script-required",
      "workspace-script-allowed",
      "workspace-script-command-standard",
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
      "unsupported version",
      (spec: CheckBundleSpec) => Object.assign(spec, { specVersion: "2.0" }),
    ],
    [
      "unsupported annotation",
      (spec: CheckBundleSpec) =>
        Object.assign(spec, { $schema: "urn:ipfsaw:check-bundle:2" }),
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
      "missing output",
      (spec: CheckBundleSpec) =>
        Reflect.deleteProperty(spec.checkpoints[0]!, "output"),
    ],
    [
      "blank output description",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.output.description = " ";
      },
    ],
    [
      "empty output fields",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.output.fields = [];
      },
    ],
    [
      "blank output field name",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.output.fields![0]!.name = " ";
      },
    ],
    [
      "blank output field description",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.output.fields![0]!.description = "";
      },
    ],
    [
      "output JSON schema",
      (spec: CheckBundleSpec) =>
        Object.assign(spec.checkpoints[0]!.output, {
          schema: { type: "object" },
        }),
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
      "missing instructions",
      (spec: CheckBundleSpec) =>
        Reflect.deleteProperty(spec.checkpoints[0]!, "instructions"),
    ],
    [
      "blank instructions",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.instructions = " ";
      },
    ],
    [
      "non-text instructions",
      (spec: CheckBundleSpec) =>
        Object.assign(spec.checkpoints[0]!, { instructions: [] }),
    ],
    [
      "empty title",
      (spec: CheckBundleSpec) => {
        spec.checkpoints[0]!.title = "";
      },
    ],
    [
      "missing Task description",
      (spec: CheckBundleSpec) => Reflect.deleteProperty(spec, "description"),
    ],
    [
      "blank Task description",
      (spec: CheckBundleSpec) => {
        spec.description = " ";
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

  it.each(["root", "parameter", "checkpoint"] as const)(
    "rejects obsolete %s preconditions as unknown rather than interpreting them",
    (scope) => {
      const spec = orderedSpec();
      const target =
        scope === "root"
          ? spec
          : scope === "parameter"
            ? spec.parameter
            : spec.checkpoints[0]!;
      Object.assign(target, { preconditions: ["legacy assumption"] });
      const result = validateCheckBundleSpec(spec);
      if (result.valid) throw new Error("expected invalid");
      expect(result.issues).toContainEqual({
        path:
          scope === "root"
            ? "/"
            : scope === "parameter"
              ? "/parameter"
              : "/checkpoints/0",
        message:
          'must NOT have additional properties {"additionalProperty":"preconditions"}',
      });
    },
  );

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

  it("reports duplicate output names at their exact scope, allowing the same name in other checkpoints", () => {
    const spec = orderedSpec();
    const field = spec.checkpoints[0]!.output.fields![0]!;
    spec.checkpoints[1]!.output.fields = [{ ...field }];
    expect(validateCheckBundleSpec(spec).valid).toBe(true);
    spec.checkpoints[0]!.output.fields!.push({ ...field });
    const result = validateCheckBundleSpec(spec);
    if (result.valid) throw new Error("expected invalid");
    expect(result.issues).toEqual([
      {
        path: "/checkpoints/0/output/fields/1/name",
        message: "本 checkpoint 中重复的输出字段名：directory",
      },
    ]);
  });

  it.each(["`undefined`", "数字或字符串", "`Map`", "函数"])(
    "accepts description-only success output documentation for %s without runtime serialization",
    (description) => {
      const spec = orderedSpec();
      spec.checkpoints[0]!.output = { description };
      expect(validateCheckBundleSpec(spec).valid).toBe(true);
    },
  );

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

  it("rejects obsolete graph documents even with the current version", () => {
    const result = validateCheckBundleSpec({
      specVersion: "1.0",
      name: "Legacy",
      root: "entry",
      checkers: {},
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.issues.some(
          ({ path, message }) =>
            path === "/" && message.includes('"missingProperty":"checkpoints"'),
        ),
      ).toBe(true);
      expect(result.issues.some(({ path }) => path === "/specVersion")).toBe(
        false,
      );
    }
  });
});
