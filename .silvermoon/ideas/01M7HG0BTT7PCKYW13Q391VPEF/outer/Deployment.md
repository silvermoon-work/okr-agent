# Deployment

本阶段按用户要求在本地启动 Web UI，以 mock Spec 验证视觉效果与交互。用户授权主 Agent 负责 implementation / deployment 门限审批；实现 subagent 不自行审批。

本地使用入口、准确交付版本与浏览器观察见 [BrowserAcceptance](./BrowserAcceptance.md)。不包含 npm 发布、远程部署或 checker 执行。

## Steps

### D-S01: 启动本地 mock Web UI

启动仅本机可访问的服务，使用覆盖分流、批量展开、共享 DAG 及循环无效输入的 mock Spec，记录版本、地址与启动方式。不预设 npm 发布或远程部署。

### D-S02: 浏览器视觉与交互验收

主 Agent 在浏览器检查桌面紧凑树、mobile navigation pane、折叠、节点选择、包含参数列表、Schema 与前置假设的 Parameters、Markdown 字段引用、空 Children 隐藏、共享跳转、循环错误及键盘焦点。记录实际观察与问题修复后的复验结果。

## Acceptance criteria

### D-AC01: 本地服务可访问且可复现

通过 HTTP 就绪检查与真实浏览器访问，证明记录的 mock 页面可用；按相同版本与启动说明可重新打开。

### D-AC02: 视觉与交互满足讨论用途

浏览器截图与操作记录证明节点契约清晰可读、桌面与窄屏无关键布局破坏、导航及引用边界可用，且不会把定义误读成执行结果。由主 Agent 基于证据审批。
