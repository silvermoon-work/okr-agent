# 质量门禁入口缺失

缺少根标准动作、适用接口或对应入口文件。所有 package scripts 应为
`node scripts/<同名>.mjs`，所有名称禁止冒号，且与 scripts 顶层 .mjs 文件双向一一对应。标准入口和必要固定 lib 从 output
assets 恢复；拓扑从 workspace、manifest 及既有工具配置推导，不要求 scripts.config.json。自由共享模块放 scripts/lib/，无需命令。前置无效的调用不追加预期文件/lib 缺失；共享 lib 一次报告附影响范围。先保护自定义代码，不自动覆盖用户文件。
