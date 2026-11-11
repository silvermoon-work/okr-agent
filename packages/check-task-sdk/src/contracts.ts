import { Kind, Type, type Static, type TSchema } from "@sinclair/typebox";

export interface CheckProblem<Code extends string = string> {
  readonly code: Code;
  readonly brief: string;
  readonly documentation: string;
}

export type CheckResult<Code extends string = string> =
  | { readonly pass: true; readonly documentation: string }
  | {
      readonly pass: false;
      readonly documentation: string;
      readonly problems: readonly [CheckProblem<Code>, ...CheckProblem<Code>[]];
    };

/** A finite TypeBox literal or union of literals; codes are portable file stems. */
export function problemCodes(schema: TSchema): readonly string[] {
  const members: TSchema[] =
    schema[Kind] === "Union" ? (schema.anyOf as TSchema[]) : [schema];
  if (!members.length)
    throw new Error("Problem codes must be a nonempty literal union.");
  const codes = members.map((member) => {
    if (
      member[Kind] !== "Literal" ||
      typeof member.const !== "string" ||
      !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(member.const) ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(member.const)
    )
      throw new Error(
        "Problem codes must be portable lowercase string literals.",
      );
    return member.const;
  });
  if (new Set(codes).size !== codes.length)
    throw new Error("Duplicate problem code.");
  return Object.freeze(codes);
}

export function createCheckContract<
  Input extends TSchema,
  Code extends TSchema,
>(input: Input, code: Code & (Static<Code> extends string ? unknown : never)) {
  problemCodes(code);
  const problem = Type.Object(
    {
      code,
      brief: Type.String({ minLength: 1, pattern: "\\S" }),
      documentation: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  );
  const result = Type.Union([
    Type.Object(
      {
        pass: Type.Literal(true),
        documentation: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        pass: Type.Literal(false),
        documentation: Type.String({ minLength: 1 }),
        problems: Type.Array(problem, { minItems: 1 }),
      },
      { additionalProperties: false },
    ),
  ]);
  return {
    input,
    result,
    message: Type.Never(),
    schemas: { "check-problem-code": code, "check-problem": problem },
  };
}

export type CheckContract<
  Input extends TSchema = TSchema,
  Code extends TSchema = TSchema,
> = {
  readonly input: Input;
  readonly schemas: { readonly "check-problem-code": Code };
};
