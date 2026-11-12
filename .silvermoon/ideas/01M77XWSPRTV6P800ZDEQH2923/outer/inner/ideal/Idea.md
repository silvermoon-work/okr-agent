# 固定 TypeScript 工程标准并组合 npm 包项目检查

## 问题

现有 TypeScript Project
Check 允许调用方改变合格线，不适合作为稳定共性标准；npm 包项目的模板约束也尚未成为独立于继承来源、可组合的检查。

## 结果

先将 `@silvermoon-work/check.typescript-project` 收敛为长期最佳实践标准，再实现
`@silvermoon-work/check.npm-package-project`，组合前者并检查单包 TypeScript ESM
npm 项目的附加共性。具体标准见 [Requirements.md](./Requirements.md) 与
[Npm-package-standard.md](./Npm-package-standard.md)，规则与动态版本事实的边界见
[Maintenance-invariants.md](./Maintenance-invariants.md)。

## 边界

- 两个 Project
  Check 统一只接受顶层 projectDirectory；不接受 context、projectScopes、requirements 或豁免开关，范围由项目声明识别；父级固定子标准 CID。
- 项目配置静态只读，允许查询受信发布元数据验证 pnpm 新鲜度；不执行目标 build/pack/test、自动升级或验证线上权限。
- 重建新 CAR/CID，不改写历史制品；只补足父子结论及参考文档交付所需的最小组合能力，不建设通用政策框架。

## 验收标准

1. TypeScript
   Check 固定长期规则而非历史版本快照：pnpm 精确锁定并跟进同 major 最新稳定版本；旧 context、projectScopes、requirements 明确拒绝。
2. npm 包项目 Check 在同一对象上组合固定 TypeScript 标准，并验证文档列明的 npm 附加共性，清楚区分不满足、无法确认和执行故障。
3. 两个新 CAR 可独立消费，父子原始身份、具体问题与参考文档可读取；不把静态配置合格夸大为可发布制品或线上权限已验证。
