import { describe, expect, it } from "vitest";
import { validateCheckBundleSpec } from "../src/spec.js";
import { createOutline } from "../src/outline.js";
import { typescriptProjectSpec } from "../src/typescript-project.js";
import { typescriptProjectDesignSpec } from "../src/typescript-project-design.js";
import type { CheckBundleSpec } from "../src/spec.js";
import { graphSpec, validationSpec } from "./fixtures.js";

const fresh = () => structuredClone(validationSpec);
const edge = (checker: string) => ({
  checker,
  when: "文档条件",
  parameter: "文档参数",
});

describe("Spec validation", () => {
  it("keeps the proposed member expansion valid and separate from the implemented graph", () => {
    expect(validateCheckBundleSpec(typescriptProjectDesignSpec).valid).toBe(
      true,
    );
    const design = typescriptProjectDesignSpec.checkers;
    expect(design["single-repo"]!.parameter.schema.required).toEqual([
      "projectDirectory",
      "packageJson",
    ]);
    expect(design["monorepo"]!.parameter.schema.required).toEqual([
      "projectDirectory",
      "packageJson",
      "workspace",
    ]);
    expect(design["workspace"]!.parameter.schema).toEqual(
      design["monorepo"]!.parameter.schema,
    );
    expect(
      design["workspace"]!.rules.flatMap((rule) =>
        rule.problems.map((problem) => problem.code),
      ),
    ).toEqual([
      "workspace-scripts-missing",
      "workspace-scripts-invalid",
      "workspace-turbo-missing",
      "workspace-turbo-invalid",
    ]);
    expect(
      design["project"]!.rules.flatMap((rule) =>
        rule.problems.map((problem) => problem.code),
      ),
    ).toContain("workspace-configuration-invalid");
    expect(design["monorepo"]!.children.map((edge) => edge.checker)).toEqual([
      "workspace",
      "packages",
    ]);
    expect(design["workspace"]!.children.map((edge) => edge.checker)).toEqual([
      "workspace-scripts",
      "workspace-turbo",
      "workspace-tools",
    ]);
    expect(design["workspace-scripts"]!.parameter.schema.required).toEqual([
      "projectDirectory",
      "scripts",
    ]);
    expect(design["workspace-turbo"]!.parameter.schema.required).toEqual([
      "projectDirectory",
      "configurationPath",
    ]);
    expect(typescriptProjectSpec.checkers).not.toHaveProperty(
      "workspace-scripts",
    );
    expect(typescriptProjectSpec.checkers).not.toHaveProperty(
      "workspace-turbo",
    );
    expect(
      design["workspace-tools"]!.children.map((edge) => edge.checker),
    ).toContain("tool-@vitest/coverage-v8");
    expect(design["workspace-scripts"]!.children).toEqual([]);
    expect(
      design["workspace-scripts"]!.rules.flatMap((rule) =>
        rule.problems.map((problem) => problem.code),
      ),
    ).toEqual([
      "workspace-script-missing",
      "workspace-script-unexpected",
      "workspace-script-command-invalid",
    ]);
    expect(
      Object.keys(design).some((checker) => checker.startsWith("script-")),
    ).toBe(false);
    expect(design["monorepo"]!.children[1]?.parameter).toContain(
      "patterns: workspace.packages",
    );
    expect(design["packages"]!.children[0]?.checker).toBe("package");
    expect(design["packages"]!.children[0]?.forEach).toBeTruthy();
    expect(design["packages"]!.parameter.schema.required).toEqual([
      "projectDirectory",
      "patterns",
    ]);
    expect(design["package"]!.parameter.schema.required).toEqual([
      "projectDirectory",
      "packageDirectory",
    ]);
    expect(typescriptProjectSpec.checkers["workspace"]!.children).toEqual([]);
    expect(typescriptProjectSpec.checkers).not.toHaveProperty("packages");
    expect(typescriptProjectSpec.checkers).not.toHaveProperty("package");
    expect(
      typescriptProjectSpec.checkers["monorepo"]!.parameter.schema.required,
    ).toEqual(["projectDirectory"]);
  });

  it("describes the implemented workspace branch without adding planned member checks", () => {
    const { checkers } = typescriptProjectSpec;
    expect(Object.keys(checkers).sort()).toEqual([
      "monorepo",
      "project",
      "single-repo",
      "workspace",
    ]);
    expect(checkers["project"]!.children.map((child) => child.checker)).toEqual(
      ["single-repo", "monorepo"],
    );
    expect(checkers["monorepo"]!.children).toEqual([
      {
        checker: "workspace",
        when: "本节点通过，即取消信号未触发。",
        parameter: "原样传递 `target`，即 `{ projectDirectory }`。",
      },
    ]);
    expect(checkers["workspace"]!.parameter.schema).toEqual(
      checkers["project"]!.parameter.schema,
    );
    expect(
      checkers["workspace"]!.rules.flatMap((rule) =>
        rule.problems.map((problem) => problem.code),
      ),
    ).toEqual([
      "workspace-configuration-invalid",
      "workspace-configuration-invalid",
      "workspace-configuration-invalid",
    ]);
    expect(checkers["workspace"]!.children).toEqual([]);
    expect(checkers["single-repo"]!.children).toEqual([]);
  });

  it("accepts the current real project graph and preserves inert text", () => {
    expect(validateCheckBundleSpec(typescriptProjectSpec).valid).toBe(true);
    const spec = fresh();
    spec.checkers["member-context"]!.children[0]!.parameter =
      "globalThis.notExecuted = true; <script>alert('text')</script>";
    expect(validateCheckBundleSpec(spec)).toEqual({ valid: true, spec });
  });

  it.each([
    [
      "version",
      (spec: CheckBundleSpec) => Object.assign(spec, { specVersion: "2.0" }),
    ],
    [
      "extra Ensures",
      (spec: CheckBundleSpec) =>
        Object.assign(spec.checkers["member-context"]!, { ensures: [] }),
    ],
    [
      "parameter shape",
      (spec: CheckBundleSpec) => {
        spec.checkers["member-context"]!.parameter.schema = { type: "string" };
      },
    ],
    [
      "empty condition",
      (spec: CheckBundleSpec) => {
        spec.checkers["member-context"]!.children[0]!.when = " ";
      },
    ],
    [
      "problem trigger",
      (spec: CheckBundleSpec) => {
        spec.checkers["member-scripts"]!.rules[0]!.problems[0]!.when = "";
      },
    ],
  ])("rejects malformed %s with an explicit path", (_label, change) => {
    const spec = fresh();
    change(spec);
    const result = validateCheckBundleSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.path).toMatch(/^\//);
  });

  it("reports all missing references and invalid embedded schemas together", () => {
    const spec = fresh();
    spec.root = "toString";
    spec.checkers["member-context"]!.parameter.schema = {
      type: "object",
      properties: { directory: { type: "unknown" } },
    };
    spec.checkers["member-context"]!.children[0]!.checker = "missing";
    const result = validateCheckBundleSpec(spec);
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.issues.map((issue) => issue.path)).toEqual([
        "/root",
        "/checkers/member-context/parameter/schema",
        "/checkers/member-context/children/0/checker",
      ]);
  });

  it("accepts local schema references but never fetches external ones", () => {
    const spec = fresh();
    spec.checkers["member-context"]!.parameter.schema = {
      $id: "urn:example:member",
      type: "object",
      $defs: { directory: { type: "string" } },
      properties: { directory: { $ref: "#/$defs/directory" } },
    };
    expect(validateCheckBundleSpec(spec).valid).toBe(true);
    expect(validateCheckBundleSpec(spec).valid).toBe(true);
    spec.checkers["member-context"]!.parameter.schema.properties = {
      directory: { $ref: "https://example.invalid/schema" },
    };
    expect(validateCheckBundleSpec(spec).valid).toBe(false);
  });

  it("allows a shared diamond DAG", () => {
    const spec = graphSpec();
    expect(validateCheckBundleSpec(spec)).toEqual({ valid: true, spec });
  });

  it.each([
    {
      name: "self-loop",
      connect: (spec: CheckBundleSpec) => {
        spec.checkers.shared!.children = [edge("shared")];
      },
      pointer: "/checkers/shared/children/0/checker",
      cycle: "shared → shared",
    },
    {
      name: "multi-node cycle",
      connect: (spec: CheckBundleSpec) => {
        spec.checkers.shared!.children = [edge("root")];
      },
      pointer: "/checkers/shared/children/0/checker",
      cycle: "root → left → shared → root",
    },
    {
      name: "disconnected cycle",
      connect: (spec: CheckBundleSpec) => {
        spec.checkers.detached!.children = [edge("orphan")];
        spec.checkers.orphan = {
          ...spec.checkers.shared!,
          children: [edge("detached")],
        };
      },
      pointer: "/checkers/orphan/children/0/checker",
      cycle: "detached → orphan → detached",
    },
  ])(
    "rejects $name with a closing-edge pointer and checker path",
    ({ connect, pointer, cycle }) => {
      const spec = graphSpec();
      connect(spec);
      const result = validateCheckBundleSpec(spec);
      if (result.valid) throw new Error("expected invalid");
      expect(result.issues).toEqual([
        {
          path: pointer,
          message: `checker 引用存在循环：${cycle}；定义必须是 DAG。`,
        },
      ]);
    },
  );

  it("reports missing references alongside a cycle instead of hiding either error", () => {
    const spec = graphSpec();
    spec.checkers.shared!.children = [edge("root"), edge("missing")];
    const result = validateCheckBundleSpec(spec);
    if (result.valid) throw new Error("expected invalid");
    expect(result.issues).toEqual([
      {
        path: "/checkers/shared/children/1/checker",
        message: "找不到 checker：missing",
      },
      {
        path: "/checkers/shared/children/0/checker",
        message:
          "checker 引用存在循环：root → left → shared → root；定义必须是 DAG。",
      },
    ]);
  });

  it("escapes checker names in diagnostic JSON pointers", () => {
    const spec = fresh();
    spec.checkers["a~/b"] = {
      ...spec.checkers["member-context"]!,
      children: [{ checker: "absent", when: "text", parameter: "text" }],
    };
    const result = validateCheckBundleSpec(spec);
    if (result.valid) throw new Error("expected invalid");
    expect(result.issues[0]?.path).toBe("/checkers/a~0~1b/children/0/checker");
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
});

describe("definition outline", () => {
  it("expands shared DAG definitions once and preserves edges and detached definitions", () => {
    const outline = createOutline(graphSpec());
    const root = outline[0]!;
    const shared = root.children[0]!.children[0]!;
    const right = root.children[1]!;
    expect(right.edge?.forEach).toBe("已发现成员");
    expect(right.children[0]).toMatchObject({
      reference: "shared",
      targetId: shared.id,
      children: [],
    });
    expect(outline[1]).toMatchObject({ checker: "detached", detached: true });
    expect(root.children[0]!.reference).toBeUndefined();
  });
});
