# CI 连接不满足

质量 CI 必须匹配 [固定标准](../../assets/npm-ci.yaml)，main 更新执行 pnpm
check，保留 PR 质量入口，全部必需 job/矩阵/聚合成功才合格。仅 jobs.compatibility.strategy.matrix.node-version 可作有限版本参数扩展；触发、权限与失败传播不可绕过。

先按 brief 的观察路径/值与期望结构修复。其他 job 已有矩阵表示标准结构不符，不代表项目没有矩阵；结构未通过不追加派生矩阵或发布绑定问题。结构通过后按具体包 engines 下限校验标准矩阵，不把不同下限误报成包之间冲突。独立确凿配置缺陷仍保留，不将静态机制声称为本次 CI 已成功。
