import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

export const Input = Type.Object(
  {
    projectDirectory: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type Input = Static<typeof Input>;
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
  "environment-missing",
  "environment-mismatch",
  "environment-unconfirmed",
  "document-missing",
  "document-mismatch",
  "document-unconfirmed",
  "delivery-missing",
  "delivery-mismatch",
  "delivery-unconfirmed",
  "release-missing",
  "release-mismatch",
  "release-unconfirmed",
  "cloudflare-missing",
  "cloudflare-mismatch",
  "cloudflare-unconfirmed",
] as const;
export const ProblemCode = Type.Union(codes.map((code) => Type.Literal(code)));
export type ProblemCode = (typeof codes)[number];
export default createCheckContract(Input, ProblemCode);
