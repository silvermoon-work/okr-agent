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
2. 向用户 review 整个当前技术材料及其前序版本。未获明确同意就继续迭代，不写 \`signOff\`；正文、计划或附件变化均需重新核对确认。
3. 明确同意后，通过 \`silvermoon check-idea <idea> --json\` 取得当前 revisions、digest 和可用 primary tip。替换下列全部占位符；id 为全新 32 位小写十六进制，at 为当前规范 UTC ISO 时间，upstream 必须准确且无额外阶段。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "signOff",
  "object": "technical",
  "revision": "<state.revisions.technical>",
  "upstream": {
    "requirements": "<state.revisions.requirements>",
    "research": "<state.revisions.research>"
  }
}
\`\`\`

4. 直接编辑该 Idea 的 \`events.jsonl\` 追加事实，保留原始字节前缀；每条新事件递归按 ASCII 键序序列化为单行 JSON，使用 UTF-8、LF 和最终换行，再运行 \`silvermoon check-changes --worktree --audience agent\` 检查。版本或并发冲突时重新观察并核对决定。
5. 按已有授权提交并同步内容和事件，再运行 \`silvermoon check-idea <idea> --audience agent\`；本地回放到后续阶段不能代替同步 Rule。
`,
  rules: [
    {
      code: "technical-consensus-confirmed",
      description:
        "完整事件历史中必须存在 object=technical 的 signOff， 其 revision 等于 state.revisions.technical，upstream 恰好绑定当前 requirements、research 版本，且 reducer 将该事件 ID 纳入 state.signed.technical。当前 Technical Spec 及全部补充材料共同决定该版本。",
    },
    {
      code: "technical-synchronized",
      description:
        "reducer 必须确认当前准确技术内容、全部前序内容与 state.signed.technical 指向的同一 signOff 事件均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=technical，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续复用 idea-folder 的技术与前序版本向量，不生成新的签署事件。",
  },
} as const satisfies CheckpointDocumentation;
