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
2. 通过当前运行时观察当前 revisions、eventDigest 和 primary，按 idea-folder 的配对规则先追加下列 submit，再向用户展示该提交对应的完整材料和变更，请求明确决定。全部占位符必须替换为真实值。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "submit",
  "object": "requirements",
  "revision": "<state.revisions.requirements>",
  "upstream": null
}
\`\`\`

3. 用户未明确接受时等待或迭代，不写 signOff；材料变化后以新 id 重新 submit。用户接受后重新核对当前内容和最新请求，按共享模板追加仅引用该 submit ID 的 signOff，不重复 revision 或 upstream。
4. 按已有授权执行 worktree、staged 的 check-changes，提交并同步材料和配对事件，再运行 check-idea。冲突时重新观察、核对用户决定，不盲目复用旧确认。
`,
  rules: [
    {
      code: "requirements-consensus-confirmed",
      description:
        "最新 object=requirements 的 配对 submit，其 revision 必须等于 state.revisions.requirements，upstream 必须为 null； 必须存在位于其后的 配对 signOff，submit 仅引用这条请求， 且 reducer 将配对 signOff 的 ID 纳入 state.signed.requirements。受签署范围内的任何变更都须重新确认， 不能只检查历史上是否出现过 signOff。",
    },
    {
      code: "requirements-synchronized",
      description:
        "reducer 必须确认当前准确需求内容和 state.signed.requirements 指向的同一 signOff 及其 submit 均存在于本次观察的 primary；若 state.level=synchronization 且 state.next=requirements，本 Rule 不通过。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；后续继续读取 idea-folder 的准确 revisions 与签署事实。",
  },
} as const satisfies CheckpointDocumentation;
