# Silvermoon 提交检查

这是独立的候选快照合法性 Check Task，不是 Idea 推进任务。
两个有序验收状态是“候选快照有效”和“候选修改符合约束”；首个不通过即停止。
暂存区和工作区候选以 HEAD 为基线；已提交快照以该提交的第一个父提交为基线。
没有已存在 Silvermoon 元数据的基线时，检查初始化候选的结构。

检查不读取全局 Silvermoon 配置、不校验运行时安装或个人 skill，
不要求工作区洁净、当前分支关联 upstream、HEAD 与 primary 同步或 Idea 完成，
也不访问远端。候选快照必须结构有效，已有身份与事件历史必须保留。

commit hook 使用 `silvermoon check --staged --audience agent`，
只验证实际将提交的索引；不自动安装 hook，不 stage、commit、push 或 clean。
