import type { RuleCode } from "../contract.js";

export type InstallationRule = Extract<
  RuleCode,
  | "tool-present"
  | "tool-executable"
  | "tool-version-readable"
  | "tool-version-minimum"
>;
export type ConfigurationRule = Exclude<RuleCode, InstallationRule>;
