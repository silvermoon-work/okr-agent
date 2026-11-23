import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchemaObject, ErrorObject } from "ajv";

export interface CheckpointDefinition {
  id: string;
  title: string;
  description: string;
  instructions: string;
  output: {
    description: string;
    fields?: { name: string; description: string }[];
  };
  rules: { code: string; description: string }[];
}

export interface CheckBundleSpec {
  $schema?: "urn:ipfsaw:check-bundle:1";
  specVersion: "1.0";
  name: string;
  description: string;
  parameter: {
    schema: Record<string, unknown>;
  };
  checkpoints: CheckpointDefinition[];
}

const text = { type: "string", minLength: 1, pattern: "\\S" };
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });

/** JSON Schema 2020-12; scoped identifier uniqueness is checked separately. */
export const checkBundleSpecSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...object(
    {
      $schema: { const: "urn:ipfsaw:check-bundle:1" },
      specVersion: { const: "1.0" },
      name: text,
      description: text,
      parameter: object({
        schema: {
          type: "object",
          required: ["type"],
          properties: { type: { const: "object" } },
        },
      }),
      checkpoints: {
        type: "array",
        minItems: 1,
        items: object({
          id: {
            type: "string",
            pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)*$",
            not: { pattern: "^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\\.|$)" },
          },
          title: text,
          description: text,
          instructions: text,
          output: object(
            {
              description: text,
              fields: {
                type: "array",
                minItems: 1,
                items: object({ name: text, description: text }),
              },
            },
            ["description"],
          ),
          rules: {
            type: "array",
            minItems: 1,
            items: object({ code: text, description: text }),
          },
        }),
      },
    },
    ["specVersion", "name", "description", "parameter", "checkpoints"],
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
    try {
      new Ajv2020(ajvOptions).compile(
        value.parameter.schema as AnySchemaObject,
      );
    } catch (error) {
      issues.push({
        path: "/parameter/schema",
        message: `无效的参数 JSON Schema：${String(error)}`,
      });
    }
    const ids = new Set<string>();
    value.checkpoints.forEach((checkpoint, index) => {
      const base = `/checkpoints/${String(index)}`;
      if (ids.has(checkpoint.id))
        issues.push({
          path: `${base}/id`,
          message: `重复的 checkpoint ID：${checkpoint.id}`,
        });
      ids.add(checkpoint.id);
      const names = new Set<string>();
      checkpoint.output.fields?.forEach((field, fieldIndex) => {
        if (names.has(field.name))
          issues.push({
            path: `${base}/output/fields/${String(fieldIndex)}/name`,
            message: `本 checkpoint 中重复的输出字段名：${field.name}`,
          });
        names.add(field.name);
      });
      const codes = new Set<string>();
      checkpoint.rules.forEach((rule, ruleIndex) => {
        if (codes.has(rule.code))
          issues.push({
            path: `${base}/rules/${String(ruleIndex)}/code`,
            message: `本 checkpoint 中重复的规则码：${rule.code}`,
          });
        codes.add(rule.code);
      });
    });
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
