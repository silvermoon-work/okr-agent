import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "requirements",
  title: "需求共识已确认并同步",
  description: "检查当前需求版本已获用户明确确认，且内容和确认事件已同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state，以事件阶段 requirements
判断需求共识。state.level=requirements 表示尚无当前版本的有效确认；
state.level=synchronization 且 state.next=requirements
表示确认已有效但尚未同步。只有 reducer 已越过本阶段，包括停在后续阶段的同步时，本检查点才达成。
缺少有效确认时向用户展示准确内容版本并请求明确决定，不从正文、复选框、Git
提交或任意一条旧 signOff 推断批准。

### 准备、评审和记录

1. 编写 \`requirements/Spec.md\`，用 Markdown 说明问题、目标、范围与非目标、场景和验收标准；全部 \`requirements/\` 附件也属于签署范围。目录提纲用于帮助 review，不是新增机器可验证的正文模板。
2. 向用户展示当前完整材料及变更，明确请求对这个准确版本的确认。用户未同意时继续迭代文档和 review，不记录 \`signOff\`，也不删除已有事件。
3. 用户明确同意后，用 \`silvermoon check-idea <idea> --json\` 读取生命周期 Problem brief 中的 \`revisions\`、\`eventDigest\` 和 \`primary\`。如果材料与用户刚确认的版本不同，重新 review；primary 不可用时先恢复观察能力。
4. 准备下面的 JSON。\`type=signOff\` 本身表示真实确认，新事件不再写 \`decision\`；历史事件中的 \`decision=confirmed\` 只按兼容协议读取，不能为简化格式改写旧事件。所有 \`<...>\` 都必须替换为真实值：\`id\` 是全新 32 位小写十六进制，\`at\` 是当前规范 UTC ISO 时间，revision 来自当前回放，不能猜测哈希。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "signOff",
  "object": "requirements",
  "revision": "<state.revisions.requirements>",
  "upstream": {}
}
\`\`\`

5. 直接编辑该 Idea 的 \`events.jsonl\` 追加事实，保留原始字节前缀；每条新事件递归按 ASCII 键序序列化为单行 JSON，使用 UTF-8、LF 和最终换行，再运行 \`silvermoon check-changes --worktree --audience agent\` 检查。事件只能记录已有真实人类决定，不是用户授权或身份认证。
6. 遇到版本、digest 或 primary 冲突时重新观察并核对用户决定，不盲目重试。按已有授权提交并同步内容和事件，再运行 \`silvermoon check-idea <idea> --audience agent\`，以对应 Rules 通过为准；本地库存状态不证明网络新鲜度。
`,
  rules: [
    {
      code: "requirements-consensus-confirmed",
      description:
        "完整事件历史中必须存在 type=signOff、object=requirements 的事件，其 revision 等于 state.revisions.requirements，upstream 为空， 且 reducer 将该事件 ID 纳入 state.signed.requirements。受签署范围内的任何变更都须重新确认， 不能只检查历史上是否出现过 signOff。",
    },
    {
      code: "requirements-synchronized",
      description:
        "reducer 必须确认当前准确需求内容和 state.signed.requirements 指向的同一 signOff 事件均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=requirements，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续继续读取 idea-folder 的准确 revisions 与签署事实。",
  },
} as const satisfies CheckpointDocumentation;
