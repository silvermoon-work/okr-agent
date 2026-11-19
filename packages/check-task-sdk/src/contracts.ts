import { Kind, Type, type Static, type TSchema } from "@sinclair/typebox";
import { ContentRefSchema } from "@silvermoon-work/ipfs-payload/typebox";

export const portableIdentifier = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value) &&
  !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value);

export function checkpointIds(ids: readonly string[]): readonly string[] {
  if (
    !Array.isArray(ids) ||
    ids.some((id) => !portableIdentifier(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Invalid or duplicate checkpoint IDs.");
  return Object.freeze(Array.from<string>(ids));
}

export function ruleCodes(schema: TSchema): readonly string[] {
  const members: TSchema[] =
    schema[Kind] === "Union" ? (schema.anyOf as TSchema[]) : [schema];
  if (
    !members.length ||
    members.some(
      (member) =>
        member[Kind] !== "Literal" || !portableIdentifier(member.const),
    )
  )
    throw new Error(
      "Rule codes must be a nonempty portable lowercase literal union.",
    );
  const codes = members.map((member) => member.const as string);
  if (new Set(codes).size !== codes.length)
    throw new Error("Duplicate rule code.");
  return Object.freeze(codes);
}

export function createCheckContract<
  Input extends TSchema,
  Code extends TSchema,
>(
  input: Input,
  code: Code & (Static<Code> extends string ? unknown : never),
  ids: readonly string[],
) {
  ruleCodes(code);
  const checkpoint = Type.Union(
    checkpointIds(ids).map((id) => Type.Literal(id)),
  );
  const problem = Type.Object(
    {
      checkpoint,
      code,
      brief: Type.String({ minLength: 1, pattern: "\\S" }),
    },
    { additionalProperties: false },
  );
  const body = {
    documentation: ContentRefSchema(),
    references: Type.Array(
      Type.Object(
        { checkpoint, documentation: ContentRefSchema() },
        { additionalProperties: false },
      ),
    ),
    assets: Type.Optional(ContentRefSchema()),
  };
  return {
    parameters: input,
    result: Type.Union([
      Type.Object(
        { pass: Type.Literal(true), ...body },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          pass: Type.Literal(false),
          ...body,
          problems: Type.Array(problem, { minItems: 1 }),
        },
        { additionalProperties: false },
      ),
    ]),
    message: Type.Never(),
    schemas: {
      "check-rule-code": code,
      "check-checkpoint-id": checkpoint,
    },
  };
}

export interface CheckContract<
  Input extends TSchema = TSchema,
  Code extends TSchema = TSchema,
> {
  readonly parameters: Input;
  readonly result: TSchema;
  readonly schemas: {
    readonly "check-rule-code": Code;
    readonly "check-checkpoint-id": TSchema;
  };
}

export function contractCheckpointIds(schema: TSchema): readonly string[] {
  const members: TSchema[] =
    schema[Kind] === "Union" ? (schema.anyOf as TSchema[]) : [schema];
  if (schema[Kind] === "Never") return [];
  if (members.some((member) => member[Kind] !== "Literal"))
    throw new Error("Invalid checkpoint ID schema.");
  return checkpointIds(members.map((member) => member.const as string));
}
