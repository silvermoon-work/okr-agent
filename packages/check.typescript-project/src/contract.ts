import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

export const Input = Type.Object(
  {
    context: Type.Object(
      {
        projectDirectory: Type.String({ minLength: 1 }),
        projectScopes: Type.Optional(
          Type.Array(Type.String({ minLength: 1 }), {
            minItems: 1,
            uniqueItems: true,
            maxItems: 128,
          }),
        ),
      },
      { additionalProperties: false },
    ),
    // Semantic validation belongs to the pure normalizer, not a second default engine.
    requirements: Type.Optional(
      Type.Object({}, { additionalProperties: true }),
    ),
  },
  { additionalProperties: false },
);
export type Input = Omit<Static<typeof Input>, "requirements"> & {
  requirements?: unknown;
};
export const codes = [
  "dependency-missing",
  "dependency-mismatch",
  "dependency-unconfirmed",
  "typescript-missing",
  "typescript-mismatch",
  "typescript-unconfirmed",
  "lint-missing",
  "lint-mismatch",
  "lint-unconfirmed",
  "formatting-missing",
  "formatting-mismatch",
  "formatting-unconfirmed",
  "testing-missing",
  "testing-mismatch",
  "testing-unconfirmed",
  "coverage-missing",
  "coverage-mismatch",
  "coverage-unconfirmed",
  "gate-missing",
  "gate-mismatch",
  "gate-unconfirmed",
  "ci-missing",
  "ci-mismatch",
  "ci-unconfirmed",
  "scope-unconfirmed",
] as const;
export const ProblemCode = Type.Union(codes.map((code) => Type.Literal(code)));
export type ProblemCode = (typeof codes)[number];
export default createCheckContract(Input, ProblemCode);
