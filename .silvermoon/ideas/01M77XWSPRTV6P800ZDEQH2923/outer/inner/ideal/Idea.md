# 统一 TypeScript 项目长期维护约定

## 问题

现有 TypeScript Project
Check 允许调用方改变合格线，项目规范又分散在单包、workspace 和 npm 交付文档中，缺少一套面向 Agent 长期维护的统一约定。

## 结果

以一个 `@silvermoon-work/check.typescript-project` 验证
[TypeScript Project Convention](./TypeScript-project-convention.md)
的六类要求：环境、开发依赖、项目规范、标准脚本、工作流、结构与文档；按真实拓扑和交付职责应用规则。

## 边界

- 输入仅为顶层 projectDirectory，不接受政策覆盖或成员筛选；单包、workspace、npm 交付是内部适用分支。
- 项目只读静态检查，另观察受信发行及生命周期元数据；不执行目标代码、自动升级或实际发布。
- 新建 CAR/CID，不改写历史验收；不另造 npm-package/monorepo
  Check 或为此扩展组合协议。

## 验收标准

1. 六类长期规则有具体检查依据，版本维护同时验证声明、目标 lockfile 解析与新鲜度，不冻结历史版本快照。
2. 根与成员共享能力可证明覆盖，npm 规则只用于适用交付包，latest/rc 发布配置及身份保护可验证。
3. 真实 CAR 独立消费证明通过、不通过、旧输入拒绝、文档可读及资源回收；无法确认和执行故障不被伪装成通过。
