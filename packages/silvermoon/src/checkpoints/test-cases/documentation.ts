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

1. 在 \`tests/Spec.md\` 及附件中按已确认 case id 编写详细用例。实现用例说明自动化测试映射、依赖准备、明确运行入口和通过判据，保证他人可重跑；不要求实现报告。部署用例说明前置准备、操作步骤、预期结果及具体测试条件，由 Agent 主导端到端手工执行，并在固定部署报告逐项记录实际结果。必要的日志或截图要求写在对应具体用例，不强制所有用例统一附证据文件。\`tests/\` 中除独立索引 \`cases.json\` 外的全部材料共同参与本阶段签署。
2. 观察 revisions、eventDigest 和 primary，核对当前 cases submit 及其前序链已确认并同步。先追加下列v2 submit，再向用户 review 全部详细用例。若需要改变索引，先回到 test-index 重新提交并确认。

\`\`\`json
{
  "version": 2,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "submit",
  "object": "tests",
  "revision": "<state.revisions.tests>",
  "upstream": "<state.revisions.cases>"
}
\`\`\`

3. 等待用户对该准确请求的明确接受；正文、附件或前序链变化后重新 submit。接受后复核并按共享模板追加仅引用该 submit ID 的 signOff。
4. 按共享规则检查 worktree、staged，按已有授权提交并同步测试材料和配对事件，再运行 check-idea。通过前不要把测试计划当成已经执行的验证证据。
`,
  rules: [
    {
      code: "test-cases-consensus-confirmed",
      description:
        "最新 object=tests 的 v2 submit，其 revision 等于 state.revisions.tests，upstream 严格等于当前已确认并同步的 state.revisions.cases；其后存在仅引用该请求的 v2 signOff，整条前序内容链有效，且 reducer 将配对 signOff 的 ID 纳入 state.signed.tests。当前 Test Spec 及全部补充材料共同决定该版本。",
    },
    {
      code: "test-cases-synchronized",
      description:
        "reducer 必须确认当前准确测试内容、全部前序内容与 state.signed.tests 指向的同一 signOff、其 submit 及前序提交链均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=tests，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续证据检查承接五个共识均成立的事实，不额外保存 approved 标记。",
  },
} as const satisfies CheckpointDocumentation;
