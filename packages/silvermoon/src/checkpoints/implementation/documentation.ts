import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "implementation",
  title: "实现验收已通过并同步",
  description: "检查实现验收证据完整有效，且实现、证据和验证事件已同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state：state.level=implementation
表示尚无完整有效的实现验证结果；只有 reducer 生成 state.implementation
摘要并进入 deployment 或 completed，才表明实现证据已达成，仍须通过独立的同步 Rule。
缺少证据时完成实现，依据已确认用例在所有必需实现环境完成验证，保存真实通过证据，并用
verify events 记录绑定准确实现版本的结果。随后将实现、证据和 events
提交并同步至项目配置的 primary（例如 origin/main），全部满足下列 Rules
后才能进入部署。缺失、失败或失效时按既有授权重新验证并记录；本 Check
只核验事实，不自动执行实现、测试、提交或推送，也不保证日志陈述本身真实。

### 验证、记录和同步

1. 按已确认需求和技术方案完成实现，针对准确的受测提交，在索引要求的每个实现环境执行该环境全部实现用例。依照测试说明把真实、非空证据保存到当前 Idea 的 \`evidence/implementation/\`。
2. 验证结果由 Agent 如实记录，不增加人类结果 sign off。失败或错误也保留真实记录，修复后重新验证；不能将失败写成 pass，或跳过新失败而选旧成功。
3. 用 \`silvermoon check-idea <idea> --json\` 核对当前 revisions、digest 和可用 primary tip。每个实现环境准备一个独立 verify 批次，覆盖该环境的全部 case；下例仅展示一个结果项，实际必须展开完整集合。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "verify",
  "batch": {
    "id": "<unique-batch-id>",
    "phase": "implementation",
    "revisions": {
      "requirements": "<state.revisions.requirements>",
      "research": "<state.revisions.research>",
      "technical": "<state.revisions.technical>",
      "cases": "<state.revisions.cases>",
      "tests": "<state.revisions.tests>"
    },
    "subject": "<exact-tested-commit-SHA>",
    "environment": "<required-implementation-environment>",
    "results": [
      {"case": "<actual-case-id>", "result": "pass", "evidence": [
        {"path": "evidence/implementation/<actual-file>", "digest": "<sha256-of-raw-evidence-bytes>"}
      ]}
    ]
  }
}
\`\`\`

4. 替换所有占位符：事件 id 为全新 32 位小写十六进制，at 为当前规范 UTC ISO 时间，batch id 使用唯一的字母数字开头标识（允许点、下划线、连字符，最长 64 字符）。证据 digest 为原始文件字节的 \`sha256:<64位小写十六进制>\`。subject 必须是真正受测的提交，不拿追加事件后的 HEAD 冒充；失败时 result 如实为 fail 或 error。
5. 直接编辑该 Idea 的 \`events.jsonl\` 追加事实，保留原始字节前缀；每条新事件递归按 ASCII 键序序列化为单行 JSON，使用 UTF-8、LF 和最终换行，再运行 \`silvermoon check-changes --worktree --audience agent\` 检查。每次写入前核对最新文件字节与版本，冲突时重新观察，不盲目复用旧输入。
6. 按已有授权将实现、证据及 events 提交并同步至配置的 primary，再运行 \`silvermoon check-idea <idea> --audience agent\`。只有 evidence-valid 和 synchronized 两条 Rules 都通过，才能推进部署；\`state.implementation\` 存在不等于已同步。
`,
  rules: [
    {
      code: "implementation-evidence-valid",
      description:
        "五个准确版本的共识及各自 primary 同步满足后，reducer 从 type=verify、 batch.phase=implementation 的 events 中，按每个必需实现环境选最后一个批次。 各批次必须完整覆盖该环境的全部实现用例并通过，绑定当前五个 revision、 准确受测提交，且证据路径及内容哈希有效。全部批次有效后才生成 state.implementation，其值是有效批次集合摘要，不是某条 verify 事件 ID。 新失败、错误或不完整批次使同环境旧成功批次失效；后续提交只增加本 Idea 事件／证据时不使受测代码过期，其他受跟踪内容变化必须重新验证；Check 只核验事实绑定，不执行 LLM 或项目测试，也不保证日志陈述真实。",
    },
    {
      code: "implementation-synchronized",
      description:
        "被验证的实现版本、实现证据及对应 verify events 必须已提交并同步至本次观察的 primary。工作区必须无改动，HEAD 必须等于本次观察的 primary tip；不能以本地 events、手写状态或 push 命令成功替代同步事实。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；部署检查承接实现验收已通过且结果已同步的事实，继续使用 idea-folder 中当前有效实现批次集合的摘要，不接受外部声明的成功结果。",
  },
} as const satisfies CheckpointDocumentation;
