import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "test-cases",
  title: "测试共识已确认并同步",
  description:
    "检查详细测试用例及附件已获用户明确确认，绑定当前用例索引并完成同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state；本检查点对应历史事件阶段 tests，不是 test-cases。
state.level=tests 表示详细测试用例确认未达成；state.level=synchronization 且
state.next=tests 表示确认等待同步。只有 reducer 已进入 implementation
或后续阶段，本检查点才达成。测试说明、附件及正文细化均属于签署范围，必须绑定当前用例索引；
变更后重新确认，不推断额外的人类决定。

### 准备、评审和记录

1. 在 \`tests/Spec.md\` 及附件中按已确认 case id 编写详细用例：环境与受测对象、前置准备、输入、操作步骤、预期结果，以及应保存的证据和采集方式。\`tests/\` 中除独立索引 \`cases.json\` 外的全部材料共同参与本阶段签署。
2. 与用户 review 所有实现和部署用例及其前序版本。未明确同意就继续迭代正文，不写 \`signOff\`；若需要新增或改变索引，回到 test-index 重新确认受影响的版本。
3. 明确同意后，用 \`silvermoon check-idea <idea> --json\` 核对 revisions、digest 和可用 primary tip。替换下列全部占位符，id 为全新 32 位小写十六进制，at 为当前规范 UTC ISO 时间。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "signOff",
  "object": "tests",
  "revision": "<state.revisions.tests>",
  "upstream": {
    "requirements": "<state.revisions.requirements>",
    "research": "<state.revisions.research>",
    "technical": "<state.revisions.technical>",
    "cases": "<state.revisions.cases>"
  }
}
\`\`\`

4. 直接编辑该 Idea 的 \`events.jsonl\` 追加事实，保留原始字节前缀；每条新事件递归按 ASCII 键序序列化为单行 JSON，使用 UTF-8、LF 和最终换行，再运行 \`silvermoon check-changes --worktree --audience agent\` 检查。冲突或内容变化时重新观察并核对用户决定。
5. 按已有授权提交并同步测试材料和事件，再运行 \`silvermoon check-idea <idea> --audience agent\`。通过前不要把测试计划当成已经执行的验证证据。
`,
  rules: [
    {
      code: "test-cases-consensus-confirmed",
      description:
        "完整事件历史中必须存在 object=tests 的 signOff， 其 revision 等于 state.revisions.tests，upstream 恰好绑定当前 requirements、research、technical、cases 版本，且 reducer 将该事件 ID 纳入 state.signed.tests。当前 Test Spec 及全部补充材料共同决定该版本。",
    },
    {
      code: "test-cases-synchronized",
      description:
        "reducer 必须确认当前准确测试内容、全部前序内容与 state.signed.tests 指向的同一 signOff 事件均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=tests，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续证据检查承接五个共识均成立的事实，不额外保存 approved 标记。",
  },
} as const satisfies CheckpointDocumentation;
