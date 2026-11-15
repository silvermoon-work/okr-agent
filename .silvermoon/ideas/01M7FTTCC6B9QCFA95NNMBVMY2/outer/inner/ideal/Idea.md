# 构建可去重、可取消的检查图执行模型

## 问题

已完成的 DFS 模型将检查职责与目标类型耦合，不能直接表达同一对象的多项检查、跨路径节点复用和有界并发。新的组合模型需要分开“检查什么”“如何执行”和“一次执行的状态”。

## 结果

以命名 Checker 与可规范编码的 Target 组成 CheckItem；从指定根项动态展开检查图，在一次 CheckExecution 内去重、局部剪枝、响应取消并汇总 CheckReport。统一支持本地 Checker 与 Check Bundle 适配。

## 边界

- 本 Idea 是[已完成 DFS 迭代](../../../../01M7EDX5PE8Y6W36VJCWPV0EY3/outer/inner/ideal/Idea.md)的后续，不重命名、重开或改写旧验收；本轮只准备构想，实施成绩从零开始。
- 采用[模型与术语](./Model.md)、[执行和验收场景](./Execution.md)及[作者最佳实践](./Authoring.md)；不引入 CPS、跨执行缓存或通用汇合调度。最佳实践的自动化 Check 留待后续，本轮仅文档化。
- 后续迁移 SDK、两包的通用/非 Cloudflare 检查及直接依赖入口；Cloudflare 专项仍延后。旧 Bundle/Task/Run 身份与证据保留，发布和远程部署不在本次授权内。

## 验收标准

1. SDK 提供 defineChecker 与显式定义注册；目标契约统一验证，CheckItem 规范身份及 root/input/children 对应类型安全，相同检查项一次执行只调用一次，非法或变化的目标不能破坏身份。
2. FIFO 有界并发遍历收集唯一节点的问题，重复边/共享节点/环不重复执行；失败局部剪枝，abort 或执行故障停止调度并清理在途工作，不返回伪完整报告。
3. 本地与 Bundle Checker 在相同图模型下可组合，问题来源可定位；两包及作者入口迁移有回归、完整质量门禁和独立消费者证据，不用旧 DFS 成绩代替。
