import { Type, type Static } from "@sinclair/typebox";
import type { CheckerResult } from "@silvermoon-work/check-task-sdk";
import { Input, type ProblemCode } from "../contract.js";

const empty = Type.Object({}, { additionalProperties: false });
const tool = Type.Object(
  {
    name: Type.Union(
      (["node", "npm", "pnpm", "nvm", "nrm"] as const).map((name) =>
        Type.Literal(name),
      ),
    ),
  },
  { additionalProperties: false },
);
const managed = Type.Object(
  { name: Type.Union([Type.Literal("node"), Type.Literal("npm")]) },
  { additionalProperties: false },
);
const registry = Type.Object(
  { name: Type.Union([Type.Literal("npm"), Type.Literal("pnpm")]) },
  { additionalProperties: false },
);
export const schemas = {
  toolchain: Input,
  tool,
  minimum: tool,
  pairing: empty,
  "pairing-rule": empty,
  management: managed,
  "management-rule": managed,
  registry,
  "registry-rule": registry,
  nrm: empty,
  registration: Type.Object(
    { name: Type.String(), url: Type.String() },
    { additionalProperties: false },
  ),
};
export type Item = {
  [K in keyof typeof schemas]: {
    readonly checker: K;
    readonly target: Static<(typeof schemas)[K]>;
  };
}[keyof typeof schemas];
export type Result = CheckerResult<Item, ProblemCode>;
