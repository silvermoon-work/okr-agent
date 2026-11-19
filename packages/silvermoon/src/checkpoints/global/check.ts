import {
  defineCheckpoint,
  type CheckpointResult,
} from "@silvermoon-work/check-task-sdk";

import { documentation } from "./documentation.js";
import type { Target } from "../../contract.js";
import type { ProjectTarget } from "../../project-contract.js";
import type { SetupTarget } from "../../setup-contract.js";
import type { Runtime } from "../../contract.js";
import type { RuleFailure } from "@silvermoon-work/check-task-sdk";
import {
  inspectInstallation,
  inspectPersonalSkill,
  deviceLanguage,
} from "../../device.js";
import { SilvermoonError } from "../../domain.js";
import { failure, nativeCode } from "../shared.js";
type EnvironmentCode = (typeof documentation.rules)[number]["code"];
export function environmentCheckpoint(
  runtime: Runtime,
  targetSchema: typeof Target | typeof ProjectTarget | typeof SetupTarget,
) {
  return defineCheckpoint({
    ...documentation,
    target: targetSchema,
    check: async (
      target,
      context,
    ): Promise<
      CheckpointResult<{ userLanguage: string | undefined }, EnvironmentCode>
    > => {
      const { signal } = context;
      const problems: RuleFailure<EnvironmentCode>[] = [];
      let userLanguage: string | undefined;
      try {
        userLanguage = await deviceLanguage({ home: target.userHome });
      } catch (error) {
        signal.throwIfAborted();
        if (
          !(error instanceof SilvermoonError) &&
          !(error instanceof TypeError)
        )
          throw error;
        problems.push(...failure("global-configuration-valid", error).problems);
      }
      let installation: string | undefined;
      const device = { home: target.userHome, ...runtime };
      try {
        installation = await inspectInstallation(device);
      } catch (error) {
        signal.throwIfAborted();
        if (
          !(error instanceof SilvermoonError) &&
          !(error instanceof SyntaxError) &&
          !["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
        )
          throw error;
        problems.push(...failure("global-runtime-ready", error).problems);
      }
      if (installation) {
        try {
          await inspectPersonalSkill(device, installation);
        } catch (error) {
          signal.throwIfAborted();
          if (
            !(error instanceof SilvermoonError) &&
            !["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
          )
            throw error;
          problems.push(...failure("global-skill-linked", error).problems);
        }
      }
      const [first, ...rest] = problems;
      return first
        ? { pass: false, problems: [first, ...rest] }
        : { pass: true, output: { userLanguage } };
    },
  });
}
