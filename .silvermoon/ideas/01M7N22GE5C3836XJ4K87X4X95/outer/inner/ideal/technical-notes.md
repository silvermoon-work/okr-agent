# Silvermoon 重建：补充技术调研

## 调研基线与证据索引

只读检查了设备上通过全局链接实际使用的旧源码 `D:\Code\silvermoon`，当时 HEAD 为 `8cddf7bce5f7201e7a87cd5397f1167137426932`，worktree 无修改，包版本 `silvermoon@0.5.0`。没有修改、构建、安装或切换该运行时。

旧源码不可变入口：

- [CLI 与命令参数](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/bin/silvermoon.ts)
- [项目 config schema](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/schema/v2/config.schema.json)
- [配置解析规则](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/src/foundation/project-config/rules.ts)
- [旧 ID 编码](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/src/foundation/idea-model/ulid.ts)
- [旧语言优先级](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/src/foundation/language/language.ts)
- [Device 前置](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/src/business/objectives/device/manifest.yaml)
- [Project 前置](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/src/business/objectives/project/manifest.yaml)
- [旧事件语法](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/src/foundation/event-codec/grammar.ts)
- [旧事件门禁与重试策略](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/src/foundation/event-reducer/policy.ts)
- [旧受控写入](https://github.com/shazhou-ww/silvermoon/blob/8cddf7bce5f7201e7a87cd5397f1167137426932/src/business/append-event.ts)

本仓库依据：

- [Check SDK 定义](../../../../../../packages/check-task-sdk/src/checker.ts)、[图执行](../../../../../../packages/check-task-sdk/src/graph.ts)、[身份规范化](../../../../../../packages/check-task-sdk/src/canonical.ts)。
- [Task 结果与文档映射](../../../../../../packages/check-task-sdk/src/task.ts)、[报告结构](../../../../../../packages/check-task-sdk/src/report.ts)。
- [真实 Engine 适配集成测试](../../../../../../packages/check-task-builder/test/builder.test.ts)、[现有 CAR 宿主示例](../../../../../../packages/check.typescript-project/scripts/smoke.mjs)。
- [SDK 说明](../../../../../../packages/check-task-sdk/README.md)、[Builder 说明](../../../../../../packages/check-task-builder/README.md)、[共享依赖版本](../../../../../../pnpm-workspace.yaml)。

Engine / IPFS Store 的接口同时核对了当前安装包 README；它们不是仓库内提交的新 source，也不以历史发布说明替代实际接口。当前关键版本为 Engine / Protocol `0.2.1-rc.1`、Builder `0.2.1-rc.0`、Task SDK `0.2.0`、IPFS Store `0.1.0`。

## 检查图与执行身份

当前 API 是 `defineChecker({target,check})`、`runCheck(contract,{registry,root})`，业务 pass 展开 children，fail 带非空 problems 并停止本节点后续展开。兄弟分支仍会运行。

因此设备、项目、Idea 不能作为三个并发 sibling 排列：那不构成前置依赖。建议串成链，每一层确认前置满足后才返回下一层 child；需要多个事实时先读取同次执行的固定事实，不在 Checker 内递归调用其他注册 Checker。

一个注册 Checker 名称与 canonical target 定义图内节点身份；跨 Bundle 的长期检查对象还要包括准确 Check CID。每次执行有独立的去重和预算，不把 Run ID 当 Idea ID。

Idea 的正常 Target 建议为本机规范化项目定位加新 Idea ID；alias 先解析到 ID，不作为持久身份。绝对路径移动和多机 clone 不天然是同一 Target，应明确这是不同执行定位下的同一仓库 Idea，不能声称跨机物理 target 完全一致。

`check --staged` 等 snapshot 校验是另一种观测意图，不应默默改变同一 Idea 的生命周期身份。可在同一 Bundle 中显式区分 snapshot target 与 lifecycle target，复用底层验证器；保持 snapshot-valid 与 idea-completed 两种含义分离。

图遍历日志只有首次发现的 parent，是生成树，不是所有依赖边。CLI 不得从日志 parent 推导新业务状态或拿 root 单节点通过宣称整个图通过。

## Engine 执行与回收

Task Engine 可以共享完整 Run，不能仅凭“提交了新 Request ID”断言重新读取了当前仓库。

建议首版一次 CLI 观测使用短生命周期、隔离 `MemoryStore` Engine 实例，共享经验证的 IPFS 内容缓存，不共享旧业务 Run 结果。这样同一 `CID + Target` 的下一次命令会重新观察，不需要把随机 nonce 塞入 Target。未来常驻宿主必须另行验证 Engine 输入匹配/提前终止策略，不照搬这个结论。

生命周期要区分 preparing Request、accepted Task、业务结果、释放状态。等待真实 accepted 后才能取消 Task；取消、超时及退出都要等待释放，不能 Promise.race 后宣称清理完成。公共适配模式是 submit/getRequestStatus、cancelTask、waitForTaskRelease 和 getTask 的真实结果。

单次自然耗尽可以使用 `drain()`，但其完成不代表所有 Task 成功。Engine 结束后由创建方关闭内容 store，借用者不关闭共享 store。命令级 preparation 等待也要有预算；Engine 的 preparing 本身没有整体截止，不能误把 Task timeout 当下载截止。

宿主仅信任随准确版本交付的 Check CID。CID 证明内容身份，不证明权限或安全；Worker 不是 OS 沙箱。不要从目标项目配置中执行任意 hooks、JS 或技能脚本来完成只读检查。

设备运行时身份要验证真正的 CLI 安装/入口和个人 skill，而不是把 Worker 的 `import.meta.url` 当本地包路径；新 Bundle 地址是 `ipfs://.../main.mjs`。这一跨宿主边界需要实现期真实进程测试，不能用用户可伪造的 ready 布尔值代替整备。

## 结果与内容读取

当前通用 Check 业务结果为：

```text
pass: true | false
documentation: ContentRef
problems: 非通过时的非空列表
assets: 作者选择交付时的 ContentRef
```

过程进入 Task log，不把整张图塞进结果。问题含 code、brief、documentation、nodeKey 和 source；没有旧 Guide 的 levels、动态 instructions 或通用 metadata。

Task / Run 当前直接暴露 `result: {data,cidPaths}`，不是历史 `output.result`。仓库个别历史 README 仍保留旧写法，集成以当前公共 API、类型及实际测试为准。

`context.resolveContent(bundle,path)` 和 `readContent(cid)` 能得到真实内容；IPFS Store 在 Host 上也公开 `resolveContent` / `readContent`。当前 SDK 将整体及问题文档解析为直接文件 CID，因此取消 reference 解析层是可行的。

但独立文件 CID 丢失相对目录上下文：其中的相对链接不能拿文件 CID 拼路径后假装可解析。作者可使用独立内容引用、交付的 assets 根，或 Host 保留已知 Bundle 内资源基址；首版说明文档应自包含，带相对资源的呈现必须有测试。

建议 Agent 输出有界内联当前 Problem 的说明，保留原始 CID；JSON 返回可机器消费的引用。不是从任意外部 Markdown 递归抓链接或执行代码。通用端口已存在，但不能假定每个 Agent 宿主都有名为某某的 CID 读取命令，需验证实际宿主可达性。

无 gateway 时只使用本地内容，不猜公共源。缺块、校验错误、读取取消、UTF-8 错误、预算超限应明确失败；CLI 不把这些故障改成“没有问题”。

## 版本模型与证据

旧嵌套 Git tree 自动实现“ideal 改动使 inner / outer revision 变化”。平级后需要显式依赖，不能只把目录挪平而继续比较三个彼此无关的 hash。

建议定义受控对象 revision，绑定对应的 Git 内容树以及必要的上游 revision；使用 Git 对象格式，不固定 40 位 SHA-1。Events 和 Evidence 不进入 Spec revision，避免记录一次确认就把被确认对象改掉。

技术问题目录、测试场景目录应有可单独确认的内容边界，避免稍后写结论或具体用例就使此前的范围确认失效。可采用固定入口/固定索引文件加明确资源范围，最终文件清单需在 schema 阶段定稿；不能仅靠 Markdown 任意链接推断整套批准范围。

暂存区、worktree 和 primary 的版本来自各自真实内容。worktree 的读取和 hash 必须检查读取期间的并发变化；仅“读两次 hash 一样”不是通用严格原子快照证明。跨进程写入通过锁与重校验协调，外部编辑器并发变化要阻断操作，不声称 OS 级全局隔离。

人可先确认准确草稿。确认事件记录准确 revision，待同内容提交和同步后生效；若期间出现新 diff，原确认不适用。新写入器不能继续使用旧 assertHumanGate 的“当前树必须已在 primary”条件来限制草稿确认，但正式推进保留 primary 证明。

验收证据只证明它绑定的对象。测试全通过但指向旧提交、不同部署环境或不同标准，应作为不适用证据处理；旧批次保留，不覆盖历史。自动化日志、人工操作截图及摘要都需有来源，不把时间戳或 Event 名称当真实性证明。

首版可对上游变更保守地要求下游复核；对明显不影响标准的补充修改是否允许显式沿用，应作为策略决策，而不是 Agent 自动认定旧签字有效。

## Events 读写边界

新目录不消费旧事件，所以不必保留旧十三事件 union 和世界字段。沿用的应是机制：单一权威 JSONL、严格语法、明确事件版本、可重放归约、准确内容确认、乐观并发和普通 Git 历史。

候选业务类别包括 alias / language、五个确认点、实现/部署验收声明、abandon/resume，以及必要的交接消息；具体名称和载荷尚未批准。初始身份来自目录，不凭空生成已经确认的事件。

建议保留：

- 事件文件采用 LF / UTF-8，并配置新目录的 Git 字节保护；
- digest 绑定完整原始文件，写入时检查 expected digest，必要时检查最新 primary；
- 同一请求重试只在能证明是同一前缀后的同一请求时幂等；
- 单写者锁、候选验证、原子替换及可恢复记录，冲突保留双方事实，拒绝无声重写；
- 记录决定需明确人类授权声明，该声明不是身份认证；不由沉默、聊天推断或 Git 活动生成 sign off；
- 增量 replay cursor 只是观察游标，不是批准或业务状态权威。

不直接移植旧 projection cache、平台 ChangeTime 绑定和完整历史维护复杂度。先用有界全量校验正确实现最小功能；容量不足时明确报错，不能为了省事截断历史后宣称有效。

## 配置并存和项目 prompts

复用 v2 config 与旧目录并存是配置兼容，不是旧 Idea 兼容；新布局校验只认 `.silvermoon/i`。旧 `.silvermoon/guidance` 内容对新工具无效，不校验、不注入，也不在本轮删除。

共享同一 config 意味着修改 primary / preferredLanguage 也可能影响旧工具，应明确提醒；本轮只提出兼容方案，不写入新的配置字段。

项目 `.agents/skills` 属于 Agent 宿主能力，不是 Silvermoon 的 prompt loader。不要通过读取技能 Markdown 产生新的批准、完成状态或隐式运行命令。

## 包与发布边界

参考本仓库 workspace、catalog、Node 范围和交付门禁，不直接复制旧仓库 package scripts 或其 Potential Guide / TUI / Copilot 依赖闭包。

Check 作者包与 npm CLI 分别构建，CLI 打包准确 CAR 与 CID 绑定文件，离线启动检查不依赖临时公共网关。交付验证需核实包内 CAR 的真实 CID 与固定值一致；构建和发布顺序由 Turbo 真实依赖决定，不复制一套工作区调度器。

旧 `silvermoon` 若作为用户仍可安装的转发包，需一个真正交付同名 bin 的薄包；npm 安装语法的 alias 不会自动替所有用户提供这个迁移入口。准确转发方式、版本映射和双包 bin 冲突需要独立真实安装验证。

本轮不新建 workspace、不改依赖、不安装工具、不更改 registry、不上传 CAR、不发布 npm 或标签、不替换全局 CLI。既有旧 Idea 始终使用旧工具推进。

## 调研验证与限制

调研采用源码/公开接口核对和针对性探针。现有 `builder.test.ts` 的 `composes the v2 leaf adapter` 测试已通过：1 项通过、31 项未选中，覆盖真实 Engine 的子 Check 结果、来源及在途取消清理。没有新 Silvermoon 实现，因此不能宣称新 Checker、新事件 writer 或端到端产品已验证。

已核验标准：[ULID canonical spec](https://github.com/ulid/spec) 定义 48-bit 毫秒时间与 80-bit 随机部分，标准 26 位字符串按 ASCII 可排序；同毫秒的生成顺序需额外 monotonic 策略。

曾为此前 33 位方案运行毫秒与排序探针，但用户已更正为 16 位 Hex 短 ID，旧方案及 Base64URL / Base32 候选探针不构成新 ID 实现的验收。

最终 Hex 探针已通过：

- 2,048 个随机样本均为 4 位小写 Hex，前导零 `001f` 保留，拼接后全部为 16 位；
- 5 个 UTC 时间样本覆盖分钟与年边界，同分钟保持相同前缀；
- `2026-11-18T00:09:22.408+08:00` 转换为 UTC 前缀 `202611171609`；
- 每分钟随机空间为 65,536；不重试时，同分钟创建 10 个至少一次碰撞的概率约 0.0686%，100 个约 7.28%。因此独占创建与有界重试是必要行为，不以“稀疏”代替冲突检测；跨分支仍需额外处理。

旧 ULID 探针中 4,096 个连续毫秒的标准编码按 ASCII 正确排序；ICU numeric collation 找到一组相反排序。这不是 Windows Explorer 的实测，不能据此断定用户观察到的具体排序原因。

最终 Hex 格式也做了 numeric collation 反例探针：`2026111716090000` 与 `202611171610a000` 的 ASCII 顺序正确，但数字感知比较相反。分钟时间可读不等于任意文件管理器都按时间显示；`list-ideas` 应使用解析后的时间和固定 tie-break，文件管理器自然排序若成为硬要求则需另定表示并实测。

文档 35 个本地链接已验证存在。根 `pnpm check` 已运行，在 lint 阶段因既有临时测试内容报 6,720 个错误，包括 `packages/ipfsaw/.test-work/rc-preflight/preflight.mjs`；本次只修改旧 ideal 层 Markdown，不修改、删除或忽略这些无关文件，也不将失败称为通过。该根门禁未执行到覆盖率和包检查，不能声称全量质量门禁成功。

仍需实现期覆盖的场景包括：新 ID 解析/碰撞/回拨、旧归档不读取、config 并存、无 guidance、语言独立、草稿准确签字、事件并发及故障恢复、旧证据失效、Task 取消释放、离线 CAR/CID、实际全局 bin 与个人 skill 发现。完整目录和用例应在 Test Spec 阶段与人对齐。
