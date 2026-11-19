import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "research",
  title: "调研共识已确认并同步",
  description: "检查当前调研问题索引已获用户明确确认，绑定当前需求并完成同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state；本检查点、事件阶段和状态键统一为 research。
state.level=research 表示调研确认未达成；
state.level=synchronization 且 state.next=research 表示调研确认等待同步。
只有 reducer 已越过 research，包括停在后续阶段的同步时，本检查点才达成。
索引或前序需求改变后，请求对应准确版本的确认，不沿用失效的旧确认。

### 准备、评审和记录

1. 编写 \`technical/research.md\`，以 Markdown 问题索引列出需要调研的问题、用户关注点、待查证事实及其影响的技术决策；这里确认的是调研范围，不用未完成的调研结论冒充答案。
2. 向用户展示问题索引及其绑定的当前需求版本。用户未明确同意时继续迭代索引，不写 \`signOff\`；需求改变后也要重新确认。
3. 明确同意后，运行 \`silvermoon check-idea <idea> --json\` 核对当前版本、digest 和可用的 primary tip。准备下列事件，替换全部占位符；id 必须为全新 32 位小写十六进制，at 为当前规范 UTC ISO 时间。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "signOff",
  "object": "research",
  "revision": "<state.revisions.research>",
  "upstream": {"requirements": "<state.revisions.requirements>"}
}
\`\`\`

4. 直接编辑该 Idea 的 \`events.jsonl\` 追加事实，保留原始字节前缀；每条新事件递归按 ASCII 键序序列化为单行 JSON，使用 UTF-8、LF 和最终换行，再运行 \`silvermoon check-changes --worktree --audience agent\` 检查。冲突或版本改变时重新观察、核对 review，不伪造确认。
5. 按已有授权提交并同步索引和事件，再运行 \`silvermoon check-idea <idea> --audience agent\` 验收；本地跟踪快照本身不是同步证明。
`,
  rules: [
    {
      code: "research-consensus-confirmed",
      description:
        "完整事件历史中必须存在 object=research 的 signOff， 其 revision 等于 state.revisions.research，upstream 恰好包含当前 requirements 版本，且 reducer 将该事件 ID 纳入 state.signed.research；不以事件存在本身或旧版本确认作为通过依据。",
    },
    {
      code: "research-synchronized",
      description:
        "reducer 必须确认当前准确调研索引、前序需求与 state.signed.research 指向的同一 signOff 事件均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=research，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续承接调研共识成立的事实，版本数据仍来自 idea-folder。",
  },
} as const satisfies CheckpointDocumentation;
