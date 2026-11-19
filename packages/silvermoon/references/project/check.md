# Silvermoon 项目就绪检查

`silvermoon check-project` 独立检查项目是否处于可开始工作的状态，
`silvermoon create-idea` 在写入前也执行同一 Task；都不需要 Idea 参数。
五个检查点为 global → repository → branch → silvermoon-folder → pre-commit；
前四步复用 Idea Task 的相同前提规则，但不检查既有 Idea 或生命周期完成状态。
任一检查点失败即停止，CLI 返回问题和修复指引，不创建 scaffold。
检查包含工作区干净、upstream 和 primary 同步，以及有效 pre-commit hook 中的
`silvermoon check-changes --staged --audience agent` 失败阻断前缀，
不只是项目配置校验。尊重 core.hooksPath；只读检查，不执行或自动安装 hook。
缺少配置或首次接入尚未准备好时返回具体问题，不自动初始化。

通过只代表本次观察项目就绪，不是持久授权。check-project 到此结束，不创建文件。
仅 create-idea 随后由 CLI 写入层分配唯一 ID、绑定 Idea Check
CID、创建 scaffold 和首条事件；
写入仍需独占锁、重新核验仓库与内容，以及只清理本次拥有文件的失败恢复。
不因为前提检查通过就省略并发保护；Project Task 不执行这些写入。

检查可能获取配置的 primary，但不自动安装、修复配置、暂存、提交、推送或清理文件。
任何修复仍须遵守独立授权。使用 `silvermoon get-reference <cid>`
可读取本 Task 文档。
