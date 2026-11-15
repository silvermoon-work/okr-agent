# Implementation

本轮依据已接受的 [Idea](./ideal/Idea.md)，将准备阶段种子细化为实施前契约。
身份、协议、迁移边界及公共能力限制见 [Design.md](./Design.md)。
当前已完成源码调查、实施前协议与验收定义，并由监督会话审阅确认；
随后在同步基线 `55f49f142d7d05743cd31dd3e9ccfb100b87cb65` 上完成实现、
全部 Inner 验证与候选交付检查。成绩及准确制品见 I-AC03 下的验证记录。
I-* 勾选仅记录已证明的实施工作，不表示监督会话已接受该 Inner revision。
旧 DFS 实现与成绩仅为不可变历史基线，不继承其完成状态。

实现代理先交回本契约，由监督会话审核、同步并明确授权后才改运行时。
以下各步的验收先于对应实现；每次改变协议或证明范围，先修订契约并交回监督会话。
监督会话拥有 Git、生命周期决定、独立 Outer 验证和 D-*，实施代理不代行。

监督会话依据用户的明确委托，于编码前确认本契约：本地静态定义与队列执行、
v2 报告、显式宿主执行端口和当前 Worker 便利绑定限制均如 Design.md。
接受协作取消的真实边界，不接受通过 Promise.race 提前结束、默默丢来源或
将整个迁移降为串行来满足测试。下面的 I-AC01–03 已在编码前固定；
任何必需协议变更仍先更新契约，不把实施完成等同于通过验收。

## Steps

### I-S01: 固定身份和执行契约

依据模型与场景核对 SDK、两包和作者模板的真实调用关系；固定 Target 值域/
相等规则/规范编码、注册名语法、root 类型关系、取消/故障和预算边界。
核对 Bundle 公共输入/输出与来源定位能力，明确适配协议和旧 API 的迁移方式，
识别任何必要的上游能力阻塞，不在编码中猜测。

本步产物是本文件和 Design.md，不是已实现 API。静态定义保留 schema 推导，
以注册表组合时的类型约束校验异构 children；以受验证的 unknown 调用封装
解决异构运行时分派，不以宽泛断言解决函数参数逆变。
报告采用明确的 `check-report/v2` 协议；原无版本 CheckResult 不被当作图报告。
Bundle 仅经调用方执行端口适配完整报告为叶；确认上游 Worker invokeTask
无法提供该端口所需的单次取消和真实 output envelope，不提供伪便利绑定。

本步完成条件：监督会话确认 Design.md 的协议、预算、迁移策略及能力限制；
随后 I-S02 的类型/运行时试验还必须实际证明这些设计可成立，不能仅凭此文勾选
I-AC01 或 I-AC02。

### I-S02: 实现检查图执行与集成入口

实现 CheckerRegistry、CheckItem、内部节点记录、FIFO 有界并发和本次执行
去重；接入显式 signal、取消清理、稳定汇总及 runCheck 的注册表/根名入口。
SDK 提供 defineChecker，将 target schema 与类型推导的 Checker 函数组合为
静态定义；执行器在身份登记前统一验证，不隐式转换输入。
实现符合已定 Check 契约的 Bundle 适配，不改造成通用 Task 结果合并器。

先落实定义/编码/协议与类型用例，再落实队列/停止/叶适配和 Task 接入。
独立 `executeCheck` 不启动 Worker；`runCheck`/`createCheckCallback` 只绑定受限
上下文、根输入、文档链接及 Task 输出。节点状态、取消控制器、队列、计时器和
事实缓存每次执行新建。错误路径必须等待真实在途 Promise 和资源清理，
保留首个原因及其他执行/清理错误。

本步先以 SDK 聚焦测试证明 I-AC01、I-AC02 及 I-AC03 的适配部分；
任何上游能力不足不得通过缩减取消或来源要求获得通过。

### I-S03: 迁移作者和验证质量

迁移两个现有 Check 的通用/非 Cloudflare 流程及直接依赖模板/调用点，
去除对 serial DFS 共享 mutable scope 的依赖，保留业务规则、来源与安全边界。
按[作者最佳实践](./ideal/Authoring.md)采用显式 object 注册表和职责模块，
不强制逐叶拆文件；自动化检查最佳实践的 Checker 不在本次范围内。
同步文档、针对性测试和新候选交付身份，保持全部已有质量门限。

迁移不仅涉及 `inspect.ts`：TypeScript 包的 `convention.ts` 也有独立 DFS、
共享问题数组和 Checker 互调，必须一并展开为职责注册模块。
保留通用 `Files`/解析器/业务辅助函数，修复并发直接引入的读取预算及缓存竞争；
不修改 Cloudflare 专项、标准资产、固定发布器、消费者最低版本或 registry 政策。
移除活动调用点对旧 DFS API 的依赖；旧接口与无版本输出的迁移/拒绝规则明确记录。

以既有 fixture、CAR/Engine 回归和新增并发交错用例验证业务语义；
再运行完整根 `pnpm check`。最终交付准确 SDK tarball（同一份字节的 SHA256）、
两份生产 CAR 的路径/CID，以及明确区分的确定性 TypeScript 验证 CAR 和
good/npm/bad/member-pruning fixture 路径；不将生成路径或预期结果当作执行证据。

## Acceptance criteria

### I-AC01: 身份和类型契约可证

G01–G03、G11–G12 的类型/运行时/编码用例证明值相等与规范编码对应、
合法根名及异构 children 类型正确、登记后的身份稳定且无跨执行缓存；
注册重复/未知或不支持的数据明确失败。
defineChecker 的 target 类型推导、静态注册表键保留和执行前结构验证有聚焦测试，
不会通过静默转换、属性覆盖或裸函数调用假设绕过身份契约。

证明入口：SDK `test/graph-types.test.ts` 的编译期正反例，以及
`test/graph.test.ts` / `test/canonical.test.ts` 的运行时用例（实施时新增）。
必须覆盖：

- 两个不同对象、不同属性顺序的深层相等；不同注册名、数组顺序及 Unicode
  序列不误合并；`-0`/`0` 同值。
- getter 不被调用；Proxy、非枚举字段、symbol 键、自定义原型、稀疏数组、
  非有限数字、循环等拒绝；重复引用但非环可接受。
- 注册后修改原目标/child 不改变执行参数；深冻快照不能被 Checker 改写。
- 非法 schema 参数在登记、调用前失败；未知 root/child、根契约不匹配、
  异构 child 参数错误有运行时和 `@ts-expect-error` 证明。
- 同名组合冲突在覆盖前失败，执行中更改原注册表不重绑；两次执行重新观察。

### I-AC02: 调度和取消语义可证

G04–G10 以调用轨迹、受控异步时序和真实清理结果证明单次执行去重、
边保留、局部剪枝、FIFO/并发上限、无层级屏障、稳定报告以及 abort/故障/
预算耗尽停止调度和清理，不只比较问题总数。

证明入口：SDK 受控 deferred Promise/调用轨迹测试，不依赖 sleep 猜时序。
每项断言至少检查调用次数、启动顺序、signal 状态、节点/边或终止原因：

- 同一 child 在 queued/running/completed 三种状态被再次发现时仍只有一个调用；
  自环和菱形有限结束，重复边折叠但不同父边保留。
- concurrency=2 时慢兄弟仍在途，快父项 child 取得空槽；已排队项不被插队；
  concurrency=1 是可选边界用例，不是全实现的并发替代。
- 用相反完成顺序取得相同完整报告；两个节点的相同 code/brief 均保留。
- 预取消零调用；中途取消和节点故障后无新启动/展开；清理完成前外层不 settle；
  迟到 children 被忽略，清理拒绝进入可检查错误集合且无 unhandled rejection。
- 并发、节点、边/child 尝试、编码/结果体积、深度和时间预算的边界通过，
  越界为执行故障；立即 resolved 的展开链仍给 timer/abort 公平执行机会。

### I-AC03: 集成迁移和质量门禁通过

G13–G14 与既有回归证明 Bundle 适配、问题来源、作者入口和两包兼容边界；
根 pnpm check 及适用 build/typecheck/lint/format-check/test-coverage/
lint-package 通过，四项既有覆盖率门限未降。构建准确 SDK 候选包和两个新 CAR，
明确协议变更，不用旧 CID/旧验收冒充新结果。

证明入口与所需观察：

- SDK `test/bundle.test.ts`：本地与 leaf Bundle 混合；子正常失败保留原 code、
  子 output CID、文档路径和子 node key；嵌套来源不被父契约重写。
  v1/任意 JSON/空 problems/错误 pass/伪图关系/缺 envelope 被拒绝；
  raw CheckContext 在类型和运行时均不是执行端口。
- 使用公开 Engine 的集成用例：准确 CID 输入，真实 output 的文档可读；
  在途取消/兄弟故障触发 cancelTask，waitForTaskRelease 完成前端口不结束；
  取消/释放故障保留。此处是 Inner 证据，不替代监督会话的独立 Outer 消费。
- TypeScript 既有共享配置、错误 manifest 剪枝、独立好成员、CI/发布规则、
  文档/资产字节、Cloudflare 正反例保持；新增不同成员异步交错，证明
  `scopeContext`/当前 problems 不串扰，共享根因仍保留全部成员影响范围。
- 工具链已有 missing/unusable/低版本/pairing/management/registry/nrm 回归保持；
  同时失败的独立工具不被按 code 吞掉，停止确实传入 `Host.run`/进程清理。
- Builder 生成新根/registry 入口并实际 typecheck/build/运行；
  原 imports/离线 CAR/sidecar/CID 不变性回归保留，但不冒称旧 invokeTask
  的父问题转换已经保留子来源。
- 每次 PowerShell 验证均先将已校验 Node 26.13.1 目录置于 PATH 首位，
  使用 pnpm 11.28.12；只对所编辑文件选择定向静态/格式命令，不自动升级安装。
  最终根 check 包含未测试源码及四项 90% 门限，适用 build/lint-package 不跳过。

#### 实现与验证记录（2026-11-16，zh-CN）

验证根目录为 `D:\Code\okr-agent.worktrees\target-checker-implementation-dfs`。
以下路径均相对该根目录。全部 Node 检查均把指定、已校验的 Node 26.13.1
目录放在 PATH 首位，使用 pnpm 11.28.12。没有提交、暂存、推送、发布或追加
生命周期事件；HEAD 仍为上面的同步基线，候选保留为未暂存变更。

| 对应场景 | 已实现及实际证明 |
| --- | --- |
| G01–G03、G11–G12 | SDK `canonical.ts`、`checker.ts`、`graph.ts`；`canonical.test.ts`、`graph-types.test.ts`、`targets.test.ts`、`graph.test.ts` 通过。包含真实执行的不同属性插入顺序去重、同 target 不同名称不合并、异构 child/root 负类型用例、descriptor/Proxy/原型/循环拒绝、队列中目标和原 registry 修改隔离、跨执行重新调用。 |
| G04–G08 | 受控 Promise 用例覆盖 queued/running/completed 三状态复访、自环/回边/菱形、重复边折叠、独立父边保留、根/分支失败剪枝、并发槽/FIFO/无整层屏障、反转完成顺序仍得到相同报告、相同 code/brief 的独立节点不被合并。 |
| G09–G10 | 预取消 root 调用数为零；在途 signal、迟到 children 抑制、真正清理完成前不 settle、多个执行/清理错误保留；节点/边/child 尝试、编码深度/体积、问题数及执行时间预算用例通过。立即完成链会让出事件循环，timer 能实际停止展开。 |
| G13 | Builder `test/builder.test.ts` 通过真实公共 Builder/Engine 运行 v2 子 Bundle：正常通过/失败、真实 output.cid 下的问题文档、在途取消和兄弟执行故障。检查实际异步操作 started/cleaned 标记，cancelTask 后等待 waitForTaskRelease，确认 Run=stopped 且 reclaimedAt 已出现再结束；没有用预取消代替。SDK `bundle.test.ts` 验证旧协议/任意 JSON/缺 envelope/伪图/非法来源拒绝及嵌套来源保留。 |
| G14 | 两包真实主入口与 Builder 模板迁移到普通 root 和静态 registry。TypeScript 的项目、配置绑定/归因、维护及节点收集职责位于 `src/checks/`；工具 schema/探测职责位于工具链 `src/checks/`，关系/授权 Host 保持分责。无旧 DFS 执行器或整套旧 DFS 叶包装。 |
| G14 的并发及业务回归 | `graph-project.test.ts` 强制两个成员配置读操作重叠，观测并发 2 且两个成员的问题/scope 不串扰；共享配置仍在同一配置节点局部归因。`files-unit.test.ts` 验证同路径在途读取复用、并发字节预留，以及读取+关闭双故障保留。既有坏 manifest 剪枝、好成员、CI/交付、缺工具/低版本、配对/管理/registry/nrm 和 Cloudflare 正反例均通过。 |

`runCheck`/`createCheckCallback` 额外用真实公共 Protocol `json(...,65536)`
约束整个结果体，并保留自身规范编码检查；独立图执行仍使用已定执行预算。
这避免把独立图的 16 MiB 累计结果预算错误当作 Engine 的 64 KiB 输出准入。
`createCheckContract` 的 result 和共享 check-problem schema 均为 v2 来源结构，
实际公共 Bundle schema admission 和 Engine 输出验证已通过，不只验证 mock。

调查及迭代中发现并修复了以下真实边界，没有降低门限或吞掉失败：

- 正常协作 AbortError 最初会被误记为额外清理失败；现在仅在 cause 确认等于
  本 signal.reason 时作为协作取消处理，真正的其他清理错误仍进入错误集合。
  工具链取消/Task deadline 的 Run 为 stopped，独立命令超时仍为 failed；
  无业务输出、停止事实和实际子 PID 回收的原断言保留。
- 完整门禁暴露兼容性分支先读未完成 Node 事实的竞争；共享 loadNode Promise
  由 runtime/dependency 读取器显式等待，并增加调用顺序回归。
  兼容性发现从已通过的 dependency-config 节点展开，坏共享配置仅由所属
  节点报告一次，不按 code 全局去重，也不伪造前置通过。
- 子输出文档不能仅从原始 Bundle CAR block port 读取。真实宿主测试组合公共
  MemoryStore.readContentBlock 与 CAR block port 后交给调用方 IpfsStore，
  从实际返回的 output.cid 读取；未使用私有 Engine API 或猜测 CID。
- 初次本地 tarball 发现旧 dist/targets.* 残留，候选作废并删除。
  SDK 自有 build 现在先清理自身 dist，新增真实构建回归证明删除模块不会泄漏。
  以下唯一交接 tarball 在清理后打包，43 个文件，不含旧 targets.* 或测试残留。
  未修改标准资产或固定发布器以达成此修复。

#### 完整门禁与候选包

最后一次完整 `pnpm check` 退出码 **0**；日志保留于
`dist\graph-validation\root-check.log`。格式检查、依赖顺序 build、typecheck、
type-aware lint、包括未测试源码的覆盖率、13 项 release 回归、两包 publint
及 check-scripts 均通过。SDK 87、Builder 52、工具链 116、TypeScript 616 项测试
通过；另有 core 3、example 1 项。工具链原有 4 项显式 native 场景仍按原设置
跳过，不将受控 fixture 或旧平台成绩声称为本轮真实全平台支持。

| 包 | statements | branches | functions | lines |
| --- | ---: | ---: | ---: | ---: |
| check-task-sdk | 93.56% | 90.90% | 96.42% | 94.36% |
| check-task-builder | 97.46% | 91.11% | 100% | 98.05% |
| check.nodejs-toolchain | 95.71% | 92.90% | 100% | 97.29% |
| check.typescript-project | 93.94% | 90.09% | 98.37% | 94.92% |

四项全局门限仍分别为 90%，没有新增源码排除。
SDK 仅新增显式运行时依赖 `@silvermoon-work/task-protocol@0.2.0-rc.1`
（复用既有 catalog），对应 lockfile catalog/importer 一并更新。
未改消费者 Node 下限、任何发布版本、registry 政策、AGENTS.md、
Cloudflare 专项两源文件、标准资产或固定发布核心；旧 DFS Idea 与全部 D-* 未改。

最终 SDK：

- 路径：`dist\graph-validation\check-task-sdk-graph-final.tgz`
- 身份：`@silvermoon-work/check-task-sdk@0.1.0-rc.1`，这是本地未发布源码候选，
  不是已发布同版本字节或发布授权。
- SHA256：`39306812d00ff01e8d10dff0be3ad68923c055409032e614bf03e468409e6821`
- 清理后打包命令：`pnpm --dir packages\check-task-sdk --config.ignore-scripts=true pack --out D:\Code\okr-agent.worktrees\target-checker-implementation-dfs\dist\graph-validation\check-task-sdk-graph-final.tgz`
- 对该准确 tarball 执行 `pnpm exec publint run dist\graph-validation\check-task-sdk-graph-final.tgz --strict`，
  退出码 0；tar 读取核验 name/version、依赖转换及无旧模块，之后复核 SHA256 未变。
  Outer 应复制/安装这同一份文件，不重新 pack 后沿用此摘要。

#### 准确 CAR 与 fixture 交接

三份 CAR 均用公共 `readTaskBundleCar` 再读取核验完整内容身份；不是仅引用构建日志。

| 类别 | 路径 | 根 CID | 字节数 |
| --- | --- | --- | ---: |
| 生产工具链 | `packages\check.nodejs-toolchain\dist\nodejs-toolchain.car` | `bafybeidrewa4ommkoogtndb5idog2cfn5xuhjstnsb2hxm4l6nd6tm7taa` | 471251 |
| 生产 TypeScript | `packages\check.typescript-project\dist\typescript-project.car` | `bafybeiaqow5thznglyi4ufkulzrk5fel5bc5zl77xya6qvnbmt55ujcnci` | 868985 |
| 确定性 TypeScript 验证 | `packages\check.typescript-project\dist\graph-verification\bundle.car` | `bafybeid6vx2qztpjyp732yqixxwz2yt2p2dpguodrwhoa3d5yjohawalsa` | 869996 |

对应 CAR SHA256 依次为：

1. `d98229bbadc311591ace3d14041341d713d1aebcf60ecd7950aa6dfe5e2cf24f`
2. `2bda7acb3c901f4ca2547d4d0c8cda42081367013a91d46b5726bf0aec338709`
3. `40eda472726ede7645623baad889ab666ddff916dc55549917105f7771e8dc0b`

设置 `TYPESCRIPT_CHECK_PERSIST_EVIDENCE=1` 后，通过既有定向命令
`pnpm --filter @silvermoon-work/check.typescript-project exec vitest run --root . --config ..\..\vitest.config.ts test\car.test.ts`
生成并验证持久 fixture，退出码 0。
本轮使用新的 `graph-verification` 目录，不覆盖旧 DFS 的 verification 目录。
完整结果：`packages\check.typescript-project\dist\graph-verification\engine-fixture-report.json`。

| 目标目录 | 实际结果 |
| --- | --- |
| `packages\check.typescript-project\dist\graph-verification\good` | pass=true，文档可读，资产字节一致 |
| `packages\check.typescript-project\dist\graph-verification\npm` | pass=true，文档可读，资产字节一致 |
| `packages\check.typescript-project\dist\graph-verification\bad` | pass=false，保留 coverage/gate/document 等发现，文档/资产有效 |
| `packages\check.typescript-project\dist\graph-verification\member-pruning` | pass=false，恰有 document-mismatch 与 scope-unconfirmed，坏成员被剪枝 |
| `packages\check.typescript-project\dist\graph-verification\cloudflare` | 既有正例 pass=true |
| `packages\check.typescript-project\dist\graph-verification\bad-cloudflare` | 既有反例 pass=false，包含 cloudflare-mismatch |

确定性验证 CAR 使用 `check.fixture.build.yaml`/受控 metadata，不冒充生产 CAR
或当前公共元数据观测。两份生产 CAR 和 SDK 均未上传、pin 或发布。
当前 Task SDK 仍无 Worker invokeTask 单次取消/output envelope 能力；
已实现并真实验证的适配仅是已约定的宿主端口，不声称已解除该上游限制。
独立环境安装、再次读取相同 tarball、真实消费者在途取消和 Outer 验收仍归监督会话。

#### 监督会话复核

监督会话在验收前直接复核 SDK 的规范快照、类型定义、调度停止/收束、
v2 图完整性和 Bundle 来源转换，以及两包的职责注册、局部收集和事实复用。
独立重新运行根 `pnpm check`，Node 26.13.1 / pnpm 11.28.12 下退出码 0；
已检查变更范围，Ideal 与旧 DFS Idea、Cloudflare 专项源码、标准资产及消费者
最低版本未改变。新增 task-protocol 依赖及 lock importer 对应公共结果预算验证；
SDK build 清理仅针对自身 dist，避免删除模块残留在新 tarball。

本次批准仅确认上述准确实现与 I-AC01–03；不提前勾选 D-*，不把作者内集成
测试或先前传输端口校准等同于本轮独立 Outer 验收。后续阶段先同步新的
验收契约、准确候选身份及独立场景，再执行和记录真实消费证据。
