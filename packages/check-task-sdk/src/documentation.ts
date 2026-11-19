import { portableIdentifier } from "./contracts.js";

export interface Rule<Code extends string = string> {
  readonly code: Code;
  readonly description: string;
}

/** Documentation only, never a schema or a representation of a runtime value. */
export interface OutputDocumentation {
  readonly description: string;
  readonly fields?: readonly {
    readonly name: string;
    readonly description: string;
  }[];
}

export interface CheckpointDocumentation {
  readonly id: string;
  readonly title?: string;
  readonly description: string;
  readonly instructions?: string;
  readonly rules: readonly Rule[];
  readonly output?: OutputDocumentation;
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validateCheckpointRules(
  value: unknown,
): asserts value is readonly [Rule, ...Rule[]] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some(
      (rule: unknown) =>
        !record(rule) ||
        typeof rule.code !== "string" ||
        !portableIdentifier(rule.code) ||
        !nonempty(rule.description) ||
        Object.keys(rule).some((key) => !["code", "description"].includes(key)),
    ) ||
    new Set((value as Rule[]).map((rule) => rule.code)).size !== value.length
  )
    throw new Error("Invalid or duplicate checkpoint rules.");
}

export function validateOutputDocumentation(
  value: unknown,
): asserts value is OutputDocumentation {
  if (
    !record(value) ||
    !nonempty(value.description) ||
    Object.keys(value).some((key) => !["description", "fields"].includes(key))
  )
    throw new Error("Invalid output documentation.");
  if (value.fields !== undefined) {
    if (
      !Array.isArray(value.fields) ||
      !value.fields.length ||
      value.fields.some(
        (field: unknown) =>
          !record(field) ||
          !nonempty(field.name) ||
          !nonempty(field.description) ||
          Object.keys(field).some(
            (key) => !["name", "description"].includes(key),
          ),
      ) ||
      new Set(
        (value.fields as NonNullable<OutputDocumentation["fields"]>).map(
          (field) => field.name,
        ),
      ).size !== value.fields.length
    )
      throw new Error("Invalid or duplicate output documentation fields.");
  }
}

const text = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_[\]{}()#+.!|~-]/g, "\\$&");

/** Render inert Markdown; never execute instructions or resolve includes. */
export function renderCheckpointDocumentation(
  checkpoint: CheckpointDocumentation,
): string {
  if (
    !portableIdentifier(checkpoint.id) ||
    !nonempty(checkpoint.description) ||
    (checkpoint.title !== undefined && !nonempty(checkpoint.title)) ||
    (checkpoint.instructions !== undefined &&
      !nonempty(checkpoint.instructions))
  )
    throw new Error(
      "Invalid checkpoint documentation ID, title, description or instructions.",
    );
  validateCheckpointRules(checkpoint.rules);
  if (checkpoint.output !== undefined)
    validateOutputDocumentation(checkpoint.output);
  return (
    [
      `# ${text(checkpoint.title ?? checkpoint.id)}`,
      "## Description",
      text(checkpoint.description),
      ...(checkpoint.instructions
        ? ["## Agent instructions", checkpoint.instructions.trim()]
        : []),
      "## Acceptance rules",
      checkpoint.rules
        .map((rule) => `- \`${rule.code}\`: ${text(rule.description)}`)
        .join("\n"),
      ...(checkpoint.output
        ? [
            "## Successful Context output",
            text(checkpoint.output.description),
            ...(checkpoint.output.fields
              ? [
                  checkpoint.output.fields
                    .map(
                      (field) =>
                        `- **${text(field.name)}**: ${text(field.description)}`,
                    )
                    .join("\n"),
                ]
              : []),
          ]
        : []),
    ].join("\n\n") + "\n"
  );
}
