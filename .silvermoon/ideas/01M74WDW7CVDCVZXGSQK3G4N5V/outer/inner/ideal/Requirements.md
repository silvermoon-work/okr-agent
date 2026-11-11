# 需求与讨论结论

本文支持
[Idea](Idea.md)，直接说明本次要解决的问题，不要求读者拥有其他仓库的本机副本。2026-11-11 的讨论已收敛如下方向；本文记录不等于 Silvermoon 构想验收，也不代表代码已实现。类型签名和路径示例用于描述讨论结果，不是已经发布的 API。

## 当前推进边界

此前用户要求等待上游 IPFS 文件包/Space 支持；2026-11-11 用户通知最新 canary 已支持，并已核实相关包发布，外部等待前提解除。接下来继续本 Idea 的必要确认与生命周期验收，不是自动进入实现。不记录 acceptIdeal，不把上游发布或单项讨论同意当作整个构想或实现的验收。不复制 Space 实现或编写替代运行时。

## 问题与作者体验

通用 Task 负责执行受输入、结果和消息契约约束的代码；Check 在此基础上表达是否通过、有哪些具体问题，以及参考标准在哪里。SDK 的价值是减少作者重复编写结果装配和文档映射代码，不是换个名字调用 runTask。

1. check-task-builder init 创建使用 check-task-sdk 的最小可构建项目。
2. 作者在 CLI 外编辑检查逻辑、输入契约及参考标准文档。
3. 一次 check-task-builder build 完成领域转换与上游构建，交付标准 Task
   Bundle/CAR。
4. 外部 Task
   Engine 执行制品，得到业务 JSON 与配套输出文件包；消费方读取问题及参考标准。

先完成一个有真实读取和判断的 check，不用常量结果或仅生成文件替代闭环验证。

## 两包职责与命令边界

- check-task-sdk 基于 @silvermoon-work/task-sdk 组合公共检查能力，不依赖 builder，不把构建工具带入任务运行时。
- check-task-builder 的核心是“check 项目文件树 → 标准 task
  builder 输入文件树”，随后组合上游完成全链路构建。中间树不必落盘，可使用上游 ReadonlyFileTree。
- 编译、SDK
  binding、Bundle 校验和 CAR 编码复用上游；Worker、IPC、ACK、取消生命周期和资源传输也留在上游，不重造第二套工具或运行时。
- CLI 名称为 check-task-builder，首版提供 init/build，不提供 car 子命令。项目的 pnpm
  car 直接调用 task-builder
  car，并显式声明所需上游 CLI 开发依赖，不依赖传递依赖碰巧暴露命令。
- build 是全链路入口，默认交付 Bundle/CAR，不要求作者先转换再手动调用上游。内部可以组合上游库 API，不强制使用 CLI 子进程。
- 两包按 @silvermoon-work scope 约定命名；具体版本和最终发布配置另行确认。

### 中间树与交付

已确认：转换类似文件处理管线，内部通过 ReadonlyFileTree 将标准 Task 输入树交给上游，中间树默认不落盘、不写 dist，不要求整个项目常驻内存。源文件和资源可按需读取，转换层持有生成内容。dist 只保留最终 Task
Bundle 目录及同级 CAR；--no-car 只交付目录。内部临时暂存不作为保留交付物。

### CLI 对称性与错误协议

已确认通用部分对照选定 task-builder 版本保持对称，只增加领域所需差异：

```text
check-task-builder init <directory> [--package-name <name>] [--task-name <name>]
check-task-builder build [build-file] [--out-dir <directory>] [--no-car]
```

使用上游 --task-name，不另设 --check-name。默认配置为 check.build.yaml；CLI 路径相对 cwd，配置内路径相对配置所在目录；输出优先级为 --out-dir、outDirectory、配置目录下 dist。init 按上游规则从最终包名推导 dist 子目录及 CAR 名称；目标必须不存在且父目录存在，不覆盖、不安装依赖，不静默改写非法包名。

成功与失败均向 stdout 输出一条换行结束的 JSON：成功为
`{ "ok": true, "data": ... }`，失败为
`{ "ok": false, "error": { "code": "...", "message": "..." } }`。领域配置、契约与文档错误使用相同信封；stderr 用于诊断。帮助和版本在 stdout 输出文本；无参数显示帮助，不隐式构建。退出码成功为 0、一般失败为 1；确认取消且清理完成采用上游 130/143，交付或清理不确定时不能冒充已确认取消。

重复 build 不自动 clean：先校验，再替换本次产物，保留未选中的旧文件。部分交付如实报告已验证部分，不宣称整体成功或已经回滚。--no-car 不删除或更新旧 CAR，本次输出不得将旧 CAR 当作新交付。构建命令失败与运行时正常 pass:false 分开。

## 检查结果与问题

### 业务结果与执行状态

已确认：检查通过和检查不通过都是正常 Task 结果；不能可靠完成检查属于执行故障，不能制造问题或返回正常不通过。取消沿用上游语义。“文件不存在”等情况按检查目的判断，不能仅按异常类型分类。

每个问题只包含以下领域信息：

- code：稳定的问题类别。
- brief：本次具体问题的描述，可自然包含对象、位置、实际值与要求等。
- documentation：详细参考标准文档的位置，由框架定位和装配。

不增加 evidence、finding、observation 等公共领域概念；不保留 target/actual 字段，因为不同 check 的对象无法统一编码。作者用 brief 描述具体问题，SDK 不解析其中的自然语言。

当前讨论的结果形状如下；documentation 在输出包方案中表示相对包根的路径：

```ts
export interface CheckProblem<Code extends string = string> {
  readonly code: Code;
  readonly brief: string;
  readonly documentation: string;
}

export type CheckResult<Code extends string = string> =
  | {
      readonly pass: true;
      readonly documentation: string;
    }
  | {
      readonly pass: false;
      readonly documentation: string;
      readonly problems: readonly [CheckProblem<Code>, ...CheckProblem<Code>[]];
    };
```

不通过必须有问题，通过不携带 problems。当前草案保留检查整体的参考文档，包括通过时的文档；不只提供问题文档。

### 参考文档不做多语言机制

文档主要面向 AI
agent，作者使用英语或自己使用的语言写一份即可。documentation 不再是语言映射，不声明 languages，不要求按语言组织目录，不做翻译覆盖校验或语言回退。若未来确有语言与模型不兼容，应评估整个 check 的 i18n，而非现在只为参考文档预建国际化体系；这不进入首版。

## 作者回调与受限上下文

作者回调不返回问题数组或最终结果，而是通过报告器给出 code 和 brief：

```ts
export type ProblemReporter<Code extends string> = (
  code: Code,
  brief: string,
) => void;

export type CheckCallback<Input, Code extends string> = (
  input: Input,
  context: CheckContext,
  reportProblem: ProblemReporter<Code>,
) => Promise<void>;
```

CheckContext 是显式组合的领域接口，不是完整 TaskContext。已确认能力边界：

- 作者可使用输入、取消信号、日志、进度及自身 Bundle 的只读资源。
- 开放上游 space(cid) 的只读文件包访问和 invokeTask 子任务调用，不因隐藏 output 而禁止这两项通用能力。上游继续负责访问授权、超时、取消与回收，SDK 不另造一套生命周期。子任务正常结果由检查作者解释，执行故障默认传播，不自动转换成 problem。
- SDK 显式挑选允许的能力，并在运行时创建不含 output 的新对象。不直接继承完整 TaskContext，也不只做类型上的 Omit；上游新增能力不能自动泄漏进 CheckContext。
- 作者不能直接操控 output space，结果装配及参考文档输出由框架负责。
- 首版禁用业务消息，取消仍走上游生命周期，不属于业务消息。
- 这是 API 职责约束，不是安全沙箱。不为尚未出现的附件需求提前开放整个 output。

框架收集问题，回调正常 resolve 后根据列表是否为空生成 pass。若回调抛错或 reject，即使已经报告过问题，也不能装配成正常检查结果。取消继续使用上游语义。

报告器同步收集，不做文件 I/O；问题码来自作者 TypeBox 契约，文档映射由框架生成。Builder 提前验证问题码对应文档，运行时拒绝未声明的问题码；回调结束后关闭报告器，迟到调用不得修改结果。具体错误与生命周期处理需实施验证，不作为已经验证的保证。

## 契约和参考文档的唯一来源

用户已确认用 TypeBox 定义输入，SDK 组合生成统一结果 Schema，通过 Static 推导 TypeScript 类型，不重复手写输入结构。2026-11-11 进一步确认：问题码也由作者 TypeBox 契约中的有限字符串字面量集合定义，取代此前 YAML
problemCodes 方案。示例签名尚非已实现 API：

```ts
export const ProblemCode = Type.Union([
  Type.Literal("node-version"),
  Type.Literal("node-unavailable"),
]);

export type ProblemCode = Static<typeof ProblemCode>;

export default createCheckContract(Input, ProblemCode);
```

同一集合用于编辑器问题码补全、Builder 文档覆盖检查和运行时校验。不接受无法枚举的任意字符串 Schema 来定义问题码。YAML 不再声明 problemCodes，也不从文档文件名反向定义问题码。不生成落盘类型文件；此前 .check/generated 提议的误点同意已由用户撤回，后续选择 TypeBox 源定义，不引入编辑器只能看到构建虚拟模块的问题。

已确认参考目录约定：

- references/check.md：检查整体标准。
- references/problems/<code>.md：对应声明的问题标准。
- 声明的问题码缺少文档、或问题文档没有对应声明时明确失败。
- 参考文档为普通 Markdown，不强制 title/description
  frontmatter；必需文档须存在、文本有效且非空。不自动评判标准内容，不校验所有 Markdown 链接。
- 完整收录 references 目录，保留附属说明和图片等资源及相对路径；附属资源不作为问题码，不逐个手写资源清单。

类型、契约和文档覆盖同源，但不把问题码名称改成运行时任意文本。契约模块求值沿用上游受信任代码机制，不宣称安全沙箱。

## JSON 与输出文件包的组合方案

讨论方向是：业务 JSON 保持简单，配套 IPFS 输出文件包提供参考标准文档。消费者用 Run 的 outputCid 和 documentation 路径读取文件。outputCid 由 Engine 完成输出定稿后附加，不放进业务 JSON，也不由 check 作者伪造。

示例业务结果：

```json
{
  "pass": false,
  "documentation": "references/check.md",
  "problems": [
    {
      "code": "node-version",
      "brief": "当前 Node.js 为 20.0.0，要求至少 22.13.0。",
      "documentation": "references/problems/node-version.md"
    }
  ]
}
```

该示例需要输出包中真实存在对应路径；输入参考目录已确认如上，最终 Bundle/输出映射的具体实现及构建描述语法由实现阶段细化。标准文档通常是静态内容，可由 builder 收入 Check
Bundle，再由 SDK 利用上游 Space
link 能力放入输出包，不要求每次读取再复制 Markdown。SDK 负责定位文档、链接输出和装配结果；Engine 负责输出定稿及 outputCid。

文档链接或输出定稿失败属于执行故障，不能返回声称成功但文档不可用的结果。消费者后续获取文档失败不能改写已经记录的检查事实。暂不要求输出包另存 result.json；仅在需要文件包独立携带完整结果时再讨论。上游已提供所需 Space 能力，但上述 Check 组合方案仍须实现和端到端验证。

## 上游组合与实施前提

2026-11-11 初次读取 task-engine 的 ipfs-task-context-discussion 工作分支，随后在用户通知发布后核实：以下六包的 canary 均为
`0.1.0-canary-261111-2`，对应 release tag 均指向
`13e3b9901b8e49eca6c457dc71b7fffbf1432ffe`：

- @silvermoon-work/task-protocol
- @silvermoon-work/task-sdk
- @silvermoon-work/task-engine
- @silvermoon-work/task-builder
- @silvermoon-work/task-builder-cli
- @silvermoon-work/task-engine-cli

版本由当前设备配置的 registry 查询，对应 GitHub tag、成功发布工作流与
[精确提交 CI](https://github.com/silvermoon-work/task-engine/actions/runs/42994187062)
交叉核对。该提交的发布工作流均成功，
[发布记录示例](https://github.com/silvermoon-work/task-engine/actions/runs/42995773432)
可按同一提交追溯；版本可查询不等于本仓库已安装或消费验证通过。后续消费以精确版本为基线，不跟随 canary 标签漂移；这不是本项目自身版本或发布配置的决定。

核对该发布提交的 SDK 说明，Space 是以下破坏性接口变更：

- context.bundle 为不可变 ReadonlySpace，读取改用 root.resolve(...).read()。
- context.output 为 ReadWriteSpace，提供 write、link、getCid；Engine 在正常完成前等待输出操作并定稿，将 outputCid 附加到 Run
  outcome。
- 旧 context.bundle.read 已移除；本 Idea 不再把旧接口写成目标 API。
- 静态 Space 具有不可变 CID，运行中 output
  Space 则使用运行身份；getCid 是当前快照，不等于最终完成的输出包身份。

上游发布前提已满足；实现时仍须用实际安装的精确版本验证接口及完整消费闭环，不能把源码、合并、发布和消费成功混为一谈。旧 Bundle 必须重建，上游宿主以 spaceProtocol:1 握手拒绝旧 SDK
wrapper。本次只更新前提并恢复必要确认，不授权跳过构想验收或发布任何包。

另外仍需遵守上游构建边界：

- buildTaskBundle(tree,
  options) 使用可重复读取的 ReadonlyFileTree，逻辑路径统一使用
  `/`；输入树必须包含依赖，不能回退到工具自身 node_modules。
- 输出资源为惰性流，返回树不等于字节已验证，交付前必须完整消费并通过上游校验。
- 验证组合 SDK 的真实依赖解析及 binding，不能只改 source.sdk 就声称兼容。
- 上游 CLI
  runner 不提供任意转换树注入口，选择实际公开能力内的组合路径，不复制编译器。
- TS/JS contract 的求值是受信任代码执行，不是安全沙箱。

## 验收、不做事项与来源

后续验收覆盖 init → 外部编辑 → 一次 build
→ 外部 Engine 实际执行，验证通过、不通过、执行故障以及输出包的参考文档可读，并运行 pnpm
check。实际依赖来源、制品身份及进程/资源回收需要有证据，不以假执行或仅 SDK 单测代替。

不迁入整个 Potential Guide，不扩展 objective
SDK/builder、调度、监管、服务端或 Web
UI；不修改或删除旧讨论，不自动发布 npm、推送 release tag 或弃用旧包。

历史来源为 shazhou-ww/potential-guide，参考提交 b1e3fa7806de0f8655ca164b68bc2145704cb1fe 的 check-sdk、check-environment、check-runtime-files、probe-sdk，以及 Check-alignment 与 task-composition 讨论。保留业务装配、文档标准和通用执行分责的价值，不继承旧多语言、target/actual、作者观察模型、包结构或旧审批。

上游来源为
[silvermoon-work/task-engine](https://github.com/silvermoon-work/task-engine)。Windows
Node
22.13 文件身份修复位于 cc99c27a12a5189ea41327edc51bb770de054179；新发布提交 13e3b9901b8e49eca6c457dc71b7fffbf1432ffe 是其后继（GitHub
compare 显示 ahead 7、behind 0），因此上述 Builder/CLI
canary 已包含修复。此前 0.1.0-canary-261111-1 不含修复的限制不再适用于本次选定版本；Windows 实际消费仍须验证。

## 仍需细化

核心方向及作者边界已收敛。CheckContext 和契约构造器的精确签名、TypeBox 支持形状的验证、路径约束和公开 API 内的内部组合方式，按现有结论与上游惯例细化，不再逐项请求确认。只有影响既定行为、增加产品范围或无法满足约定时才重新提请讨论。用户允许自行收敛这些细节，不等于整个构想获验收；仍须完成当前构想版本的明确验收后进入实现，不自动发布。
