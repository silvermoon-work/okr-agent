# Silvermoon Idea 创建前提检查

`silvermoon create-idea` 在写入前执行本独立 Task，不需要 Idea 参数。
四个检查点为 global → repository → branch → silvermoon-folder；
复用 Idea Task 的相同前提规则，但不检查既有 Idea 或生命周期完成状态。
任一检查点失败即停止，CLI 返回问题和修复指引，不创建 scaffold。

通过只代表本次观察满足创建前提，不是持久授权。
随后由 CLI 写入层分配唯一 ID、绑定 Idea Check CID、创建 scaffold 和首条事件；
写入仍需独占锁、重新核验仓库与内容，以及只清理本次拥有文件的失败恢复。
不因为前提检查通过就省略并发保护；创建 Task 不执行这些写入。

检查可能获取配置的 primary，但不自动安装、修复配置、暂存、提交、推送或清理文件。
任何修复仍须遵守独立授权。使用 `silvermoon get-reference <cid>`
可读取本 Task 文档。
