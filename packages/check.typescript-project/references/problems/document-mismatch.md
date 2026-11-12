# 文档或忽略策略不满足

查看问题中的准确目标路径。根固定 AGENTS.md 与此次输出的[标准 AGENTS.md](../../assets/AGENTS.md)比较完整正文，只归一化换行，不忽略末尾换行或额外正文。

以 output.cid 为根读取 assets/AGENTS.md，先将现有自定义内容完整保留到自由扩展 docs/agent-project.md，再恢复根 AGENTS.md。不要直接丢弃或覆盖用户工作。README.md、CONTRIBUTING.md 和自由扩展仅检查可读、非空及固定引用路径，不以关键词判断质量。

gitignore 问题须按实际输出与敏感路径修复，同时保留必要源码、配置、lockfile 和 workflow 的版本控制。
