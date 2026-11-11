# 需求与待确认设计

本文支持
[Idea](Idea.md)，直接说明本次要解决的问题，不要求读者拥有其他仓库的本机副本。已确认边界、历史语义和待确认建议分别列出；历史实现及本构想的验收均不等于批准具体 API。

## 问题与作者体验

通用 Task 负责执行一段受输入、结果和消息契约约束的代码；Check 在此基础上表达检查观察，帮助消费方理解被检查对象是否满足要求、发现了什么，以及如何查看相关证据或说明。领域 SDK 的价值是减少作者重复编写这类代码，而不是换个名字调用 runTask。

本次面向检查作者，完成以下连续流程：

1. 用 check-task-builder
   init 创建最小、可构建的 check 项目，示例使用 check-task-sdk。
2. 作者在 CLI 外编辑检查逻辑、输入契约及所需资源，不必理解通用运行时内部结构。
3. 用一次 check-task-builder build 完成领域转换与上游构建，交付标准 Task
   Bundle/CAR。
4. 外部 Task Engine 执行制品；消费方取得实际检查结果，并能读取打包后的资源。

只先完成一个有真实读取和判断的 check，不用常量结果或仅有文件生成替代闭环验证。

## 已确认的职责与边界

### check-task-sdk

- 基于 @silvermoon-work/task-sdk 组合检查领域公共能力，不能仅重导出或改名包装 runTask。
- 结果、finding、证据、检查上下文与公共辅助能力是候选抽象；选哪些以及具体形状仍需确认。
- 不依赖 builder，任务运行时不携带构建工具。
- 不复制 Worker、IPC、ACK、取消生命周期或资源传输；这些继续使用上游运行时。

### check-task-builder

- 核心转换是“check 项目文件树 → 标准 task
  builder 输入文件树”，随后组合上游完成构建。
- 编译、SDK binding、Bundle 校验和 CAR 编码复用上游，不重造第二个 task builder。
- 不要求作者手动先转换再调用上游命令；中间树不必落盘，可使用上游 ReadonlyFileTree。
- 领域目录、契约生成、定义与资源映射需要一致，避免让作者重复维护同一业务声明。
- CLI 名称确定为 check-task-builder；init/build 必须支持。首版仅提供这两个命令是建议，car 是否加入尚未确认。若不加入，独立重新打 CAR 使用 task-builder
  car；若加入，只代理上游。

两包按 OKR Agent 的 @silvermoon-work scope 约定命名，不沿用 @potential-guide
scope；具体版本和最终发布配置另行确认。

## 历史材料中值得保留的语义

以下是阅读旧实现和 supporting
documents 后提炼的设计参考，不是对旧字段或目录的兼容承诺：

- **检查事实与执行状态分开。**
  旧实现以问题列表表达不满足的要求，执行异常和取消直接传播，不伪造为业务问题。本次建议正常不通过仍是正常检查结果，执行故障才是任务失败；该建议及其具体数据契约仍需明确确认。
- **作者观察与公共装配分开。**
  旧检查函数只返回观察，公共适配器负责结果、问题码校验和说明引用。新 SDK 应讨论如何保留这种减少重复代码的价值，不必沿用 pass/problems、target/code/actual 命名。
- **业务声明同源。**
  旧语言和问题码声明同时用于类型、运行时允许值、结果 Schema 和文档覆盖。新设计应避免这些描述彼此漂移；是否保留语言、问题码以及生成方式仍需确认。
- **说明不改变事实。** 旧结果及各问题可独立携带逐语言、不可变 Bundle
  URI，不在运行时读取 Markdown 后再决定检查结果，也不因读者获取文档失败而改写事实。文档是否必需、是否支持语言回退、frontmatter、索引和 URI 形状均未定案。
- **资源属于实际制品。**
  旧实现使用已验证的执行 Bundle 身份，避免作者输入冒充身份；文本与二进制采用明确的字节处理规则，缺失或错误资源显式失败。新包应证明最终制品的资源可用，而非仅证明源目录或中间文件存在。
- **所有权留在正确层。**
  检查代码释放自身打开的文件、进程或连接，故障不能被成功形状掩盖。通用取消与子任务生命周期由 Task
  Engine/SDK 管理；Probe 的阶段、覆盖与编排不迁入本次能力。

## 上游组合必须验证的事实

- runTask 接收任务回调；TaskContext 已提供 signal、bundle.cid、bundle.read 等能力，领域层无需复制其执行协议。
- buildTaskBundle(tree,
  options) 返回 ReadonlyFileTree。树列举直接子项，每次读取应提供相同版本字节的新流，逻辑路径统一使用
  `/`。依赖必须位于输入树中，不能隐式回退到构建工具自身的 node_modules。
- 输出资源采用惰性读取；返回一棵树不代表资源字节已经全部验证。交付前必须完整消费并通过上游制品校验。
- 上游按解析后的 SDK 包身份识别 binding；source.sdk 同时影响 callback 包装入口。不能只把 source.sdk 改为领域 SDK 就假定兼容，必须验证组合 SDK 的真实依赖解析和 binding。
- 上游 CLI
  runner 没有任意输入树注入口，不能假设可直接传入转换树。应在实际公开能力边界内选择组合路径，而非复制编译和打包实现。
- TS/JS
  contract 的求值是受信任代码执行，不是安全沙箱。上游 init/build/car 的存在不意味着新 CLI 的参数、输出、错误和覆盖规则已获确认。

## 验收与不做事项

- 从 init 项目开始，在 CLI 外修改源和资源，再以一次 build 交付标准 Bundle/CAR。
- 外部 Task
  Engine 实际验证检查通过、不通过和执行故障，并验证打包资源可读；记录准确的依赖来源与制品身份，不能只做 SDK 单元测试或假执行。
- 使用项目现有工具链并通过 pnpm
  check；SDK 不依赖 builder，构建工具不进入任务运行时。
- 不迁入整个 Potential Guide，不扩展 objective
  SDK/builder、调度、监管、服务端或 Web UI。
- 不修改或删除旧讨论，不自动发布 npm、推送 release tag 或弃用旧包。

## 来源与依赖风险

保留来源以供需要时追溯，但正文需求不依赖读者逐个打开历史链接：

- Potential Guide：shazhou-ww/potential-guide，参考提交
  `b1e3fa7806de0f8655ca164b68bc2145704cb1fe`。阅读材料包括 check-sdk 的作者、结果和回调说明，check-environment、check-runtime-files、probe-sdk，以及历史 Idea 的 Check-alignment 与 task-composition 讨论。只吸收上述语义，不继承其包结构、旧审批或整个需求集合。
- 通用引擎：[silvermoon-work/task-engine](https://github.com/silvermoon-work/task-engine)，参考 task-sdk、task-builder、task-builder-cli 的实际 API。2026-11-11 已核实 Windows
  Node 22.13 文件身份修复 `cc99c27a12a5189ea41327edc51bb770de054179`
  在 main，且该提交 CI 成功。当时 registry 的 Builder/CLI canary 均为
  `0.1.0-canary-261111-1`，对应 tag 指向修复前的
  `bdfbdbbb5286be34844039abd0658bf4c1c1b904`。实施时需重新核实发布状态；若仍未发布，明确记录精确源码/本地 tarball 验证的限制，不把 main 修复、打包验证和 registry 安装验证混为一谈，也不因此自行发布上游。

## 实施前仍需确认

收敛最小真实 check 所需的领域模型与作者 API、目录/契约/资源规则，以及 CLI 的参数、默认值、stdout/stderr、退出码、覆盖、取消和部分交付行为。构想验收后逐步完成这些必要决定并实施，不为尚无需求的未来能力无限扩展讨论。
