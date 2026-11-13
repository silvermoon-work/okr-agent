# CI 连接不满足

质量 CI 必须匹配 [固定标准](../../assets/npm-ci.yaml)，main 更新执行 pnpm
check，保留 PR 质量入口，全部必需 job/矩阵/聚合成功才合格。仅 jobs.compatibility.strategy.matrix.node-version 可作有限版本参数扩展；触发、权限与失败传播不可绕过。

先按 brief 的观察路径/值与期望结构修复。其他 job 已有矩阵表示标准结构不符，不代表项目没有矩阵；结构未通过不追加派生矩阵或发布绑定问题。所有适用代码包（包括 private）最低 Node 不一致先报告 environment-mismatch；缺失/非法先各自报告，短路依赖该前置的矩阵差异，独立默认 CI 与发布保护仍检查。结构与统一最低值前置通过后，required 为统一消费者最低值及一个更高、当前受支持且满足全部适用范围的官方 LTS；更低或不满足范围的额外矩阵值标为 unsupported，不据此宣称所有包必须承诺该版本，也不单独因此报 ci-mismatch。完整固定矩阵仍执行开发 check；工具不兼容时保留 ci-unconfirmed 边界，不擅自新增消费者 probe 或以缩窄 engines 掩盖。独立确凿配置缺陷仍保留，不将静态机制声称为本次 CI 已成功。
