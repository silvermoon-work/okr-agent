# 仓库前置

当前分支必须正确跟踪配置的远端 primary，全部内容已经提交，并且 HEAD
与观察到的 primary tip 一致。Idea 草稿、events 和证据文件同样需要提交。
检查只读；不得自行清理、暂存、提交、推送或改写历史。

## 仓库与配置

- `repository-root-invalid`：使用有效 Git 仓库根目录，不能是重定向路径。
- `project-configuration-invalid`：修复项目配置及 primaryRepository、primaryBranch。
- `project-layout-invalid`：修复协议结构、路径、文件类型或容量约束问题。

## 分支与同步

- `primary-branch-missing`：确认配置的远端 primary 分支存在。连接或鉴权失败属于执行错误，
  不能冒充已确认的分支缺失。
- `branch-detached`：使用明确的本地分支。
- `branch-upstream-mismatch`：upstream 必须指向配置的远端 repository 和 primary
  branch。
- `primary-sync-required`：保留双方历史，使用普通 Git 集成并同步至观察到的 primary。
- `worktree-uncommitted`：先保留并处理全部已暂存、未暂存和未跟踪内容，不自动清理。

## 历史保护

- `event-history-rewritten`：已有事件必须保留准确的追加前缀，不得删除、修改或重排。
- `idea-identity-modified`：不得改写已记录的 bootstrap 身份或固定 Check CID。

授权刷新失败是执行错误，不代表远端分支已被证明不存在。
