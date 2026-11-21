import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "implementation",
  title: "实现验收已通过并同步",
  description:
    "检查准确实现版本已完成可重现自动化测试，且实现、测试和验证事件已同步。",
  instructions: `### 判断当前状态

你需要读取 idea-folder 输出的 state：state.level=implementation
表示尚无当前版本的有效自动化验收记录。通过后 state.implementation
就是实际通过测试的完整 Git 提交 ID，不是报告摘要或逐环境集合。
完成实现和已确认用例对应的自动化测试，实际执行全部测试并确认通过，
再记录准确提交并同步至 primary，才能进入部署。
不要求 implementation report，也不要求持久化测试输出；
但不能把“可重现”当作本次无需执行。
本 Check 只核验事实与版本绑定，不自动执行项目代码、提交或推送，
不声称仅从事件证明测试真实发生。

### 验证、记录和同步

1. 按已确认需求、方案和测试用例完成实现，保存测试代码、依赖锁定和明确的运行入口；将全部需要验收的代码和五个已确认版本纳入准确受测提交。
2. 按已有测试执行授权，在该准确提交对应的干净工作区执行全部实现用例对应的自动化测试，包括用例明确要求的平台组合。失败、错误、阻塞或未执行时不能记录通过或进入部署；修复后对新提交重新执行，不复用旧成功。即使版本相同，本次复测失败也必须停止推进，不能以旧事件覆盖实际失败。
3. 全部通过后重新核对 revisions、eventDigest、primary 和受测代码；确认没有执行期间的并发变化，再准备下列事件。rev 是实际通过测试的提交，不是追加事件后的新 HEAD；不增加人类结果 signOff、实现报告、日志哈希或第二个 revision。

\`\`\`json
{
  "version": 1,
  "id": "<new-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "verify",
  "phase": "implementation",
  "rev": "<exact-tested-commit-SHA>"
}
\`\`\`

4. 追加事件时保留原始字节前缀，使用全新 id、当前规范 UTC ISO 时间、递归 ASCII 键序、UTF-8、LF 和最终换行。先运行 worktree 的 check-changes，再暂存并运行 staged 检查。
5. 按已有授权提交并同步实现、自动化测试和事件，再运行 check-idea；仅增加本 Idea events.jsonl 或 evidence/ 不要求重新测试代码，其他受跟踪内容变化必须重新自动化验收。只有以下全部 Rules 通过才能部署，state.implementation 存在不等于已同步。
`,
  rules: [
    {
      code: "implementation-evidence-valid",
      description:
        "五个准确版本的共识及各自 primary 同步满足后，按日志顺序取最后一条 version=1、phase=implementation 的 verify。其 rev 必须是 HEAD 的祖先或自身，且其快照中的五个共识版本等于当前有效签署版本。 按 idea-folder 定义比较受测提交与当前快照，除本 Idea 的 events.jsonl 和 evidence/ 外，其他受跟踪内容必须相同；不能只比较最终业务源码而忽略测试、 锁文件或配置。Agent 必须已实际执行该提交对应的全部自动化用例并确认通过， 测试实现及明确入口可重现，不要求实现报告或测试输出副本。 checker 校验提交、材料和事件绑定，不自动运行目标代码，也不独立证明实际执行； 缺少、失效或无法确认本次通过事实时不得推进，不回退旧事件。 有效时 state.implementation 直接等于该 rev。",
    },
    {
      code: "implementation-synchronized",
      description:
        "被验证的实现提交、自动化测试和对应 verify 事件 必须已提交并同步至本次观察的 primary。工作区必须无改动，HEAD 必须等于本次观察的 primary tip；不能以本地 events、手写状态或 push 命令成功替代同步事实。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；部署检查承接实现验收已通过且结果已同步的事实，继续使用 idea-folder 中当前有效实现提交，不接受额外传入的成功标记。",
  },
} as const satisfies CheckpointDocumentation;
