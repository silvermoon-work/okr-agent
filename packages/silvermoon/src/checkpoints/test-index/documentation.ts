import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "test-index",
  title: "用例索引共识已确认并同步",
  description: "检查实现与部署用例索引完整、已获用户明确确认并完成同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state；本检查点对应历史事件阶段 cases，不是 test-index。
state.level=cases 表示用例索引确认未达成；state.level=synchronization 且
state.next=cases 表示索引确认等待同步。只有 reducer
已越过 cases，包括停在后续阶段的同步时，本检查点才达成。
先把实现和部署用例索引表达完整，再请求准确版本确认；不能用正文或口头约定替代机器索引。

### 准备、评审和记录

1. 在 \`tests/cases.json\` 编写v2 协议 v2 JSON 索引。每个 case 的 id 必须唯一，使用大写字母开头的大写字母、数字或连字符；仅声明 id 和 phase，不设置通用 environment 或可选的受测对象策略。实现固定针对准确代码提交，部署固定针对已通过实现验收的交付。以下仅示意结构，不能将两个 case 当成项目的完整范围。

\`\`\`json
{
  "version": 2,
  "cases": [
    {"id": "I-01", "phase": "implementation"},
    {"id": "D-01", "phase": "deployment"}
  ]
}
\`\`\`

2. 与用户 review 用例范围、阶段分工及绑定的前序版本：implementation 为可重现自动化测试，deployment 为 Agent 主导的 E2E 手工验收。平台、地址等确有必要的条件写在具体用例中，不增加通用参数。未明确同意就迭代索引，不写 \`signOff\`。详细操作正文留到 test-cases，但不能遗漏索引应声明的用例。
3. 不等待用户先同意才提交。先观察 revisions、eventDigest 和 primary，核对当前 technical submit 及其前序链已确认同步，追加下列v2 submit，再请用户确认该准确用例索引。

\`\`\`json
{
  "version": 2,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "submit",
  "object": "cases",
  "revision": "<state.revisions.cases>",
  "upstream": "<state.revisions.technical>"
}
\`\`\`

4. 等待明确接受，索引或前序链变更后重新 submit。接受后复核最新请求，再按共享模板追加仅引用该 submit ID 的 signOff；不重复任何前序摘要。
5. 按共享规则检查 worktree、staged，按已有授权提交并同步索引及配对事件，再运行 check-idea 确认对应 Rules 已通过。
`,
  rules: [
    {
      code: "test-index-consensus-confirmed",
      description:
        "当前 tests/cases.json 必须使用上述严格 v2 索引，同时包含实现和部署用例，每项仅包含唯一 id 和合法 phase，不包含 environment 或 subject 字段。最新 object=cases 的 v2 submit， revision 等于 state.revisions.cases，upstream 严格等于当前已确认并同步的 state.revisions.technical；其后存在仅引用该请求的 v2 signOff， 整条前序链有效，且 reducer 将配对 signOff 的 ID 纳入 state.signed.cases。",
    },
    {
      code: "test-index-synchronized",
      description:
        "reducer 必须确认当前准确用例索引、全部前序内容与 state.signed.cases 指向的同一 signOff、其 submit 及前序提交链均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=cases，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续用例和版本事实仍由 idea-folder 提供，不能以正文替代机器索引。",
  },
} as const satisfies CheckpointDocumentation;
