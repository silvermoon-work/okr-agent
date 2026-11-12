# 固定 TypeScript 工程标准并组合 npm 包项目检查

## 问题

现有 TypeScript Project
Check 允许调用方改变合格线，不适合作为稳定共性标准；npm 包项目的模板约束也尚未成为独立于继承来源、可组合的检查。

## 结果

先将 `@silvermoon-work/check.typescript-project` 收敛为长期最佳实践标准，再实现
`@silvermoon-work/check.npm-package-project`，组合前者并检查 TypeScript ESM
npm 交付项目的附加共性。单包与 pnpm
workspace 使用统一标准、按实际拓扑分责。具体标准见
[Requirements.md](./Requirements.md)、[Project-practices.md](./Project-practices.md)
与
[Npm-package-standard.md](./Npm-package-standard.md)，规则与动态版本事实的边界见
[Maintenance-invariants.md](./Maintenance-invariants.md)。

## 边界

- 两个 Project
  Check 统一只接受顶层 projectDirectory；不接受 context、projectScopes、requirements 或豁免开关，范围由项目声明识别；父级固定子标准 CID。
- 项目配置静态只读，允许查询受信元数据验证 pnpm、开发工具新鲜度及 Node 生命周期；不执行目标 build/pack/test、自动升级或验证线上权限。
- 重建新 CAR/CID，不改写历史制品；只补足父子结论及参考文档交付所需的最小组合能力，不建设通用政策框架。

## 验收标准

1. TypeScript
   Check 按六类长期规则验证环境、开发依赖及 lockfile、项目规范、Agent 脚本、CI 与项目文档结构；旧包装及政策输入明确拒绝。
2. npm 包项目 Check 组合 TypeScript 标准，验证适用包的交付及 latest/rc 发布流程，准确区分根/成员责任、不满足、无法确认和执行故障。
3. 两个新 CAR 可独立消费，父子原始身份、具体问题与参考文档可读取；不把静态配置合格夸大为可发布制品或线上权限已验证。
