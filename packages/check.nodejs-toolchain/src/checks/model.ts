import type { RuleCode } from "../contract.js";

export type InstallationRule = Extract<
  RuleCode,
  "tool-missing" | "tool-unusable" | "version-unparseable" | "version-too-low"
>;
export type ConfigurationRule = Exclude<RuleCode, InstallationRule>;
