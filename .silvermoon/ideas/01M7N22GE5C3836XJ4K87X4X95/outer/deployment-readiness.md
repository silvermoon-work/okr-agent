# 部署前提与当前阻塞

## 交付候选

- npm 包：`@silvermoon-work/silvermoon@0.1.0-rc.0`；
- 候选源码提交：`353fe73d26fd90414a1df4e14a2a1e1b6e3f97b3`；
- Check CID：`bafybeig2er4ote3f7phu3nyi7tih3jzjtmcfjzdmvm3qgodltv4gyxkupe`；
- [准确提交的 main-push CI](https://github.com/silvermoon-work/okr-agent/actions/runs/44137586803)已成功，`event=push`、`branch=main`、HEAD SHA 与候选一致，Quality default、Node.js 22.15.0 / 24.11.1 和 Release verification (v1) 全部 success；
- 旧 unscoped `silvermoon` alias 不在本次发布范围，全局旧 CLI / 个人 skill 保持不变。

实现已由主 Agent 根据用户明确委托审阅验收，旧 Silvermoon 已记录 `acceptInner`，当前生命周期为 deploying。

## 已具备的证据

根 `pnpm check`、独立 code-review 修复复查、两个包的覆盖率门禁、修复后准确 tarball 的独立安装和完整真实 CLI / Engine / CAR 流程通过，详见[实施证据](inner/implementation-evidence.md)。这些是候选验证，不等同发布版部署完成。

用户已报告 Trusted Publisher 配置完成；通过当前本机腾讯镜像已可查询到 `0.0.0` placeholder。不通过本机 registry 覆盖参数更改 registry，也不把 placeholder 可见当成 OIDC 发布成功。

## 发布授权边界

用户委托了生命周期门限审批，但仓库要求真实 npm 发布绑定准确版本和提交。主 Agent 已通过交互工具请求授权上述准确候选在 CI 完整成功后发布到 `rc`；工具返回用户当前不可用，未得到明确选择。该结果不是授权，不创建发布 tag、不推 tag、不改 dist-tag，不将讨论期“会准备 Trusted Publisher”当作准确发布授权。

因此当前唯一明确的审批阻塞是真实发布的准确授权。准确提交 CI 已成功；真实发布时仍需重新确认其他前提没有变化。没有通过降低 Deployment 标准、改用本地 tarball 或 dry-run 宣告 complete。

## 获得授权后的后续步骤

1. 重新验证准确提交仍在 main 历史、对应最新 main-push CI 的全部质量/矩阵/聚合项成功、目标版本未发布、依赖版本可用及 Trusted Publisher 的真实 workflow/environment 绑定。
2. 仅为上述准确版本/提交创建不可变包名 tag，按现有 workflow 发布到 `rc`，不使用 token 或绕过 `prepublishOnly`。
3. 从 registry 在独立环境安装准确发布版，再完成对应 Test Spec 的发布后闭环验证及旧全局环境不变检查。
4. 将真实发布与部署证据同步 primary，再由主 Agent 行使已有委托完成旧 Silvermoon 的 submitOuter / acceptOuter。未获得这些事实前，部署 ledger 条目保持未勾选。
