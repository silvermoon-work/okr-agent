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

1. 在 \`tests/cases.json\` 编写协议 v1 JSON 索引。每个 case 的 id 必须唯一，使用大写字母开头的大写字母、数字或连字符；同时列出真实需要的实现和部署环境。以下仅示意结构，不能将示例环境或两个 case 当成项目的完整范围。

\`\`\`json
{
  "version": 1,
  "cases": [
    {"id": "I-01", "phase": "implementation", "environment": "local", "subject": "git-head"},
    {"id": "D-01", "phase": "deployment", "environment": "staging", "subject": "implementation"}
  ]
}
\`\`\`

2. 与用户 review 用例范围、phase、environment、subject 及绑定的前序版本。未明确同意就迭代索引，不写 \`signOff\`。详细操作正文留到 test-cases，但不能遗漏索引应声明的用例。
3. 明确同意后，用 \`silvermoon check-idea <idea> --json\` 核对当前 revisions、digest 和可用 primary tip。替换下列全部占位符，id 为全新 32 位小写十六进制，at 为当前规范 UTC ISO 时间。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "signOff",
  "object": "cases",
  "revision": "<state.revisions.cases>",
  "upstream": {
    "requirements": "<state.revisions.requirements>",
    "research": "<state.revisions.research>",
    "technical": "<state.revisions.technical>"
  }
}
\`\`\`

4. 直接编辑该 Idea 的 \`events.jsonl\` 追加事实，保留原始字节前缀；每条新事件递归按 ASCII 键序序列化为单行 JSON，使用 UTF-8、LF 和最终换行，再运行 \`silvermoon check-changes --worktree --audience agent\` 检查。冲突时重新观察和核对 review。
5. 按已有授权提交并同步索引与事件，再运行 \`silvermoon check-idea <idea> --audience agent\` 确认对应 Rules 已通过。
`,
  rules: [
    {
      code: "test-index-consensus-confirmed",
      description:
        "当前 tests/cases.json 必须同时包含实现和部署用例，明确阶段、环境与受测对象。完整事件历史中必须存在 object=cases 的 signOff，其 revision 等于 state.revisions.cases，upstream 恰好绑定当前 requirements、research、technical 版本，且 reducer 将该事件 ID 纳入 state.signed.cases。",
    },
    {
      code: "test-index-synchronized",
      description:
        "reducer 必须确认当前准确用例索引、全部前序内容与 state.signed.cases 指向的同一 signOff 事件均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=cases，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续用例和版本事实仍由 idea-folder 提供，不能以正文替代机器索引。",
  },
} as const satisfies CheckpointDocumentation;
