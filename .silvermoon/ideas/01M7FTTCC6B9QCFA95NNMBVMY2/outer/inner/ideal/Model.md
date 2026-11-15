# 检查项、身份与执行绑定

本文件是 [Idea](./Idea.md) 的设计依据，记录本次已达成的概念和约束。
代码片段为签名草图，不是已发布 API，也不预先固定实现文件或泛型技巧。

## 术语

| 名称 | 含义与边界 |
| --- | --- |
| Checker | 检测函数，接收目标及 AbortSignal，完成本节点判断并返回 CheckerResult。 |
| CheckerName | 注册表内唯一的函数注册名，受命名规范约束的字符串，不强制 space/name 两层。 |
| CheckerDefinition | target schema 与 Checker 函数的作者定义包装，由 SDK 的 defineChecker 辅助定义，不包含执行状态。 |
| CheckerRegistry | CheckerName 到 CheckerDefinition 的显式绑定；一次执行内不可重绑。 |
| Target | 某个 Checker 接收的可序列化目标描述值，不要求 type 字段；不是函数或执行状态。 |
| CheckItem | `{ checker: CheckerName, target: Target }`，表示一项检查，不包含运行状态。 |
| CheckerResult | 单节点结果：通过并返回 children，或不通过并返回非空 problems。 |
| CheckExecution | 从一个根 CheckItem 开始的一次完整检查图遍历和结果收集。 |
| CheckReport | 完整遍历的汇总报告，不等于根 CheckerResult；取消/故障不冒充正常完成。 |
| CheckNodeRecord | 执行器内部的节点记录，含 CheckItem、规范键、状态、结果及图关系，不是第二套公开作者模型。 |
| Check Bundle | 实现检查能力的 Task Bundle，其不可变内容由 CID 标识。 |
| Task / Run | 沿用 Task Engine 的实例含义，不用含糊的“Check Task”同时指 Bundle、Task 和 Run。 |

数学上的图节点由 CheckItem 的等价类确定；运行记录属于具体 CheckExecution。
A、B 各自返回相同 CheckItem C 时，保留 A→C、B→C 两条边，只建立一个 C 的
运行记录；下一次执行重新建立记录，不复用上次状态。

## 核心组合模型

```ts
type Checker<Target> = (
  target: Target,
  signal: AbortSignal,
) => Promise<CheckerResult>;

type CheckerResult =
  | { pass: true; children: readonly CheckItem[] }
  | { pass: false; problems: readonly [Problem, ...Problem[]] };
```

`children` 是后续检查项，不只是被发现的对象。相同对象可以接受不同 Checker，
无需把对象类型拆成 engines-package、scripts-package 等人为类别。
每个 CheckItem 的注册名必须与对应 target 参数类型匹配；不能用宽泛 object
或不安全类型断言掩盖这种关联。运行时也验证注册名、target 和返回值。

通过表示本节点的条件成立，可以展开其 children；空 children 为叶节点。
不通过只报告本节点问题，不展开该节点的新 children，不意味着全图立刻结束。
每个节点的问题只收集一次，不递归并入各个父节点。

图的边表示“当前节点成功后可发现/执行下一项”，不是对象归属，也不是
“子节点必须等待所有入边的父节点成功”。确实要求 A、B 都成立的检查，
需要显式的组合前置设计，不能从入度猜测；本轮不增加通用 join 调度器。
父节点失败不能阻止同一项从另一条有效路径被发现。

## 作者定义和工程组织

采用[作者最佳实践](./Authoring.md)：Check SDK 提供 defineChecker，作者把
target schema 与检测函数放在一起；静态 object 注册表组合各定义，按职责组织
Checker 模块，不强制一个叶函数一个文件。注册名只需在注册表中绑定，
定义不通过副作用自动注册，静态定义不持有本次执行状态。

target 契约属于各 Checker，但运行时结构/值域校验由执行器在规范身份登记前
统一完成；第一版不隐式转换或修改输入。目标文件读取和业务解析仍由 Checker
负责。defineChecker 的泛型推导与运行时验证须配合，不能把编译期类型视为验证。
把这些最佳实践自动化为检查作者/Bundle 写法的 Check 是未来方向，当前只写文档，
不属于此 Idea 必须实现的新检测规则。

## 注册名和节点身份

注册名是符合统一规范的字符串，不强制命名空间层数；精确语法和长度限制在
实施阶段依据已有接口确定并测试。重复注册明确失败，未知名不算通过。
信任边界由调用方提供的注册表决定，不执行目标项目自行指定的任意代码/CID。

在固定注册表的一次执行中：

```text
nodeKey = canonicalEncode([checkerName, target])
S(a) = S(b) ⇔ a ≡ b
```

这里 `≡` 是已定义 Target 值域上的结构值相等，不是 JavaScript 引用相等：
对象属性顺序不影响身份，数组顺序影响身份。分别创建的相等值是同一目标。
Signal、排队/执行状态、Task ID 和 Run ID 不参与身份。

Target 使用有限 JSON 数据树，第一版保持目标描述为对象，内部允许 JSON 值。
必须明确数字和字符串的相等/编码规则，拒绝 undefined、函数、symbol、bigint、
非有限数字、循环数据，以及依赖 getter/toJSON 等可执行或隐式转换的目标表示。
不能悄悄丢字段、把非法值变 null 或用普通 JSON.stringify 的属性插入顺序当身份。
数字如 -0 与 0 是否同值、Unicode 字符串是否规范化，必须在实现前固定；
不留运行时猜测，不自行合并不同路径大小写或不同语义的数组。

统一编码负责对既定值相等关系的确定表示，不负责推断业务对象相等。
不同路径拼写指向同一文件，并不自动成为相同 Target；如领域需要这种等价，
须显式规范化后形成 Target。规范化不能读取时间或可变环境来悄悄改写身份。

检查项在登记时获得受保护的值快照/不可变表示，Checker 和作者对原对象的
后续修改不能使“索引中的身份”与“实际检查的目标”分离。
实现可直接使用规范字符串作 Map 键，无需逐项扫描访问表；若使用固定长度
摘要索引，仍要有碰撞判等保障，不把摘要相同当作数学上的充分必要条件。
规范编码读取目标本身的开销仍与数据大小相关，不宣称整体 O(1)。

一个 CID 用两个不同 CheckerName 注册时，按本模型是两个节点身份；
第一版不自动做别名合并，也不比较函数源码或函数引用以推断等价。

## 本次执行内复用的工程假设

固定执行上下文、授权范围、政策及函数绑定，接受：

> 同一 CheckItem 在一次 CheckExecution 内只检查一次，所有后续访问复用
> 首次得到的 CheckerResult，包括 problems 或 children；不重新观察外界。

这不是外部世界不变或 Checker 纯函数的断言。文件、网络和时间可能变化，
本模型有意忽略执行期间这些变化对重复访问的影响。会改变检查语义的政策参数
必须进入 Target 或在整个执行范围固定，不能藏在每次不同的闭包中误复用。
跨 CheckExecution 重新检查，不提供内容缓存失效、CPS 或持久化断点恢复。

## runCheck 与根项

```ts
runCheck(contract, {
  registry,
  root: "typescript-project",
});
```

此草图保留 Task 契约及输出集成；Task 的 input 是根 target。SDK 每次构造
`{ checker: root, target: input }` 并创建独立的执行范围。
root 是注册表普通名字，不要求 `$root` 保留名或特殊目标类型。
静态类型和运行时校验都保证 root 存在，contract input 符合根 Checker 的 target。

独立图执行层接收 `registry + rootItem + signal`，不启动 Worker；
runCheck/createCheckCallback 负责 Task 的输入、上下文、文档和最终输出集成。
若需绑定当前 Run 的能力，注册表可以按执行上下文创建，不泄漏前一次执行状态。
保留受限上下文，不因此向作者开放完整 TaskContext 或任意 output 写权限。
旧签名的过渡方式、公开 CheckResult 到 CheckReport 的类型命名兼容，在实施阶段
明确迁移；不能仅更名而声称旧协议已具有 children、来源定位或图执行能力。

## Check Bundle 适配

```text
注册名 → 本地 Checker           Bundle CID → 对应 Task 实现
Target                         input
CheckerResult / CheckReport     明确声明的 Check 业务结果
```

提供统一适配入口，例如 `checkerFromBundle(bundleRef, context)`；
调用方提供准确 CID 或已有不可变 Bundle 引用，适配器通过现有 Task 调用能力
形成 Checker，不强制函数运行位置、不引入 CPS、不替换 Task Engine。

适配只接受明确的 Check 契约，不解释任意 Task 的 JSON 为检查结果。
输入、输出、取消和故障需验证并传播；CID/引用不是执行权限。
子问题码和文档必须保留所属 Bundle/实际 output 来源，不能凭父问题码
拼接子文档或将子失败伪装成父契约中不存在的声明。

当前 SDK 的公开 Check 业务结果不含 children，且 invokeTask 返回业务 JSON，
不等于自动提供子 Run 完整 output 引用。实施时先核对实际公共能力：
完整子 CheckReport 可以作为局部叶结果适配；如果希望跨 Bundle 返回 children，
必须明确区分单节点结果和完整执行报告，并定义检查名解析/绑定规则，不能把
子 Bundle 的局部注册名直接当作父注册表名字。不同版本须显式兼容或拒绝。
外层已完成的子图不得再次自动展开执行。

这些协议边界必须在 I-S01 固定并验证后才实现适配器；需要上游 API 变更时
明确记录必要能力和阻塞，不静默丢问题、不编造 output CID、不退回任意结果合并。
