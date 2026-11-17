# Deployment

本地交付验收范围、准确代码/制品身份和真实浏览器证据见 [BrowserAcceptance](./BrowserAcceptance.md)。不把已发布旧 RC 或旧 renderer 的测试当作新宿主的证明。本轮不发布 npm 或上传远端制品。

## Steps

### D-S01: 试跑两种 Bundle 来源

使用准确构建产物与正式共享 Store 配置机制下的独立受控 local 配置，分别通过 run --cid 与 run --car 加载 Check browser Task；不读取或篡改个人配置来掩盖问题，不声称验证了用户远端节点。

### D-S02: 浏览器与生命周期验收

实际操作文档、router、桌面与 mobile 导航，并验证启动取消、Task 返回后应用存活及独立关闭，记录准确版本与复现指令。

## Acceptance criteria

### D-AC01: 两种来源可复现运行

真实 CLI 与浏览器记录证明相同 browser Task 通过准确 CID 或 CAR 启动，并展示所选 document，而非预置 fixture。

### D-AC02: 展示及资源边界真实成立

浏览器操作与退出观察证明 Task 完成不销毁应用、启动 cancel 不冒充应用关闭，持续预览与独立关闭无隐藏故障，迁移说明可实际使用。
