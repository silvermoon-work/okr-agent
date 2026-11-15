# 检查图实施决策

本文件仅支持 [Implementation](./Implementation.md)，不改变已接受的 Ideal。
以下记录编码前决策；实际实现与测试成绩见 Implementation.md 的验证记录。
若类型试验或公共能力事实否定决策，
先交回监督会话修订，不通过断言、隐藏串行化或虚构来源继续实施。

## 已检查的第一方边界

| 位置 | 当前事实与迁移责任 |
| --- | --- |
| SDK `src/targets.ts` | `$root` + type/selector、串行栈、无 visited、Checker 无显式 signal；整块由新图实现替代，不能只替换 stack。 |
| SDK `src/index.ts`、`contracts.ts` | callback + 全局 reporter，CheckResult 仅 pass/documentation/problems；文档固定为父 references。新图入口及版本化结果直接迁移。 |
| TypeScript `src/inspect.ts` | 当前 problems/scopeContext/scoped/deferred、scoped-output 假定 DFS 时序；scripts/maintenance 直接调用其他 Checker。 |
| TypeScript `src/convention.ts` | 另一套 DFS，当前 problems、runtime/dependency 全局事实和 Checker 互调；同属本次迁移，不包装成一个旧 DFS 叶。 |
| TypeScript `src/files.ts` | Files 绑定 signal，缓存/读取计数需要并发审计；安全路径、不执行配置、原有预算保持。 |
| 工具链 `src/inspect.ts`、`command.ts` | 已有每执行事实 Promise 缓存和 signal 进程路径；目标 schema 动态生成、前置问题重复报告、nrm registrations 依赖顺序需要显式化。 |
| Builder `src/project.ts`、两包 main/callback/test worker | 生成及调用旧 callback 签名，随新 registry/root 一起迁移。 |
| Builder `test/builder.test.ts` | imports 回归通过 invokeTask 后改报父 text-mismatch；保留导入/CAR 机制测试，不把这种转换称为子报告来源保真。 |

不改历史 Idea `01M7EDX5PE8Y6W36VJCWPV0EY3`，不恢复旧 stash；
不改 `src/cloudflare.ts`、`src/worker-module.ts`、标准资产和固定发布器核心。
现有 Cloudflare 函数仍通过节点局部 reporter 调用，保留已有行为；必要边界超出
这些限制时先报告监督会话，不自行扩大授权。

## 定义、类型及入口

- `defineChecker({ target, check })` 接受 TypeBox 对象 schema；check 的参数由
  `Static<typeof target>` 推导，第二参数为 AbortSignal，返回 Promise。
  定义阶段不做 I/O、不调用检测、不持有队列或执行缓存。
- `CheckerResult<Item, Code>` 为严格二选一：
  `{pass:true, children:readonly Item[]}` 或
  `{pass:false, problems:readonly [Problem<Code>, ...Problem<Code>[]]}`。
  fail 不携带 children，pass 不携带 problems；拒绝同步返回的伪 Promise 实现。
- `CheckItem<R>` 是由 R 各键映射得到的判别联合：
  `{checker: K, target: Static<R[K]["target"]>}`。
  defineChecker 保留具体结果类型，组合/执行入口逐个检查结果是否符合
  `CheckerResult<CheckItem<R>, Code>`，而非让各函数只返回宽泛 object。
  需要跨模块引用时使用导出的 schema 的 type-only 关联声明及 `satisfies`，
  不运行时反向导入完整 registry，不重复手写 target 属性类型。
- 定义内部提供闭包式的受检查调用：收取 unknown 快照，Value.Check 将其收窄
  到该 schema 的 Static 后再调用 check。异构分派只调用这一安全封装；
  不将 `(A)=>... | (B)=>...` 断言成接受 A|B 的函数。
- `CheckerRegistry` 使用静态 object 字面量，保留键类型。定义和执行时绑定
  都冻结；执行入口复制 own data bindings，之后作者修改原对象不影响本次执行。
  可提供 `mergeCheckerRegistries(...registries)`，逐项插入前检测重名；
  不使用 spread 隐式覆盖。已经在调用方 spread 丢失的历史无法恢复，
  文档明确禁止这种组合，字面量重复键由 TypeScript 拒绝。
- 名称采用 ASCII `^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$`，区分大小写，
  不保留 `$root`，不要求层级或文件路径含义。所有查找用 own 属性/Map，
  `constructor` 等合法名不触发原型查找；symbol/getter 绑定拒绝。
- 独立入口为 `executeCheck({registry, root: CheckItem<R>, signal, limits?})`，
  返回完整 CheckReport，不启动 Worker。公开图只投影不可变节点/边，
  内部 running/queued 状态和 CheckNodeRecord 不成为第二套作者 API。
- Task 入口为 `runCheck(contract, {registry, root, limits?}, outputOptions?)`；
  `createCheckCallback` 同形。需要能力时 registry 接受显式执行期工厂，
  工厂收到受限 CheckContext，其 signal 已是该次图执行的内部取消 signal。
  root 必须静态存在，contract input 的 Static 必须可赋给根 target；
  实际 input 仍分别按 Task input 与根 schema 验证，不只比较 TS 类型。
- 工厂只绑定固定政策、读取器和 Task 能力，不扩大到 TaskContext/output。
  context 创建与初始化也在执行预算和取消范围内，初始化失败不启动根。
  无原始 reporter 模式的新重载；旧 callback 调用点直接迁移。

## 规范目标及登记

Target 根必须是对象（Object.prototype 或 null 原型），内部为有限 JSON 树。
数组仅允许 Array.prototype、连续自有索引和标准 length；对象只允许自有、
可枚举 data 属性。拒绝 accessor、symbol 键、非枚举额外字段、自定义原型、
Date/Map/Set/typed array、Proxy、函数、undefined、bigint、非有限数字和环。
使用 Node 公共 `util.types.isProxy` 在读 descriptor 前拒绝 Proxy；
不执行 getter/toJSON、不用 JSON 转换的丢字段行为作为验证。
同一对象在不同分支重复引用不算环，按值展开；只检测当前祖先链循环。

对象键按 UTF-16 code unit 顺序比较（不用 localeCompare）；字符串按原始
UTF-16 序列相等，不做 Unicode NFC、不合并路径大小写或斜杠。
数字采用有限 JavaScript Number 的值相等，`-0` 与 `0` 合并为 0；
不宣称能还原 JS Number 之外的十进制精度。字符串使用 JSON 转义，
包括孤立 surrogate 的转义；数组严格保留顺序。

一次登记按以下顺序同步完成：校验名称 → descriptor 安全复制并检查有限值域 →
在快照上校验该 Checker schema → 深冻快照 → 规范编码 `[name,target]` →
Map 查重/登记 → 记录边 → 新节点入 FIFO。实际 check 使用同一深冻快照；
对象构造使用安全 data 属性定义，`__proto__` 不触发 setter。
不对输入补默认值、cast/convert/clean、不静默去掉多余字段。
schema 与定义绑定也需要受保护副本，不把 schema 中 TypeBox 元数据当作 Target。

node key 直接使用完整规范字符串，无 hash 碰撞假设。不同名绑定同一函数/CID
仍是不同节点。所有外部返回值在结果边界也按 data 描述检查并做不可变快照；
结果对象异步被作者改写不能改变已登记 children 或已收集 problems。

## 调度、报告及预算

先登记再排队；队首取得空槽。完成节点在同一调度步内验证完整结果，
成功则按返回顺序登记 children，失败仅收集自身问题。
重复父子边折叠，共享节点保留多个父边；自环/回边正常记录并去重终止。
不等待孩子决定父结果，不读取入度做全父 join。

报告节点按完整 node key 的 UTF-16 顺序，边按 `(from,to)` 同序；
问题按节点 key、节点内部返回索引排序。只按唯一节点收集，
不按 code 或 brief 全局去重。图报告中的节点投影为 `{key,item,pass}`，
边为 `{from,to}`，问题至少含当前 `nodeKey` 和来源；对相同结果集合，
反转完成顺序得到同一报告。root 通过而后代失败时总 pass=false。

默认 limits（测试允许降低；所有配置必须为有界正安全整数）：

| 限制 | 默认值/硬上限 |
| --- | --- |
| 同时调用 | 4 / 64 |
| 唯一节点 | 4096 / 16384 |
| 边及累计 child 尝试（含重复） | 各 16384 / 65536 |
| 单 target 规范 UTF-8 字节 | 65536 / 1048576 |
| 累计 target 编码字节（含重复） | 16 MiB / 64 MiB |
| target 深度、累计单 target 值/属性项 | 64、16384 / 同默认硬上限 |
| 累计结果字节、问题数 | 16 MiB、16384 / 64 MiB、65536 |
| 执行时间 timeoutMs | 60000 / 2147483647 |

编码在增长过程中计费，不能先无界构造整个字符串后检查；
重复目标也消耗编码/child 尝试预算，不能用 visited 绕过。
每最多 64 次连续完成/展开让出事件循环，使立即 resolved 链无法饿死 timer
或外部 abort。Task 外层超时可能更早生效，内部不延长外部期限。
容量/时间耗尽是执行故障，不返回截断且 pass=true 的报告。

执行器组合外部 signal 与自身 AbortController；预取消零调用，首次 abort/
执行故障/预算超限先进入 stopping，再 abort 在途工作。stopping 不取新项、
不登记迟到 children、不调用新 Checker。计时器/监听器在收束后移除。
每个在途 Promise 立即挂拒绝处理并最终等待；首个终止原因保留，
其他执行或 cleanup 错误以可枚举 AggregateError.errors 保留。
不以 Promise.race 早退，不把正常业务 fail 当故障，不吞清理拒绝。
对不合作的任意 JS 不提供强制停止保证：预算到点发取消，但仍等待真实退出，
文档明确“执行预算不是强杀/释放完成期限”。

## v2 业务报告与 Bundle 叶适配

CheckReport 的 JSON 增加固定 `protocol: "check-report/v2"`，
含 pass、documentation、root、nodes、edges；fail 必须有非空 problems，
pass 不含 problems。documentation 仍为本报告相对 output 的
`references/check.md`。完整报告验证不只检查 pass：
唯一合法节点键、键/item 一致、根存在、边端点存在、节点状态与问题归属、
整体 pass 一致、文档路径及非空问题都要验证；套用同类体积/数量限制。
报告里的 nodes 是序列化投影，不向父图重新导入或执行。

问题保留 code、brief、documentation、当前 nodeKey；来源为判别结构：

- `source: {kind:"local", checker, nodeKey}`：本次 Bundle 本地声明的 code，
  文档为 `references/problems/<code>.md`。Task 输出契约仍限制为作者的
  TypeBox 有限 code union，Builder 仍检查所有本地问题文档。
- `source: {kind:"output", bundleCid, outputCid, checker, nodeKey}`：
  从已验证子报告导入，code 不要求属于父的有限 union；文档路径在该真实
  outputCid 下解析。父 nodeKey 是叶适配节点，source.nodeKey 是原问题节点。
  子 source 已是 output 时原样保留最终来源，不改成中间父 references。

运行时只接受便携问题码及安全相对文档路径（无绝对路径、反斜杠、空段、
`.`/`..` 段或控制字符）。本地问题和外部问题分别验证，绝不把未知子 code
吸收到父有限 code schema。CID 按既有公共内容引用能力验证，不从任意文本
猜测/补造 CID；无法验证的端口返回拒绝。
`CheckProblem`/`CheckReport` 使用明确 v2 类型；旧 `CheckResult` 仅作为文档中的
历史协议称谓，不让别名暗示旧 JSON 已兼容。旧无版本结果在适配器明确拒绝，
当前源码、模板和直接调用全部迁移，不修改已经发布的历史 CAR。

监督会话已核对实际安装公共声明：

- Task SDK 0.2.0-rc.1 的 `TaskContext.invokeTask(ChildTaskInvocation): Promise<Json>`；
  参数只有 key/bundle:SpaceRef/input/timeoutMs，无单次 signal/cancel，
  返回无 output envelope；RunContext 只有父 signal。
- Engine 0.2.0-rc.2 公开 submit/getRequestStatus/getTask/getRun/cancelTask/
  waitForTaskRelease；Task/Run snapshot 有 output `{cid,result}`；
  IpfsStore 可由调用方拥有并读取。这是监督会话的独立公共声明核对，
  尚不是本轮已通过的执行证据。

因此 SDK 只要求最小调用方端口，不依赖或复制 Engine：

```ts
interface CheckExecutionPort {
  execute(request: {
    bundleCid: string;
    input: JsonObject;
    signal: AbortSignal;
  }): Promise<{ cid: string; result: unknown }>;
}
```

`checkerFromBundle({bundleCid, contract, port})` 产生普通 CheckerDefinition，
target 来自明确子 Check 契约；绑定准确不可变 CID。端口只执行调用方授权的
该 Bundle，使用调用方身份、唯一请求 ID、超时和存储；返回真实成功 Task/Run
output envelope，不能将业务 JSON 外挂一个猜测 cid。SDK 验证明确 v2 结果；
子完整 pass → `{pass:true,children:[]}`，完整 fail → 保留来源的非空问题。
所有失败/取消/释放失败照实 reject，不扩展跨 Bundle children。

端口契约要求 signal 包括图内兄弟故障取消；submit 尚在 preparing 时也要跟踪
请求到可取消/终态，不因尚无 task id 放弃清理。已接收的 Task 调用 cancelTask，
最终 await waitForTaskRelease，成功路径同样确认释放；多个失败均保留。
调用方拥有 Engine/IpfsStore，端口不得关闭共享存储。SDK 不实现第二个调度引擎，
公开 Engine 绑定仅作为测试和消费者示例的薄端口。

`CheckContext`/raw invokeTask 不是此端口，缺 execute 在类型和运行时拒绝。
当前版本不提供 Worker 内自动 Bundle adapter 便利绑定；这项能力受上述上游
公共 API 限制，必须明确披露，不能宣称已支持。普通 Task invokeTask 的历史能力
并未删除，但不授权伪装成 graph-local 取消/来源保真的适配器。

## 两包的职责与状态迁移

TypeScript 用 `checks/project.ts` 负责目录/拓扑和不可变执行上下文建立，
`checks/package.ts` 负责 manifest/成员前置，`checks/configuration.ts` 负责
TS/lint/Vitest/coverage，`checks/maintenance.ts` 负责环境、依赖和交付职责；
按实际代码量可在这些职责内继续拆分，不为每个叶强制建文件。
registry 显式组合；main/projectCheck 只绑定资源、metadata 和 root。

把 section/collect 改为每调用创建的局部收集器，scope/member/path/details
显式传递，删除共享“当前”变量和依靠末尾位置的 scoped-output 节点。
共享配置根因由显式配置职责节点处理：target 含配置路径和排序后的适用成员，
节点内部检查成员执行根并按既有根因规则归因，输出保留所有受影响成员；
不是 SDK 按相同 code 合并独立问题。成员特有失败仍保留各自节点。
不得因一个坏 manifest 使可检查的好成员和仓库文档分支消失。

convention 中 runtime/lock/importer/dependency/quality 等共享事实改为执行内
受控、不可变的读取结果/Promise；纯事实读取器不是 Checker，不能从 Checker
内部调用 registry 函数绕过身份与调度。业务 findings 归属明确的责任节点，
依赖组合显式加载事实，不能靠兄弟运行先后。pnpm/selection/peers 等前置
保持业务语义；不额外实现通用全父 join，也不包装整个旧 convention 为串行叶。

工具链将输入验证/请求分解、工具发现版本、配对管理、registry/nrm 分职责模块；
固定 Tool schema 使用已知工具枚举，实际 requested 在 root 输入验证。
工具事实/管理根/npm 来源缓存仅属于一次执行，读取接收内部 signal；
nrm 解析结果显式成为后续 registration 可验证的事实，不读取未初始化变量。
多工具前置使用局部事实组合，缺工具 finding 由明确 tool 节点报告一次；
不能将前置失败转成一份伪成功报告，也不按 code 去掉两个不同工具失败。
各叶 reporter 局部，所有 Host.run 使用节点执行 signal。

Files 共用缓存保留执行内语义，重复在途读取用同一路径 Promise 协调；
数量/字节预算在 await 之前预留并正确释放，异常和关闭均可观察。
保留目录/符号链接安全规则及原预算。已有 cloudflare 调用获得同一内部 signal
绑定的 Files 和本节点收集器，无专项实现修改。

## 验证与交接边界

G01–G14 的具体观察入口以 Implementation I-AC01–03 为准；先类型/协议，
后队列与端口，再两包/Builder 回归，最后完整质量门禁。
现有测试中历史 DFS 顺序断言可改为新稳定顺序，但发现集合、来源和剪枝
必须保留，不能删除不方便的失败断言。完整 check 之后才记录真实门禁成绩。

持久 fixture 使用现有 `TYPESCRIPT_CHECK_PERSIST_EVIDENCE=1` 路径能力；
验证 CAR 来自 `check.fixture.build.yaml`，明确不是生产 CAR。
两个生产 CAR、SDK 唯一 tarball及其 SHA256、验证 CAR和 fixture 的准确路径/CID
都在生成后交给监督会话，不填预期值、不远程上传或发布。
独立消费者安装同一份 tarball，真实 Engine 在途取消及 provenance 检查归 Outer；
实施代理仅提供其 Inner 测试与可复用候选，不勾选 D-*。
