# 将 ipfsaw 演进为 Browser Task 宿主

## 问题

已发布 ipfsaw 使用专用 renderer manifest 与生命周期接口，不能直接使用 Task Builder 产出的标准 Task Bundle/CAR。另造公共 JS 包格式会重复现有 Task Bundle 的交付抽象。

## 结果

复用 Task Bundle，将 renderer 建模为启动 Web App 的 browser Task；用户通过 `ipfsaw run --cid/--car --document` 打开文档。已确认的宿主、SDK、生命周期和 CLI 边界见 [Design](./Design.md)。

## 边界

- 宿主适配先在现有 `@silvermoon-work/ipfsaw` 中开发，不新增包；不扩展 TaskContext，不另造公共 Bundle 格式。
- 启动 Task 完成后 Web App 可以继续运行；cancel 仅取消尚未完成的启动，应用关闭是独立的宿主动作。
- browser Bundle/SDK/Builder 支持由用户协调上游；本仓不伪装 node runtime 或绕过协议校验。该支持未到位时保持实施阻塞，不自动发布。

## 验收标准

- 同一 browser Task Bundle 既能通过准确 CID，也能通过本地 CAR 加载；解析 document 后按真实 Task 契约传入启动参数。
- 真实页面启动成功、失败、启动取消和启动完成后的应用存活 / 关闭具有可验证且互不混淆的行为。
- CLI 的 run 结构、内容来源参数与业务输出对位 Task Engine；Check 定义文档能在桌面和 mobile 真实浏览器展示，现有已发布入口的迁移方式有明确说明。
