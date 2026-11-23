import { defineCheckpoint } from "@silvermoon-work/check-task-sdk";
import { checkpoints, titles, type Checkpoint } from "../flat.js";
import { Target } from "../contract.js";
import type { ideaCheckpoint } from "./idea-folder/check.js";
import { failure } from "./shared.js";

const prompts: Record<Checkpoint, string> = {
  requirements:
    "Complete requirements/Spec.md and supporting material: outcome, scope and acceptance criteria.",
  "research-scope":
    "Complete research-scope/Spec.md: questions, uncertainties and facts to investigate.",
  "technical-spec":
    "Complete technical-spec/Spec.md: researched decisions and design.",
  "test-scope": "Complete test-scope/Spec.md: intended cases and outcomes.",
  "test-spec":
    "Complete test-spec/Spec.md: prerequisites, operations and expected outcomes. Default acceptance is delegated.",
  implementation:
    "Complete implementation/Spec.md and supporting submission material. Record which TEST CASES were added, deleted or modified and which commit they were submitted to. Before delegated accept, verify passing local tests or CI including that commit. These are Agent responsibilities, not Check predicates.",
  deployment:
    "Complete deployment/Spec.md and supporting material. Self-test the actual deployed result, then obtain explicit USER hands-on acceptance via deployment accept(authority=user). No separate user-acceptance checkpoint exists.",
};
export const flatDocumentation = checkpoints.map((id) => ({
  id,
  title: titles[id],
  description:
    "Measure the actual folder Git tree and accepted direct predecessor, then submit, accept and synchronize.",
  instructions: `${prompts[id]}
Spec.md is a primary entry prompt, not a machine template requirement.
Append the smallest submit {at,type,object,revision,upstream}; accept adds authority=user|delegate and matches the same tuple.
Default test-spec and implementation are delegated; all others require consensus.
Consensus accepts only user; delegated accepts user or delegate. Never infer acceptance.
Check observes event state, revisions, direct upstream, policy, history and synchronization only.
It does not judge tests, CI, reports, completeness, tested code, deployment truth or declared commit/path binding.
Synchronize material and events normally; preserve history. A changed folder or predecessor requires resubmission, not rollback.
Replace placeholders with freshly observed full IDs and canonical UTC time:
\`\`\`json
{"at":"<UTC>","type":"submit","object":"${id}","revision":"<${id}-folder-tree>","upstream":${id === "requirements" ? "null" : '"<direct-predecessor-folder-tree>"'}}
\`\`\`
Only after actual authorized acceptance, append the same tuple:
\`\`\`json
{"at":"<UTC>","type":"accept","object":"${id}","revision":"<${id}-folder-tree>","upstream":${id === "requirements" ? "null" : '"<direct-predecessor-folder-tree>"'},"authority":"${id === "test-spec" || id === "implementation" ? "delegate" : "user"}"}
\`\`\`
The sample authority follows defaults; obey the effective project policy and actual acceptance source.`,
  rules: [
    {
      code: `${id}-submission-current` as const,
      description:
        "Latest submission matches the actual current folder tree and direct predecessor tree (root null).",
    },
    {
      code: `${id}-acceptance-valid` as const,
      description:
        "Acceptance matches the submission's complete tuple and current authority policy.",
    },
    {
      code: `${id}-synchronized` as const,
      description:
        "Current folder, submission and recognized acceptance exist in observed primary.",
    },
  ] as const,
  output: {
    description:
      "No persistent marker; later checkpoints reuse the same observation.",
  },
}));
export function flatCheckpoint(
  id: Checkpoint,
  observation: ReturnType<typeof ideaCheckpoint>,
) {
  const documentation = flatDocumentation.find((item) => item.id === id)!;
  return defineCheckpoint({
    ...documentation,
    target: Target,
    check: async (_target, context) => {
      await Promise.resolve();
      const { state, brief } = context.outputOf(observation);
      if (state.level !== id) return { pass: true as const, output: undefined };
      const step = state.step;
      const code =
        step === "submit"
          ? (`${id}-submission-current` as const)
          : step === "accept"
            ? (`${id}-acceptance-valid` as const)
            : (`${id}-synchronized` as const);
      return failure(code, brief);
    },
  });
}
