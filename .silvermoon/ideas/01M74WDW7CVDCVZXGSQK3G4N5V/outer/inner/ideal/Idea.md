# Check Task SDK 与 Check Task Builder

## 问题

Potential Guide 的历史债使检查作者能力难以独立演进；通用 Task
Engine 已迁出，但 OKR Agent 尚无新的 check-task-sdk/check-task-builder。

## 结果

在 OKR Agent 建立两个职责包：组合 Task
SDK 的检查领域 SDK，以及将 check 项目文件树转换为标准 Task
Builder 输入并一次完成构建的作者工具。作者初始化后在 CLI 外编辑，即可交付由外部 Task
Engine 执行的标准 Bundle/CAR。

## 边界

1. SDK 提供真实的检查公共抽象，不仅重导出或改名包装 runTask；不依赖 builder，不复制通用运行时。
2. Builder 复用上游编译、SDK binding、Bundle 校验和 CAR 编码；CLI 名为
   `check-task-builder`，至少支持 `init/build`。
3. 只完成一个最小真实 check 闭环；不迁入整个 Potential
   Guide，不扩展 Objective、调度、监管、服务端或 Web
   UI，不发布 npm、推送 release tag 或弃用旧包。

## 验收标准

1. 两包职责和依赖方向清晰，SDK 作者 API、目录、契约与资源映射经过必要确认；[需求与待确认设计](Requirements.md)中的建议不因构想验收而自动成为已批准的数据或 CLI 契约。
2. 初始化示例实际使用领域 SDK；一次 build 产出标准制品，外部 Engine 证明通过、不通过、执行故障及打包资源读取。
3. 遵循本仓库工具链并通过
   `pnpm check`；保留历史来源，区分上游 main、本地验证和已发布依赖的事实。
