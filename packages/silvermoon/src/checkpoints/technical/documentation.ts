import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "technical",
  title: "技术共识已确认并同步",
  description:
    "检查当前技术方案及附件已获用户明确确认，绑定前序版本并完成同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state，以事件阶段 technical 判断技术共识。
state.level=technical 表示技术确认未达成；state.level=synchronization 且
state.next=technical 表示技术确认等待同步。只有 reducer
已越过本阶段，包括停在后续阶段的同步时，本检查点才达成。
技术方案、计划、附件及细化材料均属于签署范围，不以微调为由跳过重新确认，也不自行代替用户批准。

### 准备、评审和记录

1. 完成已确认问题范围内的调研，将结论和依据写入 \`technical/Spec.md\` 及附件，说明方案选择、取舍、接口与数据流、错误处理、实施计划和验证方法；单独签署的 \`technical/research.md\` 不属于本阶段正文版本。
2. 核对当前 research submit 及其需求链已确认并同步，观察 revisions、eventDigest 和 primary；先追加下列v2 submit，再向用户 review 完整技术材料。upstream 只保存 research revision，需求上下文按提交时的有效内容链追溯，不保存 submit ID 或完整版本向量。

\`\`\`json
{
  "version": 2,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "submit",
  "object": "technical",
  "revision": "<state.revisions.technical>",
  "upstream": "<state.revisions.research>"
}
\`\`\`

3. 等待用户对该准确提交的明确接受；正文、计划、附件或前序链变化后重新 submit。收到接受信号并复核仍为当前请求后，按共享模板追加只引用该 submit ID 的 signOff。
4. 按共享规则检查 worktree、staged，按已有授权提交并同步材料与配对事件，再运行 check-idea；本地回放到后续阶段不能代替同步 Rule。
`,
  rules: [
    {
      code: "technical-consensus-confirmed",
      description:
        "最新 object=technical 的 v2 submit，其 revision 等于 state.revisions.technical，upstream 严格等于当前已确认并同步的 state.revisions.research，按 idea-folder 的回放规则核验提交时绑定的 需求 revision 仍准确；其后存在仅引用该请求的 v2 signOff，且 reducer 将配对 signOff 的 ID 纳入 state.signed.technical。当前 Technical Spec 及全部补充材料共同决定该版本。",
    },
    {
      code: "technical-synchronized",
      description:
        "reducer 必须确认当前准确技术内容、全部前序内容与 state.signed.technical 指向的同一 signOff、其 submit 及前序提交链均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=technical，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续复用 idea-folder 的技术版本与单链配对事实，不生成新的提交或签署事件。",
  },
} as const satisfies CheckpointDocumentation;
