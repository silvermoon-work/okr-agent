import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";
import { ExecutionEnvironment } from "./execution-context.js";

const closed = { additionalProperties: false };
const version = Type.String({ pattern: "^[0-9]+(?:\\.[0-9]+)*$" });
const tool = Type.Object({ minimumVersion: Type.Optional(version) }, closed);
const active = Type.Object(
  {
    allowedUrls: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      uniqueItems: true,
    }),
  },
  closed,
);
export const Input = Type.Object(
  {
    context: Type.Object(
      {
        projectDirectory: Type.String({ minLength: 1 }),
        executionEnvironment: ExecutionEnvironment,
      },
      closed,
    ),
    requirements: Type.Object(
      {
        tools: Type.Optional(
          Type.Object(
            {
              node: Type.Optional(tool),
              npm: Type.Optional(tool),
              pnpm: Type.Optional(tool),
              nvm: Type.Optional(tool),
              nrm: Type.Optional(tool),
            },
            { ...closed, minProperties: 1 },
          ),
        ),
        pairing: Type.Optional(
          Type.Object({ npmWithNode: Type.Boolean() }, closed),
        ),
        management: Type.Optional(
          Type.Object(
            {
              provider: Type.Literal("nvm"),
              appliesTo: Type.Array(
                Type.Union([Type.Literal("node"), Type.Literal("npm")]),
                { minItems: 1, uniqueItems: true },
              ),
            },
            closed,
          ),
        ),
        registries: Type.Optional(
          Type.Object(
            {
              active: Type.Optional(
                Type.Object(
                  { npm: Type.Optional(active), pnpm: Type.Optional(active) },
                  { ...closed, minProperties: 1 },
                ),
              ),
              nrm: Type.Optional(
                Type.Object(
                  {
                    required: Type.Array(
                      Type.Object(
                        {
                          name: Type.String({
                            pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$",
                          }),
                          url: Type.String({ minLength: 1 }),
                        },
                        closed,
                      ),
                      { minItems: 1, uniqueItems: true },
                    ),
                  },
                  closed,
                ),
              ),
            },
            { ...closed, minProperties: 1 },
          ),
        ),
      },
      { ...closed, minProperties: 1 },
    ),
  },
  closed,
);
export type Input = Static<typeof Input>;
export const ProblemCode = Type.Union([
  Type.Literal("tool-missing"),
  Type.Literal("tool-unusable"),
  Type.Literal("version-unparseable"),
  Type.Literal("version-too-low"),
  Type.Literal("pairing-mismatch"),
  Type.Literal("pairing-unconfirmed"),
  Type.Literal("management-mismatch"),
  Type.Literal("management-unconfirmed"),
  Type.Literal("registry-mismatch"),
  Type.Literal("registry-unusable"),
  Type.Literal("nrm-registration-missing"),
  Type.Literal("nrm-registration-mismatch"),
]);
export type ProblemCode = Static<typeof ProblemCode>;
export type Tool = keyof NonNullable<Input["requirements"]["tools"]>;
export default createCheckContract(Input, ProblemCode);
