import { Kind, Type, type Static, type TSchema } from "@sinclair/typebox";

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
  const localSource = Type.Object(
    {
      kind: Type.Literal("local"),
      checker: Type.String(),
      nodeKey: Type.String(),
    },
    { additionalProperties: false },
  );
  const externalSource = Type.Object(
    {
      kind: Type.Literal("output"),
      bundleCid: Type.String(),
      outputCid: Type.String(),
      checker: Type.String(),
      nodeKey: Type.String(),
    },
    { additionalProperties: false },
  );
  const reportProblem = Type.Union([
    Type.Object(
      {
        ...problem.properties,
        nodeKey: Type.String(),
        source: localSource,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...problem.properties,
        code: Type.String(),
        nodeKey: Type.String(),
        source: externalSource,
      },
      { additionalProperties: false },
    ),
  ]);
  const body = {
    protocol: Type.Literal("check-report/v2"),
    documentation: Type.String({ minLength: 1 }),
    root: Type.String(),
    nodes: Type.Array(
      Type.Object(
        {
          key: Type.String(),
          pass: Type.Boolean(),
          item: Type.Object(
            {
              checker: Type.String(),
              target: Type.Object({}, { additionalProperties: true }),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
    ),
    edges: Type.Array(
      Type.Object(
        { from: Type.String(), to: Type.String() },
        { additionalProperties: false },
      ),
    ),
  };
  const result = Type.Union([
    Type.Object(
      {
        pass: Type.Literal(true),
        ...body,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        pass: Type.Literal(false),
        ...body,
        problems: Type.Array(reportProblem, { minItems: 1 }),
      },
      { additionalProperties: false },
    ),
  ]);
  return {
    input,
    result,
    message: Type.Never(),
    schemas: { "check-problem-code": code, "check-problem": reportProblem },
  };
}

export type CheckContract<
  Input extends TSchema = TSchema,
  Code extends TSchema = TSchema,
> = {
  readonly input: Input;
  readonly schemas: { readonly "check-problem-code": Code };
};
