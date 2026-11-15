# Implementation

本轮依据已接受的 [Idea](./ideal/Idea.md)，将准备阶段种子细化为实施前契约。
身份、协议、迁移边界及公共能力限制见 [Design.md](./Design.md)。
当前已完成源码调查、实施前协议与验收定义，并由监督会话审阅确认；
I-S01 记录该项契约工作，尚未实现代码，I-S02/I-S03 与全部 I-AC 保持未勾选。
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

实际命令、退出码、覆盖率和候选身份在完成后写回本节或现有 Inner 证据位置；
本计划没有新实现执行成绩；除已完成的 I-S01 契约工作外不勾选其他 I-*，不修改 D-*。
