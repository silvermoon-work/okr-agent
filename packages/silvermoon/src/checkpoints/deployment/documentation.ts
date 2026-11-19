import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "deployment",
  title: "部署验收已通过并同步",
  description:
    "检查部署验收绑定当前已验收实现，且部署证据和验证事件已最终同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state：state.level=deployment
表示尚无绑定当前实现的完整部署验证结果；只有 reducer 生成 state.deployment
摘要并进入 completed，才表明部署证据已达成，仍须通过独立的最终同步 Rule。
缺少证据时部署已经验收并同步的实现版本，在所有必需部署环境完成验证，保存真实通过证据，并用
verify events
记录绑定部署版本、当前实现验收结果及证据的结果。随后将部署证据和 events
提交并同步至项目配置的 primary（例如 origin/main），全部满足下列 Rules 后
Idea 才算完成。不能以部署命令成功替代验收证据，不增加额外的人类结果 sign
off，也不把本检查点当作部署操作授权或自动执行提交、推送。

### 验证、记录和同步

1. 仅在实现 checkpoint 已通过后，按已有部署授权部署该已验收并同步的实现。在索引要求的每个部署环境执行全部部署用例，按测试说明将真实、非空证据保存到 \`evidence/deployment/\`。
2. 用 \`silvermoon check-idea <idea> --json\` 核对当前 revisions、digest、可用 primary tip 和 \`state.implementation\`。该实现摘要必须仍与受部署的验收结果一致；实现发生变化就先回到实现验收，不复用旧部署证据。
3. 每个部署环境准备一个覆盖其全部 case 的 verify 批次，绑定准确受测提交和当前实现批次集合摘要。下例仅展示一个结果项，实际必须覆盖完整集合，不以部署命令退出成功代替验收。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "verify",
  "batch": {
    "id": "<unique-batch-id>",
    "phase": "deployment",
    "revisions": {
      "requirements": "<state.revisions.requirements>",
      "research": "<state.revisions.research>",
      "technical": "<state.revisions.technical>",
      "cases": "<state.revisions.cases>",
      "tests": "<state.revisions.tests>"
    },
    "subject": "<exact-tested-commit-SHA>",
    "environment": "<required-deployment-environment>",
    "implementation": "<state.implementation>",
    "results": [
      {"case": "<actual-case-id>", "result": "pass", "evidence": [
        {"path": "evidence/deployment/<actual-file>", "digest": "<sha256-of-raw-evidence-bytes>"}
      ]}
    ]
  }
}
\`\`\`

4. 替换全部占位符，事件 id 为全新 32 位小写十六进制，at 为当前规范 UTC ISO 时间；batch id 是唯一的字母数字开头标识（允许点、下划线、连字符，最长 64 字符）。证据 digest 为原始字节的 \`sha256:<64位小写十六进制>\`。implementation 是整个有效实现批次集合的摘要，不是单条 event 或 batch 的 id；失败结果如实为 fail 或 error。
5. 直接编辑该 Idea 的 \`events.jsonl\` 追加事实，保留原始字节前缀；每条新事件递归按 ASCII 键序序列化为单行 JSON，使用 UTF-8、LF 和最终换行，再运行 \`silvermoon check-changes --worktree --audience agent\` 检查。不新增人类结果确认。每次写入前核对最新文件字节与版本；冲突时重新观察。
6. 按已有授权提交并同步部署证据和 events，最后运行 \`silvermoon check-idea <idea> --audience agent\`。只有全部 Rules 通过，才可宣称 Idea 完成；即使本地归约已得到 completed，也不能省略最终同步检查。
`,
  rules: [
    {
      code: "deployment-evidence-valid",
      description:
        "reducer 从 type=verify、batch.phase=deployment 的 events 中，按每个必需部署环境选最后一个批次。各批次必须完整通过，满足当前版本、 受测对象、证据路径及哈希校验，且 batch.implementation 等于当前 state.implementation 摘要。全部批次有效后才生成 state.deployment，并返回 state.level=completed；这只证明领域验收事实，还不能替代独立的最终同步检查。 新实现批次使旧实现摘要对应的部署证据失效；不增加人类实现／部署结果 sign off，不以部署命令返回成功替代 Evidence。",
    },
    {
      code: "deployment-synchronized",
      description:
        "当前部署证据与对应 verify events 必须已提交并同步至本次观察的 primary，工作区无改动、HEAD 等于本次观察的 primary tip，才可最终通过；不能以本地 events、手写 completed 标记或 push 命令成功替代同步事实。若全部验收通过而同一观察的 reducer 结论不是 completed，须将内部状态不一致作为执行错误传播，而不是另设完成检查点或默认通过。",
    },
  ],
  output: {
    description:
      "成功不新增 Context 数据，pass output 为 undefined；整个 Task 可以报告通过，但不自动写事件、发布或执行其他操作。",
  },
} as const satisfies CheckpointDocumentation;
