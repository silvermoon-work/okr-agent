# Implementation

本契约沿用旧 Silvermoon 实施门限。用户已委托主 Agent 负责全部门限审阅；已确认的技术默认值与文字测试约定见 ideal 层的[执行决定](ideal/execution-decisions.md)、[场景索引](ideal/test-index.md)和[测试用例](ideal/test-spec.md)。实际验证结果记录在[实施证据](implementation-evidence.md)，不以作者自报完成替代独立审查。

`rc.0` 已发布后的实际验证暴露两个阻塞。用户要求将[修复决议](rc0-resolution.md)返回 Inner 并重新实施；本次修改使旧实施验收失效，不编辑历史接受事件，也不把旧候选证据当成修复后结果。

## Steps

### I-S01: 明确技术方案与测试约定

基于[构想支持文档](ideal/delivery-and-open-questions.md)的问题列表调研当前 Checker、旧 Silvermoon 和 Git 事实边界，与人对齐关键决策及测试目录、用例。

### I-S02: 实现 Checker 与 CLI 协作能力

在本仓库实现目标包、Spec / Events / Evidence 契约和 CLI Host，保留整备及授权边界，避免第二套生命周期判断。

### I-S03: 完成针对性测试与交付准备

实现自动化测试，验证修订失效、错误路径和兼容边界，更新直接相关文档、skill 与包交付配置，不替换当前旧 CLI。

### I-S04: 修复 RC.0 配置兼容与 Git 执行上下文

按[修复决议](rc0-resolution.md)复用安全的 GitHub 仓库身份解析，兼容合法旧配置而不改写共享文件；由宿主显式捕获允许的 Git 环境，经 Target 传入真实 Check Worker，并为并发检查隔离上下文，不继承任意环境或削弱 Engine 隔离。同步修复直接依赖的调用方、测试和文档。

## Acceptance criteria

### I-AC01: 共识与状态可追溯

通过覆盖当前确认、修订失效、事件异常及证据缺失的测试，并在修复后的真实 CLI / Engine / CAR 中重跑共识及两阶段验收，证明三套 Spec 的协作与验收事实不会被草稿或旧确认冒充。

### I-AC02: 检查与呈现职责一致

通过同一 Idea 多次运行及设备/项目前置失败的测试，证明 `Check CID + Target` 定位稳定，CLI 各 audience 保持相同业务结论，整备不阻断合法草稿审核。回归须证明无凭据旧 primary URL 可用且危险输入仍拒绝，并由真实 Worker 使用受控宿主 Git 环境完成 primary 同步，不能只在主进程 mock 中验证。

### I-AC03: 工程质量与边界成立

根 `pnpm check`、相关构建和交付检查通过，记录结果；代码和测试证明不隐式迁移旧数据、不自动切换全局 CLI，实际发布仍受单独授权约束。
