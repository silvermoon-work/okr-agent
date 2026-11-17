# Implementation

本契约是旧 Silvermoon 准备阶段的高层种子，构想批准后按实际调研逐步细化，不表示已经批准具体技术方案。

## Steps

### I-S01: 明确技术方案与测试约定

基于[构想支持文档](ideal/delivery-and-open-questions.md)的问题列表调研当前 Checker、旧 Silvermoon 和 Git 事实边界，与人对齐关键决策及测试目录、用例。

### I-S02: 实现 Checker 与 CLI 协作能力

在本仓库实现目标包、Spec / Events / Evidence 契约和 CLI Host，保留整备及授权边界，避免第二套生命周期判断。

### I-S03: 完成针对性测试与交付准备

实现自动化测试，验证修订失效、错误路径和兼容边界，更新直接相关文档、skill 与包交付配置，不替换当前旧 CLI。

## Acceptance criteria

### I-AC01: 共识与状态可追溯

通过覆盖当前确认、修订失效、事件异常及证据缺失的测试，证明三套 Spec 的协作与验收事实不会被草稿或旧确认冒充。

### I-AC02: 检查与呈现职责一致

通过同一 Idea 多次运行及设备/项目前置失败的测试，证明 `Check CID + Target` 定位稳定，CLI 各 audience 保持相同业务结论，整备不阻断合法草稿审核。

### I-AC03: 工程质量与边界成立

根 `pnpm check`、相关构建和交付检查通过，记录结果；代码和测试证明不隐式迁移旧数据、不自动切换全局 CLI，实际发布仍受单独授权约束。
