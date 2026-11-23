import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "deployment",
  title: "部署与 Agent 自验已通过并同步",
  description:
    "检查固定报告记录了 Agent 对当前实现的完整 E2E 手工验收，且报告和事件已同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state：state.level=deployment
表示尚无绑定当前实现的完整部署验证结果；只有 reducer 生成 state.deployment
报告摘要并越过 deployment 阶段，才表明 Agent 手工自验已达成，仍须通过独立的同步 Rule。
部署已经验收并同步的实现版本，按已确认部署用例进行 Agent 主导的 E2E 手工测试，
将各用例的完成情况写入固定报告，用 verify.rev 绑定报告。随后将报告、必要附件和 events
提交并同步至项目配置的 primary（例如 origin/main），全部满足下列 Rules 后
才能交给用户实际操作和验收，Idea 此时尚未完成。
不能以部署命令成功替代自验证据，不能以 Agent 自验代替用户确认，
也不把本检查点当作部署操作授权或自动执行提交、推送。

### 验证、记录和同步

1. 仅在实现 checkpoint 已通过后，按已有部署授权部署准确的已验收实现。这里的部署可为本地服务、CLI 或其他实际交付物，不强制 production、staging 等环境模型。
2. 核对当前 revisions、eventDigest、primary 和 state.implementation，确认实际交付对应这一准确实现提交。Agent 按全部部署用例主导执行端到端手工测试，实际操作交付入口并观察结果，不能仅重跑自动化测试或确认部署命令成功。
3. 在固定文件 evidence/deployment/report.jsonl 追加本轮 start 行，然后每完成一个手工 case 就立即追加一行实际结果，包括失败、错误、阻塞或未执行原因；不等最后才重写整份报告。同轮复测只追加新的 case 行，最后一条生效；新一轮从新 start 开始，必须重新覆盖全部部署用例。下例仅展示一个用例，context 无需要时省略。

\`\`\`jsonl
{"version":1,"type":"start","implementation":"<state.implementation>"}
{"type":"case","case":"D-01","steps":"打开登录页，输入有效测试账号并提交。","expected":"进入主页并显示登录状态。","actual":"已进入主页，登录状态与测试账号一致。","result":"pass"}
\`\`\`

4. 保存报告后计算其原始 UTF-8 字节的 SHA-256，追加下列事件。rev 只出现一次；路径由 phase 固定推导，不携带 environment 或 report 对象。失败或未完成也按实际状态保存报告和事件，不能以旧成功覆盖本次结果。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "verify",
  "phase": "deployment",
  "rev": "<sha256-of-raw-report-bytes>"
}
\`\`\`

5. 保留 events.jsonl 和报告的原始字节前缀，只追加完整记录。事件使用新 id、当前规范 UTC ISO 时间、递归 ASCII 键序、UTF-8、LF 和最终换行。最新事件必须匹配整个报告当前字节；不要求旧 rev 匹配追加后的文件。写入前核对最新版本，冲突时重新观察，不清空报告或删除失败记录。
6. 按已有授权运行 worktree、staged 的 check-changes，将报告、必要附件和事件一起提交并同步，再运行 check-idea。全部 Rules 通过后才进入独立用户体验验收，不能提前宣称 Idea 完成。
`,
  rules: [
    {
      code: "deployment-evidence-valid",
      description:
        "按事件行顺序选最后一条 version=1、phase=deployment 的 verify， 且它必须位于最新 implementation verify 之后。读取固定安全普通文件 evidence/deployment/report.jsonl，要求全文件原始字节 SHA-256 等于事件 rev。 全部历史行均须满足上述严格格式；只取最新 start 至文件末尾作为本轮， start.implementation 严格等于当前 state.implementation。 本轮 case 行只能引用当前 deployment 用例，不能夹带实现或未知用例； 按 case 取本轮最后一行，必须恰好覆盖当前全部部署用例，且均为 pass。 同轮早期失败仍保留，但可由真实复测的新结果替代；不跨 start 复用旧结果，不回退某个 case 的旧成功。各行 steps、expected、actual 均须为非空实际记录，不以整体成功标记代替逐项验收。任一最终结果为 fail、error、blocked、not-run， 缺项、报告缺失、摘要不符或实现过期均阻断，不回退旧报告或旧格式成功。 有效时 state.deployment 直接等于最新事件 rev； 缺少当前交付的有效用户确认时返回 state.level=user-acceptance，而不是 completed。 报告证明的是 Agent 所记录的逐项验收结论及其版本绑定，不独立证明操作真实发生， 不代表用户验收通过，也不以部署命令返回成功或自动化测试通过替代手工 E2E。",
    },
    {
      code: "deployment-synchronized",
      description:
        "当前固定部署报告、用例要求的必要附件与最新 verify 事件 必须已提交并同步至本次观察的 primary，工作区无改动、HEAD 等于本次观察的 primary tip，才可通过本检查点；不能以本地 events、手写状态或 push 命令成功替代同步事实。部署自验及同步通过后，仍须通过独立的 user-acceptance 检查点，不能直接完成 Idea。",
    },
  ],
  output: {
    description:
      "成功不新增 Context 数据，pass output 为 undefined；后续用户体验验收继续使用 idea-folder 输出的当前 implementation 代码提交和 deployment 报告摘要，本检查点通过不等于用户接受交付或 Idea 完成。",
  },
} as const satisfies CheckpointDocumentation;
