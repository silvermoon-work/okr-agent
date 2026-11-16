# 本地 Web UI 验证

## 交付与复现

代码交付版本：`653f2c2f45c9d5fe53b7dae155dc6df91b474e93`；后续同一 Idea 的提交仅记录文档与生命周期事件。

在仓库使用 `.node-version` 对应的 Node 与根 `packageManager` 指定的 pnpm：

```powershell
pnpm --filter @silvermoon-work/check-bundle-viewer build
pnpm --filter @silvermoon-work/check-bundle-web dev
```

访问 <http://127.0.0.1:4173/>。启动入口限定 `127.0.0.1:4173`，端口占用则失败，不自动改端口。交互控制台中使用 Ctrl+C 停止。

本次由主 Agent 启动独立后台预览服务并保持供用户继续查看。HTTP 就绪检查返回 200，真实浏览器能读取示例和节点详情。不依赖远程后台、字体或图片；不调用 Check 执行器。

## 实际浏览器观察

验证日期：2026-11-16。以下为主 Agent 真实浏览器操作，不用 jsdom 模拟结果替代：

| 场景 | 观察结果 |
| --- | --- |
| 桌面 | 1417px / 1024px 视口无页面横向溢出，单行节点高度 32px；脉络与详情独立滚动 |
| 节点详情 | 成员发现按 Parameters、Problems、Children、Parents 排列，前置假设与参数引用有行内代码排版 |
| 共享引用 | 共享配置展示 4 条父边；同一 workspace 的两条不同条件 / 映射不被折叠成一条 |
| 叶节点与入口 | 叶节点不显示 Children；入口没有 Parents；顶部不再出现来源下拉框 |
| 390px mobile | 默认只有详情，打开 navigation pane 才显示检查脉络；页面无横向溢出，表格在局部区域滚动 |
| 原生侧栏 | `dialog` 命中 `:modal`，背景滚动锁定，Tab / Shift+Tab 焦点约束在侧栏内 |
| 选择与关闭 | 选择节点后关闭侧栏并聚焦详情；关闭按钮、遮罩及真实 Escape 按键关闭侧栏并恢复入口焦点 |
| Markdown | 段落、强调、引用、字段代码和 JSON 代码块显示为文档，而非被求值的表达式 |
| 无效循环 | 显示闭环 `alpha → beta → alpha` 和 `/checkers/beta/children/0/checker`，不展示正常脉络 |
| 无效 Schema / 引用 | 同时显示根引用、参数 Schema、child 引用的明确诊断 |
| 真实摘录 | 切换当前身份分流示例后显示当前问题码，不将旧实现或规划 mock 当作完整真实检查 |

移动表格的可用内容区实测为 317px，Problems 与 Parents 的内容宽分别为 520px、560px；横向滚动局限在表格容器，不撑宽页面。

## 已处理的问题与证据边界

嵌入浏览器可发送 Escape keydown，却不一定产生原生 cancel；独立浏览器验证发现后已修正，并在相同本地预览中复验真实键盘关闭和入口焦点恢复。

浏览器工具的 viewport 仿真没有可靠产生原生 media change 事件，故不宣称它证明了真实窗口 resize 保持状态。应用的 resize 清理与状态保持由平台受控单元测试覆盖；桌面与 mobile 静态布局、原生模态焦点和真实选择 / 关闭操作分别已验证。

截图保存在本次会话的 `check-bundle-acceptance` 交付附件中。构建存在约 539KB chunk 的非阻断提示；没有提高警告门限、降低测试门限或隐藏错误。

## 部署门限

本报告与 Deployment 契约同步到 primary 后，主 Agent 复核同一交付代码的 HTTP 可达、页面渲染、正常 / 无效示例以及 mobile 侧栏操作，再完成 ledger 并按用户授权记录准确 deploymentRevision 的提交与验收。该验收范围仅为本地讨论 Web UI，不授权任何公开发布。
