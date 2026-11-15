# Checker 作者最佳实践

本文件是 [检查图 Idea](./Idea.md) 的文字性作者约定，与
[模型与术语](./Model.md)、[执行语义](./Execution.md) 配套。
以下接口是拟议设计，不代表当前 SDK 已导出 defineChecker 或实现新的 runCheck。
本次只记录最佳实践；将其自动化为“检查 Checker/Bundle 写法”的 Check 是未来方向，
不属于当前实施或验收要求。

## A01: SDK 提供定义工具，作者声明目标契约

defineChecker 由 Check SDK 提供，用于将 target schema 和 check 函数组合为
CheckerDefinition，推导检查参数类型并保留运行时校验所需契约。
Checker 仍指实际检测函数；CheckerDefinition 只是作者的定义包装，
不是 CheckItem、执行节点或 Task 实例。

定义工具不应在声明时执行检查、读取项目、启动子任务或持有本次执行的状态。
它不需要成为新的类层次、装饰器框架或隐藏的插件发现机制。
沿用 SDK 的 TypeBox 契约体系，避免在 schema 之外重复手写易漂移的 target 类型。
注册名与 children 的异构 target 对应关系在整个注册表组合时也要检查，
不能只保证每个函数自己参数正确，却容许返回不存在的注册名或错误的目标。

定义形态示意：

```ts
const packageEnginesChecker = defineChecker({
  target: PackageTargetSchema,
  check: checkPackageEngines,
});
```

`checkPackageEngines` 的逻辑签名仍是 `(target, signal) => Promise<CheckerResult>`；
schema 描述调用参数，而不是被检查文件的全部业务规则。

## A02: 用显式、静态的 object 组合注册表

```ts
const registry = {
  project: projectChecker,
  "package.manifest": packageManifestChecker,
  "package.engines": packageEnginesChecker,
  "vitest.coverage": vitestCoverageChecker,
};
```

注册表的 key 是 CheckerName，value 是 CheckerDefinition。
函数不需要在定义文件内重复声明注册名；相同定义可在不同组合中使用。
静态 object 的字面量键用于类型推导，不提前把它扩宽成丢失键和参数关联的
通用 Record<string, unknown>。

每个名字对应唯一绑定，一次执行期间固定。组合多个对象时不得通过 object spread
静默覆盖同名定义；组合工具若存在，应在覆盖发生前拒绝重复名。
同一对象字面量的重复键也应由类型/静态检查拒绝，不能指望执行器从最终对象
还原已被覆盖的定义。无需为此引入自动目录扫描或模块加载副作用。

注册表描述如何组合检查，不负责保存 visited、队列、当前问题或当前目标。
runCheck 指定其中一个普通注册名作为 root，Task input 作为根 target。

## A03: 按检测职责组织模块

推荐的作者结构示意：

```text
src/
  checks/
    project.ts
    package-manifest.ts
    package-engines.ts
    vitest-coverage.ts
  registry.ts
  contract.ts
  main.ts
```

单个 Checker 模块放自身目标契约、检测逻辑及紧密相关的辅助函数，
registry 负责显式组合，main 负责运行入口。共享读取器/纯解析器按现有项目惯例复用，
不要为每个 Checker 复制一份。

优先一项独立检测职责一个模块，但不强制每个小叶函数单独建文件。
紧密相关的几条小规则可以共处一个模块；避免为文件数量而拆分。
也不要让所有规则重新汇聚成一个带全局当前 scope 的大流程。
模块依赖应保持清晰，避免 Checker 为取得注册表类型而在运行时循环导入完整注册表。
具体类型组织在实施阶段解决，不用 any 或不安全断言绕过契约。

## A04: Checker 拥有契约，执行器统一验证

检查项的调度前路径为：

```text
解析 CheckerName
  → 验证 Target 属于允许的数据值域及该 Checker 的 schema
  → 取得受保护、稳定的目标值
  → 规范编码、去重、入队
  → 调用 Checker(target, signal)
```

验证与快照实现必须保证其间不存在值漂移：登记身份对应的值就是实际检查的值。
第一版只校验，不隐式补默认值、强制转换类型、丢弃字段或修改 target。
若未来引入显式规范化，它必须发生在身份编码之前，且执行、复用均使用同一规范值。

结构校验和业务解析不要混在一起：

- 参数缺少 directory、字段类型不对、目标含不可编码值：无效调用，执行故障。
- 读取 directory、解析其中的 package.json、核验 engines：Checker 的业务工作。
- 目标文件缺失或声明不合格：依据该 Checker 的既定规则产生问题。
- 意外 I/O、取消、未知协议、清理失败：保留执行故障，不用 broad catch 转成通过。

执行器集中验证并不取消 Checker 的契约所有权，也不是“Checker 自己无须知道
输入含义”。它只是避免每个函数重复实现同样的参数校验，或在校验之前就入表去重。
直接绕过 SDK 调用裸函数不应被误称为已经经过运行时验证。

## A05: 明确前置关系，通过返回 children 组合

Checker 判断自己的条件，通过后返回完整 CheckItem 数组：
每项同时指明 checker 名和 target；空数组表示叶节点。
不要为复用同一个对象而人为拆出多个 Target 类型。

对象包含关系不是自动的全局前置关系。例如 manifest 可解析后，
engines 和 Vitest 可以是独立分支，engines 失败不应阻断仍可检查的 Vitest。
普通后续检查通过 children 声明，不主动递归调用注册表中的 Checker，
以免绕过统一身份、去重、并发和取消机制。
需要多条件判断时可以复用普通读取/解析帮助函数或显式组合前置，
但不能隐藏重复的检查调度或以兄弟完成顺序作为依赖。

Checker 只返回本节点的问题，执行器负责整次 CheckExecution 的汇总。
共享子节点不把问题复制进每个父节点；跨节点的相同问题码不自动等同于同一问题。
问题说明保留可定位的目标范围，具体文档引用沿既有契约或明确的 Bundle 适配来源。

## A06: 定义可静态，执行状态必须隔离

schema、函数和注册组合可以是静态定义；队列、节点状态、问题数组和缓存属于
CheckExecution，局部计算属于本次 Checker 调用。
不能用模块级 mutable 变量保存“当前 package”“当前问题收集器”或上一次结果。
否则有界并发可能把不同节点的发现混在一起。

需要 Task 上下文、读取器或 Bundle 适配器时，由明确的执行期绑定取得
本次授权能力，不扩大受限上下文，不把 signal、连接或可执行对象塞进 Target。
同一次执行中影响检查语义的 policy/上下文固定，或显式放入 Target；
共享事实复用须遵守本次执行的身份假设，不形成跨执行隐藏缓存。

## A07: 贯穿取消并验证实际停止

Checker 显式接收 AbortSignal，在有界计算/外部操作边界响应取消，
向支持取消的 I/O、子 Task 适配器和长时间操作传递 signal。
不吞掉取消后继续工作，也不返回普通 problems 表示“取消失败”。
资源释放由各自所有者负责，执行器等待在途调用退出及清理。
只写一次 throwIfAborted 或只用 Promise.race，不等于证明运行中操作可停止。

针对性测试至少验证合法/非法输入、前置阻断、独立兄弟继续、共享节点只执行一次、
运行时取消传递及清理、节点状态隔离，并遵守现有类型/格式/lint/覆盖率门禁。
示例、schema 和实际函数保持一致，测试不能只核对声明里有没有 signal 字段。

## 未来：把最佳实践变成 Check

未来可以用独立 Checker 检查这些作者约定，但应先确定它能观察到什么证据：

- 源码结构检查需要作者源码及配置；编译后的 Bundle 可能合并模块，
  不能从单文件 worker 推断作者是否按职责分文件。
- schema/exports/Bundle 契约可做适用的静态校验；去重、并发隔离和取消清理
  通常需要行为证据，不能只匹配函数名、关键字或某个文件存在。
- 不为检查写法而执行不可信作者代码、安装配置插件或运行目标 scripts。
  未观察到证据不等于已符合，也不把不适用的规则直接报成违规。

该方向仅在本文记录，不新增包、规则、自动检测器、发布项或当前验收门禁。
后续确需实现时另行规划其检查对象、可观察范围和验收标准。
