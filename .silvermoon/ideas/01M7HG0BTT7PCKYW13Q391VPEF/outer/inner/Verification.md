# 实现候选验证

## 范围

- 私有库 `@silvermoon-work/check-bundle-viewer` 提供版本化 Spec、完整形状与参数 Schema 校验、覆盖所有定义的 DAG 检查、React 定义视图及样式。
- 私有宿主 `@silvermoon-work/check-bundle-web` 提供本地 mock、当前真实身份分流摘录和无效输入示例；不执行 checker，不改变 SDK 或 Check 作者源码。
- 既有 Task SDK/Engine 升级来自主干整合，不是本功能重新设计或降级的依赖。

## 已实现的讨论约定

- 单行紧凑树，桌面行高 32px，树与详情独立滚动；共享定义使用跳转，不重复展开。
- mobile 默认只显示详情，原生 modal dialog 承载 navigation pane；选择节点回到详情，支持关闭按钮、遮罩和 Escape。
- Parameters 包含从直接声明的 `properties` / `required` 投影的字段列表、折叠 JSON Schema 和语义前置假设。不把组合 Schema 的未知字段推断成已知事实。
- 说明经 `react-markdown` / `remark-gfm` 渲染，代码引用保持行内代码。无 raw HTML 插件或 `dangerouslySetInnerHTML`，不加载说明图片，沿用安全 URL 策略；Schema 仍为字面 JSON。
- Problems 按规则分组，以问题码、说明、触发条件三列表格展示；空 Children 整节隐藏。
- Parents 在 Children 之后，反向投影原始 children，不增加作者维护字段；同一父节点不同参数的边逐条保留，支持父节点导航。
- DAG 校验拒绝自环、间接环及未连接定义中的环，允许共享引用，并同时保留缺失引用诊断。

## 自动验证

2026-11-16，主 Agent 在整合主干及修正嵌入宿主 Escape 行为后独立执行：

- `pnpm check`：退出码 0，格式、依赖序构建、类型、lint、覆盖率、release 回归、package lint 与 scripts 检查通过。
- Viewer 34 项测试通过；覆盖率 statements / branches / functions / lines 为 100 / 96.42 / 100 / 100。
- Web 宿主 2 项测试通过，四项覆盖率均为 100；项目四项 90% 门限未修改。
- Viewer 的定向 build、typecheck、lint 通过。
- subagent 另行验证冻结安装及完整 root gate；主 Agent 不以其结果替代自己的完整检查。

早期完整检查曾遇到既有文件预算测试超时，首次冷启动也曾遇到 worker 启动超时。没有调整超时、跳过测试或降低门限；上述最终完整检查已通过。

构建仍提示单个 Web chunk 约 539KB，属于未阻断的 Vite 提示，未通过提高警告门限隐藏。

## 浏览器预验

真实浏览器已访问 `http://127.0.0.1:4173/`：

- 桌面观察 1417px / 1024px 视口，节点行高 32px，页面无横向溢出，树与详情使用各自的滚动容器。
- 选中成员发现后，详情顺序为 Parameters、Problems、Children、Parents；字段引用显示为代码。
- 共享配置展示 4 条 Parents，包括同一 workspace 的两条不同条件 / 映射；叶节点不显示 Children。
- 390px mobile 视口没有内联整棵树；详情无页面横向溢出，Problems / Parents 分别在 520px / 560px 内容宽的局部滚动区内展示。
- 原生侧栏满足 `:modal`；背景禁止滚动，Tab 与 Shift+Tab 焦点保留在侧栏。选择节点关闭侧栏并聚焦详情，关闭按钮、遮罩关闭均恢复入口焦点。
- 嵌入浏览器会送达 Escape keydown，却未产生原生 cancel；候选已增加明确的 Escape 关闭处理及回归用例。真实键盘复验确认关闭并恢复入口焦点。
- 无效循环在 `/checkers/beta/children/0/checker` 报告 `alpha → beta → alpha`；无效引用及 Schema 错误显式展示。
- 当前真实示例包含 `typescript-project-invalid`，没有冒充旧成员脚本检查。

浏览器工具的 viewport 仿真未可靠产生原生 media change 事件，因此不把它当作真实 resize 保持状态的证明；应用 resize 清理与状态保持已有受控平台单元测试。静态桌面与 mobile 布局、原生模态焦点及关闭交互分别做了真实浏览器验证。

## 后续 gate

本文件是实现及预验记录，不自行接受 Ideal / Implementation / Deployment。部署阶段按已同步的 Deployment 契约复核本地服务，并由获授权的主 Agent 记录准确 revision 的门限决定。
