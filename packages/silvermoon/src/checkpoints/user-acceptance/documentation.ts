import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "user-acceptance",
  title: "用户体验验收已确认并同步",
  description:
    "检查用户实际操作后已明确接受当前交付，且绑定准确部署结果的验收事件已同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的同一次 state，并承接 deployment 检查点已通过的事实。
state.level=user-acceptance 表示当前交付尚无有效用户验收确认；
state.level=synchronization 且 state.next=user-acceptance 表示用户确认有效但尚未同步。
用户需要实际操作交付结果并提出反馈，Agent 自测报告不能替代这一环节。
只有用户明确接受准确交付，且对应验收事件已同步至 primary，Idea 才能完成。

### 体验、反馈和确认

1. 部署及 Agent 自验已通过并同步后，先记录下列 user-acceptance submit，再向用户提供该提交对应的体验入口、操作指引、交付范围与已知限制，明确 implementation 代码提交和 deployment 报告摘要。upstream 只保存当前已确认的 tests revision；实现绑定从 revision 指向的部署报告追溯，不在事件里另存一份。体验入口可为已部署应用、CLI 或其他实际交付物，不另设固定平台要求。

\`\`\`json
{
  "version": 2,
  "id": "<new-submit-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "submit",
  "object": "user-acceptance",
  "revision": "<state.deployment>",
  "upstream": "<state.revisions.tests>"
}
\`\`\`

2. 请用户亲自操作并反馈。用户尚未操作、仍在反馈、提出修改、拒绝或尚未明确接受时，继续等待或迭代，不能记录验收通过；沉默、普通评论、Agent 演示或自动化测试通过均不能推断为用户接受。
3. 有修改时回到受影响的需求、共识、实现或部署阶段，按原 Rules 重新确认或验证并同步，再把新的交付交给用户体验。保留既有事件，不复用旧交付的用户确认。
4. 用户明确表示当前交付可以接受后，重新观察 revisions、eventDigest、primary、state.implementation、state.deployment 和最新 user-acceptance submit。只有仍与该请求及用户实际体验的交付一致时，才可记录 signOff；有变化或无法确定时先重新 submit 并交付用户体验，不把旧决定绑定到新请求。

### 记录和同步

5. 按所有共识共用的配对模板记录 signOff，只引用本次 user-acceptance submit，不携带 object、revision 或 upstream，也不新增第六份内容 revision。下例必须在收到明确接受信号后才能追加。

\`\`\`json
{
  "version": 2,
  "id": "<new-signoff-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "signOff",
  "submit": "<current-user-acceptance-submit-id>"
}
\`\`\`

6. Agent 仅在用户已明确验收通过时向该 Idea 的 events.jsonl 追加事件，保留原始 UTF-8 字节前缀，不写 decision 字段。新事件使用全新 32 位小写十六进制 id、当前规范 UTC ISO 时间，递归按 ASCII 键序序列化为单行 JSON，使用 UTF-8、LF 和最终换行。事件是对真实决定的记录，不构成用户身份认证，也不是新的部署或发布授权。
7. 按已有授权运行 worktree 和 staged 的 check-changes，提交并同步交付 submit 及配对 signOff 至配置的 primary，然后重新运行 check-idea。同步冲突时保留双方历史，重新观察并核对交付版本；只有下列两条 Rules 均通过才可宣称 Idea 完成，不以本地事件或 push 命令成功替代最终同步事实。
`,
  rules: [
    {
      code: "user-acceptance-confirmed",
      description:
        '所有前序检查点通过后，最新 object=user-acceptance 的 v2 submit， revision 必须严格等于当前 state.deployment，upstream 严格等于当前已确认并同步的 state.revisions.tests，且提交时绑定的整条内容链仍有效； 被引用部署报告最新 start 中的 implementation 严格等于当前 state.implementation。 其后必须存在仅引用该请求的 v2 signOff，并被 reducer 纳入 signed["user-acceptance"]。 Agent 只能在用户实际操作并明确接受该交付后追加事件； checker 验证事件和交付绑定，不声称从事件证明用户身份或实际操作发生。 缺少事件或仅有绑定旧交付的确认时本 Rule 不通过，level 为 user-acceptance； 上游共识、实现或部署失效时先返回对应前序阶段。 implementation 代码提交或 deployment 报告摘要变化均使旧用户确认失效； 仅追加本次确认事件不改变这两个阶段版本，也不要求重复部署。 反馈、拒绝、沉默和 Agent 自验不能作为通过事件。',
    },
    {
      code: "user-acceptance-synchronized",
      description:
        "当前交付的 submit、有效配对 signOff 及其前序提交链必须已提交并包含在本次观察的 primary 历史中，且工作区无改动、HEAD 等于本次观察的 primary tip。 确认有效但未同步时，level 为 synchronization、next 为 user-acceptance； 只有当前用户确认和最终同步均成立，reducer 才返回 completed，整个 Task 才通过。primary 不可用或观察期间发生并发变化时须明确报告， 不能用本地快照、手写 completed 或 Git 命令退出成功代替确认与同步事实。 同一观察的事实与 reducer 终态不一致时按执行错误传播，不默认通过。",
    },
  ],
  output: {
    description:
      "成功不新增 Context 数据，pass output 为 undefined；整个 Task 可以报告 Idea 已完成，但不自动写事件、发布或执行其他操作。",
  },
} as const satisfies CheckpointDocumentation;
