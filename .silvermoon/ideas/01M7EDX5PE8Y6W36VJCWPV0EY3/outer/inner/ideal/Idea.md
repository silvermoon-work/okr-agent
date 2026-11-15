# 用 TargetChecker 重整 Check SDK 与两个 Check

## 问题

现有 Check 把目标发现、检测规则和前置阻断交织在大流程里，难以复用与解释剪枝范围。继续堆叠 npm、Cloudflare 等规则会放大这一问题。

## 结果

迭代 Check SDK，并将两个现有 Check 的本阶段职责迁移为按类型注册、由根 target 驱动的 DFS 检测树。`check.typescript-project` 先完成通用项目检查与非 Cloudflare deliverable 的既有适用检查；`check.nodejs-toolchain` 独立检查授权环境。成功发现子项，失败报告问题并阻断该分支，独立分支继续。

## 边界

- 先确认[检测树规划](./Planning.md)，再实施；package 职责与显式 deliverable 类型分开，不将仓库强制二选一归类。
- Cloudflare 交付专项延后，不迁移、不扩展、不纳入本阶段验收；既有行为保留，相关包仍接受通用检查。保留输入、问题码、文档/资产与故障边界，不执行目标代码或修改授权环境。
- 不引入通用图调度、自动修复或远程部署；npm 发布、上传 CAR、Cloudflare 部署均须另行明确授权。

## 验收标准

1. SDK 提供类型安全的 target、checker 注册与根参数接口；测试证明有序 DFS、叶节点、分支剪枝、兄弟继续及故障传播。
2. 两个 Check 的本阶段实际检测流程使用新编排器；回归证明非 Cloudflare 规则保留、独立目标不被连带阻断，两个新 CAR 可通过公开 Engine 消费。
3. 规划明确项目级统一入口到 package、非 Cloudflare deliverable 与工具约束的职责和阻断边界，覆盖单包、混合 workspace 与共享前置条件；适用交付按类型分派，不重复整套项目检查，并明确 Cloudflare 延后边界。
