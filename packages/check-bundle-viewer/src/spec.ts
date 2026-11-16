import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchemaObject, ErrorObject } from "ajv";

export interface ChildDefinition {
  checker: string;
  when: string;
  parameter: string;
  forEach?: string;
}

export interface CheckerDefinition {
  title: string;
  description: string;
  parameter: {
    schema: Record<string, unknown>;
    preconditions: string[];
  };
  rules: {
    description: string;
    problems: { code: string; description: string; when: string }[];
  }[];
  children: ChildDefinition[];
}

export interface CheckBundleSpec {
  $schema?: "urn:ipfsaw:check-bundle:1";
  specVersion: "1.0";
  name: string;
  root: string;
  checkers: Record<string, CheckerDefinition>;
}

const text = { type: "string", minLength: 1, pattern: "\\S" };
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });

/** JSON Schema 2020-12 for document shape; reference and DAG checks run separately. */
export const checkBundleSpecSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...object(
    {
      $schema: { const: "urn:ipfsaw:check-bundle:1" },
      specVersion: { const: "1.0" },
      name: text,
      root: text,
      checkers: {
        type: "object",
        minProperties: 1,
        propertyNames: text,
        additionalProperties: object({
          title: text,
          description: text,
          parameter: object({
            schema: {
              type: "object",
              required: ["type"],
              properties: { type: { const: "object" } },
            },
            preconditions: { type: "array", items: text, uniqueItems: true },
          }),
          rules: {
            type: "array",
            items: object({
              description: text,
              problems: {
                type: "array",
                items: object({ code: text, description: text, when: text }),
              },
            }),
          },
          children: {
            type: "array",
            items: object(
              { checker: text, when: text, parameter: text, forEach: text },
              ["checker", "when", "parameter"],
            ),
          },
        }),
      },
    },
    ["specVersion", "name", "root", "checkers"],
  ),
} as const;

const ajvOptions = {
  allErrors: true,
  strict: false,
  validateFormats: false,
  addUsedSchema: false,
};
const ajv = new Ajv2020(ajvOptions);
const validateShape = ajv.compile<CheckBundleSpec>(checkBundleSpecSchema);

export interface SpecIssue {
  path: string;
  message: string;
}
export type SpecValidation =
  | { valid: true; spec: CheckBundleSpec }
  | { valid: false; issues: SpecIssue[] };

function isJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  const next = new Set(ancestors).add(value);
  return Object.values(value).every((item: unknown) => isJson(item, next));
}

function shapeIssues(errors: ErrorObject[]): SpecIssue[] {
  return errors.map((error) => ({
    path: error.instancePath || "/",
    message: `${error.message ?? "invalid"} ${JSON.stringify(error.params)}`,
  }));
}

function pointer(name: string): string {
  return name.replaceAll("~", "~0").replaceAll("/", "~1");
}

function cycleIssues(spec: CheckBundleSpec): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    path.push(name);
    spec.checkers[name]!.children.forEach((child, index) => {
      if (!Object.hasOwn(spec.checkers, child.checker)) return;
      const start = path.indexOf(child.checker);
      if (start !== -1)
        issues.push({
          path: `/checkers/${pointer(name)}/children/${String(index)}/checker`,
          message: `checker 引用存在循环：${[...path.slice(start), child.checker].join(" → ")}；定义必须是 DAG。`,
        });
      else visit(child.checker);
    });
    path.pop();
  };
  for (const name of Object.keys(spec.checkers)) visit(name);
  return issues;
}

export function validateCheckBundleSpec(value: unknown): SpecValidation {
  try {
    if (!isJson(value))
      return {
        valid: false,
        issues: [{ path: "/", message: "Spec 必须是无循环的 JSON 数据。" }],
      };
    if (!validateShape(value))
      return { valid: false, issues: shapeIssues(validateShape.errors ?? []) };
    const issues: SpecIssue[] = [];
    if (!Object.hasOwn(value.checkers, value.root))
      issues.push({ path: "/root", message: `找不到 checker：${value.root}` });
    for (const [name, checker] of Object.entries(value.checkers)) {
      const base = `/checkers/${pointer(name)}`;
      try {
        new Ajv2020(ajvOptions).compile(
          checker.parameter.schema as AnySchemaObject,
        );
      } catch (error) {
        issues.push({
          path: `${base}/parameter/schema`,
          message: `无效的参数 JSON Schema：${String(error)}`,
        });
      }
      checker.children.forEach((child, index) => {
        if (!Object.hasOwn(value.checkers, child.checker))
          issues.push({
            path: `${base}/children/${String(index)}/checker`,
            message: `找不到 checker：${child.checker}`,
          });
      });
    }
    issues.push(...cycleIssues(value));
    return issues.length
      ? { valid: false, issues }
      : { valid: true, spec: value };
  } catch (error) {
    return {
      valid: false,
      issues: [{ path: "/", message: `无法读取 Spec：${String(error)}` }],
    };
  }
}
