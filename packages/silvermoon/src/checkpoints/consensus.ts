import {
  defineCheckpoint,
  type CheckpointResult,
  type Rule,
} from "@silvermoon-work/check-task-sdk";

import {
  Target,
  consensusRuleCodes,
  type ConsensusRuleCode,
  type ConsensusSynchronizationRuleCode,
} from "../contract.js";
import type { Gate } from "../domain.js";
import { consensusDocumentation } from "./catalog.js";
import { failure } from "./shared.js";
import type { legacyIdeaCheckpoint as ideaCheckpoint } from "./idea-folder/legacy-check.js";

export function consensusCheckpoint(
  gate: Gate,
  observation: ReturnType<typeof ideaCheckpoint>,
) {
  const documentation = consensusDocumentation[gate];
  const rules: readonly [
    Rule<ConsensusRuleCode | ConsensusSynchronizationRuleCode>,
    ...Rule<ConsensusRuleCode | ConsensusSynchronizationRuleCode>[],
  ] = documentation.rules;
  const synchronizationCode = `${documentation.id}-synchronized` as const;
  return defineCheckpoint({
    ...documentation,
    rules,
    target: Target,
    check: async (
      _target,
      context,
    ): Promise<
      CheckpointResult<
        undefined,
        ConsensusRuleCode | ConsensusSynchronizationRuleCode
      >
    > => {
      await Promise.resolve();
      const { state, brief } = context.outputOf(observation);
      if (state.level === gate) return failure(consensusRuleCodes[gate], brief);
      if (state.level === "synchronization" && state.next === gate)
        return failure(synchronizationCode, brief);
      return { pass: true, output: undefined };
    },
  });
}
