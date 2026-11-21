import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "idea-folder",
  title: "Idea 数据有效",
  description:
    "检查当前 Idea 的协议数据、身份及事件历史有效，并推导后续阶段共用的状态。",
  instructions: `你需要为当前选中的 Idea 建立符合下列 Rules 的可信事实，不能把其他 Idea
的异常混入本检查点。固定 Check CID
缺失、不可信或不支持时按执行错误处理，不猜测最新版替代，也不自动恢复已放弃的
Idea。

### 事件与材料边界（配对 协议）

事件只记录发生了什么、针对哪个对象，以及所引用材料的准确版本。
created 保留初始身份和 Check CID；submit 保存 object、revision 和单一
upstream；signOff 只引用 submit，不重复 object、revision 或 upstream。
setAlias、setLanguage 保留新值；resume 不增加业务正文。
abandon.reason 只写一句简短原因，分析、讨论和用户反馈放在对应材料文件中，
不把长篇说明、报告或证据正文塞入 events.jsonl。

### 提交与确认配对（配对 协议）

新增 version=1 的 submit，业务字段严格为 object、revision、upstream。
object 为 requirements、research、technical、cases、tests 或 user-acceptance；
前五者的 revision 绑定对应材料范围的准确摘要，user-acceptance 绑定当前
deployment 报告摘要，沿报告最新 start 的 implementation 追溯准确代码提交。
upstream 是直接前序的准确内容 revision，不是 submit ID、signOff ID 或对象映射；
非空时使用 sha256:<64位小写十六进制>。
requirements 为 null；research 绑定 requirements revision；
technical 绑定 research revision；cases 绑定 technical revision；
tests 绑定 cases revision；user-acceptance 绑定 tests revision。
这样只维护一条内容依赖链，不在每个事件重复全部前序 revision。

除根节点外，submit.upstream 必须等于本 Idea 当前已配对确认且同步的
直接前序内容 revision；object 唯一决定前序阶段，不能借相同哈希跨阶段匹配。
按日志顺序回放，在每个 submit 出现时从当时已有效确认的直接前序请求
解析其完整内容依赖链；该上下文由事件历史推导，不额外写入版本向量。
判断当前有效性时，submit.revision 必须匹配当前材料，upstream 必须匹配
当前直接前序 revision，且提交当时解析的全部祖先 revision 仍匹配当前内容。
任一祖先变化均使依赖它的后续 submission 及其 signOff 失效；
即使直接前序材料未改，也不能跳过已失效的祖先，或将后来同 revision、
不同祖先上下文的新提交替换到旧请求中，让旧确认自动适用于新上下文。

每次重新提交都使用新 id，本次请求仍需自己的 signOff，不能复用旧请求的确认；
但前序仅重新 submit、内容 revision 和完整依赖上下文均未变时，
不因 submit ID 变化作废下游 submission。
前序最新请求尚待确认或同步时仍停在该前序关口，确认同步后内容链相同的下游
可继续有效；前序内容或其依赖上下文变化时，下游必须重新 submit 并确认。

Agent 先准备材料、观察版本并追加 submit，再向用户展示该准确提交并等待信号；
submit 不是批准，未收到明确接受时不能提前追加 signOff 或推进下一关。
用户要求修改时保留旧事件，修改后重新 submit；不把旧反馈套到新请求。
用户明确接受后，重新核对内容、前序链和当前最新 submit，再追加
version=1 的 signOff，业务字段严格只有 submit=<本次submit事件ID>。
引用须指向本 Idea 日志中更早的最新有效 submit，且一条 submit 至多配对
一条 signOff；孤立、重复、前向或未知引用是数据无效，旧请求迟到的信号不得
当成新请求的确认。signOff 不携带 decision，也不证明用户身份。
下面仅示意用户已明确接受后的配对事件，不能在 submit 时提前写入：

\`\`\`json
{
  "version": 1,
  "id": "<new-signoff-32-hex>",
  "at": "<current-UTC-ISO-time>",
  "type": "signOff",
  "submit": "<current-submit-event-id>"
}
\`\`\`

submit、signOff 和材料必须一起进入 primary 后才可越过对应共识关口；
submit 可以先提交同步，signOff 在用户信号后另行追加同步，不要求同一 Git 提交。
新事件保留历史字节前缀，使用全新 32 位小写十六进制 id、规范 UTC ISO 时间、
递归 ASCII 键序、UTF-8、LF 和最终换行；写入前核对 eventDigest 和 primary，
冲突时重新观察，不盲目复用旧输入。

### 两阶段验证（配对 协议）

新 verify 使用 version=1，除通用 version、唯一 id、at 和 type 外，
body 仅包含 phase、rev；不再包含 environment、report.path、batch、results、
共识版本向量、证据清单或额外的结果标记。phase 只能是 implementation 或 deployment。
rev 表示本阶段验收对象的准确版本，不是事件修订号：
implementation 的 rev 是完成自动化测试的准确完整 Git 提交 ID；
deployment 的 rev 是固定报告原始 UTF-8 字节的 SHA-256，
格式为 sha256:<64位小写十六进制>。不把代码提交 ID 与报告内容摘要混为一谈。

implementation 不创建 report，也不要求保存测试运行日志或逐用例结果副本。
测试代码、依赖锁定和明确的运行入口必须可重现已确认的全部实现用例。
Agent 实际运行并确认全部通过后才追加 implementation verify；
该事件记录 Agent 已完成本次自动化验收，不是跳过执行的授权。
checker 核验版本和同步绑定，不从一条事件独立证明测试真实发生，
不自动执行项目代码；需要复核时按已有授权重新运行相同测试。

deployment 只使用相对于 Idea 根目录的 evidence/deployment/report.jsonl。
report.path 可由 phase 唯一推导，不写进事件；不另设 batch id 或逐环境报告。
报告使用 UTF-8、LF，每行一个完整严格 JSON 对象，末尾换行，不接受空行或半行。
行格式仅有两种，均不允许额外字段：
start 行包含 version=1、type=start、implementation，及可选非空 context 文本；
implementation 等于当前 state.implementation，即准确受测代码提交，
context 仅描述本轮实际测试条件，不是通用 environment 参数。
case 行包含 type=case、case、steps、expected、actual、result；
case 是部署用例 ID，steps 为非空操作说明，expected 为非空预期，
actual 为非空实际观察或未执行原因，result 为 pass、fail、error、blocked 或 not-run。
文件第一行必须是 start；每轮先追加 start，再逐个执行用例并立即追加 case 行。
最新 start 到文件末尾为本轮，不能拿前轮结果补齐本轮。
同轮复测同一 case 时只追加新行，最后一条决定该 case 当前状态，先前失败不能删除。
最新轮每个已确认部署用例至少有一条结果，按 case 取最后结果后全部为 pass，
才推导整体验收通过；缺项及任何非 pass 均阻断。
不保存整体 result、results 数组或完成标记；整体验收由 checker 推导，
verify.rev 绑定本次记录完毕后的文件，不再写一份重复结论。
不强制每个用例额外附一份日志或截图，必要附件仍须使用 Idea 内安全普通文件。

固定报告本身 append-only：保留 primary 中已记录报告的完整原始字节前缀，
只能追加，不能覆盖、删除、截断或格式化旧行；重新验收也追加 start 而非清空文件。
并发写入先复核前缀和版本，不交错写入或自动覆盖冲突。
保存本轮记录后计算整个报告当前原始字节 rev，再追加全新 verify 事件。
同一次配对快照中报告和最新事件必须匹配，之后一起提交、同步。
工作树只维护这一个累积报告文件，不为每次验证复制目录，Git 另保留提交历史。
历史事件原始字节不变，但其 rev 不要求匹配当前报告；
checker 仅对最新 deployment verify 校验当前报告，不能逐条用当前文件校验历史 rev。
追加 start 或 case 后但未追加匹配事件时，旧 rev 已失效；
本轮未完成、失败或报告缺失时，均不得回退旧成功。
报告不保存自身 rev，不对 evidence 目录或 events.jsonl 计算报告摘要，避免循环依赖。
报告全文件上限为 1 MiB、4096 行，每轮最多 512 个不同部署用例，
并受 Idea 总容量限制；达到容量时明确阻断，不通过截断历史绕过。
events.jsonl 仍独立受 1 MiB 和 4096 条限制。

历史 旧格式、内嵌 batch 的 verify 保留原始字节，只读兼容，不批量改写。
历史 旧格式 signOff 保留原始字节及旧语义，不伪造其缺失的 submit。
仅后续明确支持配对 协议的 Check 可读取 version=1 的 submit、signOff 和 verify；
其余事件版本保持原约定，未知版本明确报错，不按旧结构猜测或静默降级。
本轮不改变任何 Idea 的固定 checkCid 或历史 CAR。
配对 协议不把旧的逐环境批次和新的按阶段验收混算。
支持配对 协议的 Check 可只读解释旧历史，但要按新规则推进，
必须重新执行自动化测试并记录 version=1 的 implementation verify，
再完成固定报告和 version=1 的 deployment verify；旧批次不自动充当新格式通过证据。
新格式开始后不得新增旧格式 signOff 或 verify，五个共识须重新按 submit/signOff
配对建立有效链；切换前的原始历史和摘要保持不变。不自动迁移既有 Idea 或更换固定 Check。
`,
  rules: [
    {
      code: "idea-folder-identity-immutable",
      description:
        "当前选中的 Idea 必须保留 primary 中已记录 bootstrap 的 version、id、checkCid 和 createdAt 字段值；不校验其他 Idea 的身份，JSON 排版或字段顺序变化不构成身份变化。",
    },
    {
      code: "idea-folder-event-history-append-only",
      description:
        "当前选中的 Idea 必须保留 primary 中已记录事件的原始 UTF-8 字节的准确前缀，只能追加；不校验其他 Idea 的事件历史。",
    },
    {
      code: "idea-folder-deployment-report-append-only",
      description:
        "当前 Idea 的配对 JSONL 部署报告必须保留 primary 中已有文件的原始 UTF-8 字节准确前缀，只能在末尾追加完整行，不可删除、截断、覆盖或重排。 primary 尚无报告时可新建；该约束不改写或迁移旧协议的证据文件。 后续提交检查也必须执行同一约束，不能仅在生命周期验收时检查。",
    },
    {
      code: "idea-folder-data-valid",
      description:
        "Idea 必须能够唯一解析，bootstrap、事件、文件树、用例索引及固定 Check CID 绑定必须符合明确支持的协议、结构、安全与容量约束。 version=1 submit 和 signOff 必须满足上述严格字段、单链阶段及有序配对规则， 不允许孤立或重复确认，也不凭旧 v1 signOff 合成 submit。 最新 submit 未确认或内容、前序链失效是对应共识关口未通过，不是允许回退的理由。 version=1 的 verify 必须符合上述最小事件形态；implementation.rev 必须是仓库中可解析的准确完整提交 ID；最新 deployment 引用的固定报告必须存在于配对快照，路径安全、逐行结构合法且原始字节哈希准确匹配。 不得用占位符、空文件、外部路径或未声明字段替代有效报告。 旧格式事件内的证据仍按旧协议保留和校验，不自动迁移至 JSONL。 新格式历史 deployment 事件不要求匹配当前报告；是否绑定当前版本、 是否完整通过由相应阶段 Rule 判断。 缺失、格式无效或哈希不符按数据不通过报告，意外 I/O、取消、未知协议或 观察期间并发变化按执行错误传播，不能回退旧报告或静默视作成功。",
    },
    {
      code: "idea-folder-active",
      description:
        "Idea 必须处于有效推进状态；显式放弃后，只有授权且有效的 resume 事件才能恢复，Agent 或 CLI 不得自动代写。",
    },
  ],
  output: {
    description:
      "提供从当前内容、有效 events 和准确 primary 快照推导的 Idea 事实，供后续阶段读取同一次 reduce 的结果，不再各自解释事件或维护另一套状态。 CLI 使用 `silvermoon check-idea <idea> --json` 观察； 生命周期 Problem 的 brief 包含 level、可选 next、revisions、 eventDigest、primary 和 subject。前置检查失败时只返回前置问题， 不伪造领域状态；本 Task 全部通过才表示完成。",
    fields: [
      {
        name: "state",
        description:
          '执行期 reducer 结果：revisions 是当前内容版本，submitted 按阶段记录最新 submit 事件 ID，包括尚待用户确认的请求；signed 是与最新 submit 配对且材料和单链仍有效的 signOff 事件 ID。 缺少 submit、尚未确认或链失效均停在对应共识阶段， 确认有效但未同步则为 synchronization，next 指向该阶段。 新格式按阶段取日志中最后一条 version=1 verify： implementation 是通过版本绑定检查的 implementation.rev， deployment 是通过完整手工验收检查的 deployment.rev； 不再聚合环境或生成第二份集合摘要，也不是事件 ID。 implementation 提交快照中的五个共识版本必须等于当前有效签署版本； 该提交必须是当前 HEAD 的祖先或自身，之后只允许本 Idea 的 events.jsonl 与 evidence/ 元数据变化，其他受跟踪内容变化必须重新自动化验收。 最新部署报告须绑定同一 implementation，且对应事件位于最新 implementation verify 之后；重新声明实现验收即要求重新部署验收，不回退旧报告。 只有最新记录满足对应阶段 Rules 才提供阶段值，旧纯历史状态保留原语义， 不与新阶段值混算。level 表示首个未达成的领域阶段，不是已完成阶段；synchronization 时 next 表示等待同步的确认阶段，包括 user-acceptance。 五个内容 revision 的阶段键保持 requirements、research、technical、cases、tests； 用户验收不新增内容 revision，以当前 deployment 报告摘要及 implementation 代码提交绑定交付，submitted["user-acceptance"] 记录交付确认请求，signed["user-acceptance"] 记录有效验收事件 ID。 部署自验有效但缺少当前交付的用户确认时 level 为 user-acceptance； 确认及同步均满足后才为 completed。signed 只包含 reducer 已走到的有效签署；前序阻塞时不能据后序键缺失单独判断后序阶段。',
      },
      {
        name: "brief",
        description:
          "受控的事实摘要字符串，供失败规则的 brief 使用；包含归约状态与版本事实，不包含原始文档全文或整个 Context。",
      },
    ],
  },
} as const satisfies CheckpointDocumentation;
