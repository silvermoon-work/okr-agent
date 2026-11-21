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
2. 核对需求的最新 submit 已确认并同步，观察当前版本、eventDigest 和 primary；先追加下列配对 submit，再向用户展示问题索引及其绑定的需求内容版本，等待明确决定。upstream 只保存当前需求 revision，不保存 submit ID。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "submit",
  "object": "research",
  "revision": "<state.revisions.research>",
  "upstream": "<state.revisions.requirements>"
}
\`\`\`

3. 用户未明确接受就等待或修改；问题索引或需求链变化后重新 submit。收到明确接受后，核对最新请求和整条链，按共享模板追加 signOff，仅引用本次 submit ID。
4. 按共享规则检查 worktree、staged，按已有授权提交并同步索引及配对事件，再运行 check-idea；不把本地跟踪快照当作同步证明。
`,
  rules: [
    {
      code: "research-consensus-confirmed",
      description:
        "最新 object=research 的 配对 submit，其 revision 等于 state.revisions.research，upstream 严格等于当前已确认并同步的 state.revisions.requirements；其后存在仅引用该请求的 配对 signOff，且 reducer 将配对 signOff 的 ID 纳入 state.signed.research；不以事件存在本身或旧版本确认作为通过依据。",
    },
    {
      code: "research-synchronized",
      description:
        "reducer 必须确认当前准确调研索引、前序需求与 state.signed.research 指向的同一 signOff、其 submit 及前序提交链均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=research，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续承接调研共识成立的事实，版本数据仍来自 idea-folder。",
  },
} as const satisfies CheckpointDocumentation;
