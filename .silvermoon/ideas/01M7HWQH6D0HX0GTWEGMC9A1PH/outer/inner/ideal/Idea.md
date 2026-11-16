# 用 ipfsaw 持续预览本地结构化文档

## 问题

现有 Check viewer 只能从宿主代码中的预置示例展示定义；用户写好 YAML/JSON 后缺少直接打开并持续讨论的入口，展示逻辑也不应绑定单一文档类型。

## 结果

提供由文档 `$schema`、本地 CID 映射及不可变 renderer bundle 驱动的本地持续预览工具。确认项、受托设计范围与仓库分工见 [Requirements](./Requirements.md)；技术调研与接口细节由内层 supporting documents 承接。

## 边界

- 当前仓库交付 `@silvermoon-work/ipfsaw` 主实现；独立 `silvermoon-work/ipfsaw` 仓库仅承载无 scope 的 `ipfsaw` 薄入口。
- IPFS Store 严格复用现有 Task 工具链的配置与使用机制，不另建 IPFS 配置体系，不把 renderer 伪装成 Task Bundle。
- 首轮只读预览，不编辑或上传源文档，不执行 checker、不自动安装陌生 renderer；不把实现及验收授权视为 npm 或远端制品发布授权。

## 验收标准

- 用户指定本地 YAML/JSON 后，工具按 `$schema` 与明确绑定的准确 CID 加载自包含 renderer，在浏览器展示；不是继续切换宿主 fixtures。
- 保存文档后预览持续更新，语法、引用、资源及 renderer 故障显式可见，退出能回收本次预览资源。
- Check viewer 作为首个 renderer 贯通，并用不同 Schema 的最小 fixture 证明宿主未硬编码 Check；无 scope 入口与主包的参数、输出和退出语义一致。
