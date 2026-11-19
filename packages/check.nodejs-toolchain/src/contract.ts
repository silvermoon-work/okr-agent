import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

const closed = { additionalProperties: false };
const version = Type.String({ pattern: "^[0-9]+(?:\\.[0-9]+)*$" });
const registryName = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" });
export const Input = Type.Object(
  {
    minimumVersions: Type.Optional(
      Type.Object(
        {
          nvm: Type.Optional(version),
          node: Type.Optional(version),
          npm: Type.Optional(version),
          pnpm: Type.Optional(version),
          nrm: Type.Optional(version),
        },
        closed,
      ),
    ),
    defaultPackages: Type.Optional(
      Type.Array(
        Type.String({
          pattern: "^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$",
        }),
        { uniqueItems: true },
      ),
    ),
    additionalRegistries: Type.Optional(
      Type.Array(
        Type.Object(
          {
            name: registryName,
            url: Type.String({ pattern: "^https?://[^\\s\\\\@?#]+$" }),
          },
          closed,
        ),
      ),
    ),
    defaultRegistry: Type.Optional(registryName),
  },
  closed,
);
export type Input = Static<typeof Input>;
export const tools = ["nvm", "node", "npm", "pnpm", "nrm"] as const;
export type Tool = (typeof tools)[number];
export const checkpointIds = [
  "nvm-installation",
  "node-installation",
  "npm-installation",
  "pnpm-installation",
  "nrm-installation",
  "nvm-configuration",
  "nrm-configuration",
] as const;
export const ruleCodes = [
  "nvm-installation-executable",
  "nvm-installation-version-valid",
  "node-installation-executable",
  "node-installation-version-valid",
  "node-installation-managed-by-nvm",
  "npm-installation-executable",
  "npm-installation-version-valid",
  "npm-installation-managed-by-nvm",
  "npm-installation-paired-with-node",
  "pnpm-installation-executable",
  "pnpm-installation-version-valid",
  "nrm-installation-executable",
  "nrm-installation-version-valid",
  "nvm-configuration-default-packages-configured",
  "nrm-configuration-registration-present",
  "nrm-configuration-registration-url-matched",
  "nrm-configuration-default-registry-selected",
] as const;
export const RuleCode = Type.Union(ruleCodes.map((code) => Type.Literal(code)));
export type RuleCode = Static<typeof RuleCode>;
export default createCheckContract(Input, RuleCode, [...checkpointIds]);
