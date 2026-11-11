# Implementation

构想 revision
36a7d1745406 已按用户明确要求进入实施。用户授权一个 subagent 实现，由主 Agent 负责集成、实现与部署门限决策，完成 canary 发布和 office-ubuntu 安装后 smoke
test，不再逐项询问明确的实现选择。这项授权不允许将未验证结果勾选为通过，也不授权修改历史文档或发布上游。用户另行明确：本项目发布 0.1.0-canary 系列，npm
dist-tag 使用 canary，不更新 latest。

上游依赖改用已发布的正式版 0.1.0，替代准备阶段的 canary 基线；本机已核实 SDK、Builder、Builder
CLI、Engine
CLI 的 latest 均为 0.1.0。实际安装、构建和执行仍须验证，不以版本可查询替代消费证明。

## Steps

### I-S01: 确认最小领域与作者契约

结合[需求与讨论结论](ideal/Requirements.md)，细化 code/brief/documentation、reportProblem 回调、受限 CheckContext 与 JSON/输出文档包的组合方式，不重新引入 evidence/observation、target/actual 或多语言机制。首版已确定仅 init/build，项目 pnpm
car 使用上游命令。问题码已改为作者 TypeBox 字符串字面量集合的唯一来源，不在 YAML 声明，也不生成落盘类型文件。CheckContext 开放只读 space 和上游子任务调用，不开放 output；契约与 CLI 交付协议按 supporting
document 已确认规则细化，不再逐项询问明确的内部选择。包名按仓库约定提出
`@silvermoon-work/check-task-sdk`、`@silvermoon-work/check-task-builder`，版本和最终发布配置另行确认，不沿用旧 scope。

### I-S02: 实现组合式 SDK 与一次构建工具

在 packages 下实现两个职责包，SDK 不依赖 builder，构建工具不进入任务运行时。Builder 将领域树转换成上游可消费树并组合构建，中间树默认不落盘、不进入 dist；dist 只放最终 Bundle/CAR，不引入 .check/generated 作者类型目录。验证嵌套依赖的真实 task-sdk
binding，不用替换 source.sdk 规避。复用上游能力，不重写编译器、Worker、IPC、ACK、取消生命周期或资源传输。初始化最小真实 check，完成编辑到 Bundle/CAR 的单命令闭环。

### I-S03: 验证并记录可复现交付

增加与新行为直接相关的测试及作者文档，运行 pnpm check。以正式版 0.1.0 外部 Task
Engine 执行构建结果，保留输入、实际结果、输出参考文档读取、依赖版本与回收证据。验证两个 npm
tarball 的入口与声明，发布映射按包独立配置；SDK 先发布，依赖它的 Builder 后发布，不能自动顺带发布其他工作区。

## Acceptance criteria

### I-AC01: 公共领域能力与依赖边界有效

SDK 的实际作者代码与聚焦测试证明公共能力减少重复检查代码，且与生成契约一致；依赖清单及构建验证证明 SDK 不依赖 builder、不复制运行时，binding 使用上游真实路径。

### I-AC02: 作者流程与制品真实可用

从 init 项目在 CLI 外修改源和资源，再以一次 build 产出标准 Bundle/CAR；外部 Engine 验证通过、不通过、执行故障三条路径，以及结果中的参考文档路径可从 Run 的 outputCid 对应文件包读取。测试同时覆盖受限 Context、问题报告、输出失败传播及确认后的 CLI 参数、输出与错误协议，不能只证明内存树已返回。

### I-AC03: 仓库质量与交付说明完整

pnpm
check 成功；作者文档可复现初始化、安装前提、编辑、构建和执行，证据分别注明本地源码、打包依赖与 registry 来源及版本。发布映射和 canary 标签规则测试通过，实际发布留在部署阶段执行；不执行旧包 deprecation 或任何上游发布。

实现与验证结果见 [Verification](Verification.md)，部署消费验证另见外层契约。
