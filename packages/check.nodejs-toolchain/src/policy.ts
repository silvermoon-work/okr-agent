import { Value } from "@sinclair/typebox/value";
import { Input } from "./contract.js";
import { registryUrl } from "./execution-context.js";

export const defaultPackages = Object.freeze(["pnpm", "nrm@1.2.6"]);
export const registries = Object.freeze([
  Object.freeze({ name: "npm", url: "https://registry.npmjs.org/" }),
]);
export const defaultRegistry = "npm";

const packageDeclaration =
  /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@([^\s]+))?$/;

export function packageRequirements(values: readonly string[]) {
  const result = new Map<string, string | undefined>();
  for (const value of values) {
    const match = packageDeclaration.exec(value);
    if (!match?.[1])
      throw new Error("Unsupported default package declaration.");
    const name = match[1];
    const version = match[2];
    if (result.has(name) && result.get(name) !== version)
      throw new Error("Conflicting default package declarations.");
    result.set(name, version);
  }
  return result;
}

export function resolvePolicy(value: unknown) {
  if (!Value.Check(Input, value))
    throw new Error("Invalid device toolchain input.");
  const requiredPackages = packageRequirements(defaultPackages);
  for (const name of value.defaultPackages ?? [])
    if (!requiredPackages.has(name)) requiredPackages.set(name, undefined);
  const requiredRegistries = new Map<string, string>();
  for (const entry of [...registries, ...(value.additionalRegistries ?? [])]) {
    const url = registryUrl(entry.url);
    if (
      requiredRegistries.has(entry.name) &&
      requiredRegistries.get(entry.name) !== url
    )
      throw new Error(`Conflicting registry declaration: ${entry.name}.`);
    requiredRegistries.set(entry.name, url);
  }
  const selectedName = value.defaultRegistry ?? defaultRegistry;
  const selectedUrl = requiredRegistries.get(selectedName);
  if (!selectedUrl)
    throw new Error("Default registry must reference a required registry.");
  return {
    input: value,
    requiredPackages,
    requiredRegistries,
    selectedName,
    selectedUrl,
  };
}
