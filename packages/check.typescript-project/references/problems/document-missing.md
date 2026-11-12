# 必需文档缺失

按问题中的目标路径恢复缺少的可读非空文档。README.md、CONTRIBUTING.md 和 docs/agent-project.md 是自由文档，本 Check 不评审其正文。

根固定文件使用此次输出的[标准 AGENTS.md](../../assets/AGENTS.md)。以 output.cid 为根读取 assets/AGENTS.md 的完整 UTF-8 字节；先把现有自定义内容保护到 docs/agent-project.md，再写入目标根 AGENTS.md。不要 trim、追加项目说明或覆盖丢失用户工作；只允许统一换行到 LF。
