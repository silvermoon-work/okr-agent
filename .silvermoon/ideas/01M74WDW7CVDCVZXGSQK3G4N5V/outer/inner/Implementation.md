# Implementation

本文件是准备阶段的轻量实施种子，不是已批准的 API 或实施证据。构想方向获验收后细化；实施前确认领域数据/API 与 CLI 交互，不把旧实现当作新契约。

上游 IPFS 文件包/Space 支持已核实发布于相关包的 0.1.0-canary-261111-2，此前外部等待前提解除。当前仍处 preparing，须先完成构想验收，不自动开始实施。依赖基线、发布证据与破坏性接口变化见 supporting
document，实际消费需另行验证。

## Steps

### I-S01: 确认最小领域与作者契约

结合[需求与讨论结论](ideal/Requirements.md)，细化 code/brief/documentation、reportProblem 回调、受限 CheckContext 与 JSON/输出文档包的组合方式，不重新引入 evidence/observation、target/actual 或多语言机制。首版已确定仅 init/build，项目 pnpm
car 使用上游命令。基于已发布 Space 确认目录、契约生成与 CLI 参数、输出、错误和安全行为。包名按仓库约定提出
`@silvermoon-work/check-task-sdk`、`@silvermoon-work/check-task-builder`，版本和最终发布配置另行确认，不沿用旧 scope。

### I-S02: 实现组合式 SDK 与一次构建工具

在 packages 下实现两个职责包，SDK 不依赖 builder，构建工具不进入任务运行时。Builder 将领域树转换成上游可消费树并组合构建，不强制中间树落盘。验证嵌套依赖的真实 task-sdk
binding，不用替换 source.sdk 规避。复用上游能力，不重写编译器、Worker、IPC、ACK、取消生命周期或资源传输。初始化最小真实 check，完成编辑到 Bundle/CAR 的单命令闭环。

### I-S03: 验证并记录可复现交付

增加与新行为直接相关的测试及作者文档，运行 pnpm check。以外部 Task
Engine 执行构建结果，保留输入、实际结果、资源读取、依赖版本与回收证据。修复依赖尚未发布时，明确标注精确 main 的本地验证来源及可复现方式；不把本地打包验证称为 registry 安装验证，不自动发布上游。

## Acceptance criteria

### I-AC01: 公共领域能力与依赖边界有效

SDK 的实际作者代码与聚焦测试证明公共能力减少重复检查代码，且与生成契约一致；依赖清单及构建验证证明 SDK 不依赖 builder、不复制运行时，binding 使用上游真实路径。

### I-AC02: 作者流程与制品真实可用

从 init 项目在 CLI 外修改源和资源，再以一次 build 产出标准 Bundle/CAR；外部 Engine 验证通过、不通过、执行故障三条路径，以及结果中的参考文档路径可从 Run 的 outputCid 对应文件包读取。测试同时覆盖受限 Context、问题报告、输出失败传播及确认后的 CLI 参数、输出与错误协议，不能只证明内存树已返回。

### I-AC03: 仓库质量与交付说明完整

pnpm
check 成功；作者文档可复现初始化、安装前提、编辑、构建和执行，证据分别注明本地源码、打包依赖与 registry 来源及版本。发布映射仅按确认后的仓库约定配置，不执行 npm 发布、release
tag 或旧包 deprecation。
