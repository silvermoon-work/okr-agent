# RC.0 部署阻塞修复决议

## 依据与范围

依据[真实发布后验证](../deployment-readiness.md)，用户要求先将两个阻塞返回 Inner、重新实施，完成后发布新的连续 RC，再从 registry 安装验证。沿用既定需求、测试约定及主 Agent 的门限审阅委托；不改 Ideal，不删除历史事件，不覆盖已发布 `rc.0` 或移动其 tag。

用户另行明确要求移除根 `AGENTS.md` 的旧 exact-tarball 条款。仅移除这一条并更新项目指导，不传播修改到其他 Check 的标准资产。

## R-01: 兼容合法旧 primary 配置

旧配置保存无凭据 GitHub URL，新实现只接受 `owner/repository`，导致配置并存失败。

- 复用一处仓库身份解析，使配置及 Git remote 的比较使用一致的规范身份；兼容既有安全 HTTPS / Git SSH 表示及简写。
- 仅在读取后的内存模型中规范化，不重写配置路径、版本、字段或原始文件；保留对凭据、其他主机、查询、片段及非法身份的拒绝。
- 用旧 URL 原文的 fixture 运行 snapshot、primary 及真实 CLI；验证新旧工具均可读取本仓库现有配置。

## R-02: 显式传入 Git 宿主上下文

Engine 的 Worker 按设计不继承宿主环境；Git 适配却在 Worker 内读取 `process.env`，丢失 CLI 使用的 PATH、home 和 SSH agent 等上下文。

- 宿主捕获有界、封闭白名单的 Git 执行环境，经 Check Target 显式传递；只传必需的路径及控制字段，不复制 token、任意 `GIT_*`、`NODE_OPTIONS` 或整个宿主环境。
- Worker 的仓库检查使用该显式环境。将作用域限定到当前异步检查，让嵌套 Git 操作一致、并发调用不串环境；不修改全局 `process.env` 或 Task Engine。
- 主进程的创建、事件与只读查询复用相同 Git 环境构造，保留禁 hooks、非交互、禁外部协议及现有历史/并发保护；缺失或非法显式上下文须明确报错，不能默默换系统默认环境。
- 在真实子进程 CLI 与真实 CAR Worker 中使用只连接自有 bare primary 的受控传输，完成五次确认、草稿同步、实现证据、部署证据、终态及修订回退。原 `rc.0` 应在该回归中失败，不能通过替换 Worker 或注入无限制环境制造通过。

## 验证与再交付

先运行相关配置、Git 和真实 Worker 回归，再以精确开发 Node / pnpm 执行根 `pnpm check`。修复候选必须重建 CAR，记录新的准确 CID、源码提交及真实运行证据；不复用原候选 smoke 或原发布成绩。

下一个连续版本计划为 `0.1.0-rc.1`。按现有 Trusted Publishing 流程绑定修复后的准确提交与对应 main-push CI，发布后重新下载并独立安装，重复 Deployment 验证；本地候选通过不等于发布后通过。全局旧 CLI、个人 skill、本仓库旧配置及 Idea 历史继续保持原边界。
