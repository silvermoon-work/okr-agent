# 检查项目的 Node.js 工具链要求

## 问题

通用 tools 检查只比较命令版本，不能准确表达 Node.js 工具之间的配对、管理关系和 registry 要求，也无法提供具体修复指导。

## 结果

以私有作者项目 `@silvermoon-work/check.nodejs-toolchain`
构建并交付 CAR/CID，通过复合 requirements 检查指定项目上下文中的工具链状态，并为实际问题提供专用参考文档。具体语义与验收场景见
[Requirements.md](./Requirements.md)。

## 边界

- 一个私有 workspace 作者包、一个 Check
  Task，交付 CAR/CID，不配置或执行 npm 发布；复用现有 SDK/Builder。
- 覆盖工具要求、Node/npm 配对、可选 nvm 管理约束，以及当前 registry 与 nrm 注册要求。
- 仅观察与验证，不安装、切换或修改环境；不检查网络健康、依赖完整性或实际构建。

## 验收标准

1. 输入明确描述要求及执行上下文，未声明项不被擅自要求，非法或冲突要求被拒绝。
2. 工具、配对、管理及 registry 各项结论均基于实际生效状态，证据不足不判通过。
3. 不满足项具有具体问题码和修复文档；执行故障不伪装成业务不通过，交付可经真实 Engine 验证。
