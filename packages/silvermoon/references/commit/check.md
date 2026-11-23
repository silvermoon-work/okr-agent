# Silvermoon 提交检查

这是独立的候选快照合法性 Check Task，不是 Idea 推进任务。
两个有序验收状态是“候选快照有效”和“候选修改符合约束”；首个不通过即停止。
暂存区和工作区候选以 HEAD 为基线；已提交快照以该提交的第一个父提交为基线。
没有已存在 Silvermoon 元数据的基线时，检查初始化候选的结构。

检查不读取全局 Silvermoon 配置、不校验运行时安装或个人 skill，
不要求工作区洁净、当前分支关联 upstream、HEAD 与 primary 同步或 Idea 完成，
也不访问远端。只选择发生变更的 Ideas，但完整核验这些 Ideas 的候选与基线；
新增 Idea 必须结构有效，已有身份与事件历史必须保留。
新协议检查七个平级材料文件夹的真实 Git tree/mode、created-first 可信 Schema
和最小 submit/accept tuple 历史；不检查测试、CI、报告真实性、用例完整性或
声明 commit/path 绑定。历史 idea.json/用例索引/证据规则仅在原只读契约适用。
仅在明确授权后，使用可重复的 `--allow-delete <idea-id>` 声明整体删除例外；
部分删除、保留或不存在的 Idea 不能使用这个例外。

`silvermoon check-changes` 默认检查工作区相对 HEAD 的变化。
commit hook 使用 `silvermoon check-changes --staged --audience agent`，
只验证实际将提交的索引；不自动安装 hook，不 stage、commit、push 或 clean。
