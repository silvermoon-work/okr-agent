# 实施验证记录

## 当前执行边界

主 Agent 依据 ideal 层[委托决定](ideal/execution-decisions.md)负责审阅与门限判断；subagent 负责新 CLI 与 Check 作者包的实现。旧全局 Silvermoon 不替换，本 Idea 不提前迁移。

本文件记录实际验证，不以日志条目替代旧 ledger 的验收，也不将待实现能力描述为已完成。

## 工程基线

- 开发 Node `v26.13.1` 与根 `.node-version` 一致，pnpm 为根指定的 `11.28.12`。
- 包操作前有效 registry 为本机 NRM 配置的腾讯镜像；未用 `--registry` 改写，未改变本机 registry。
- 原根 lint 的 6,720 个错误来自已被 Git 忽略的 `.test-work` 生成目录。ESLint / Prettier 已与既有生成目录边界对齐，不删除他人临时文件，不排除受控 source/test，不降低规则。
- `pnpm exec eslint eslint.config.js` 与 `pnpm exec prettier --check eslint.config.js` 通过。
- `pnpm exec turbo run test-coverage --filter=!@silvermoon-work/silvermoon --filter=!@silvermoon-work/check.silvermoon --concurrency=1` 成功，14 个既有任务命中有效缓存；此结果只证明旧工作区基线，不代表新包测试通过。
- 基线提交 `075e265e276489d346278f394c563256bcd1b685` 的 [main-push CI](https://github.com/silvermoon-work/okr-agent/actions/runs/44128959343) 已成功，含 Quality default、Node.js 22.15.0 / 24.11.1 以及 Release verification (v1)。它证明既有代码与生成目录边界修正通过 CI，不作为尚未提交的新包候选的准确 SHA 发布证据。

## 外部交付前提

GitHub 仓库 `npm` environment 存在。其存在不证明 npm 侧 Trusted Publisher 已绑定。

首次通过腾讯镜像查询 scoped 包得到 E404；收到用户“Trusted Publisher 配置好了”的更新后再次查询，已可见 `@silvermoon-work/silvermoon@0.0.0` placeholder，版本历史含 `0.0.0-stage` 与 `0.0.0`。用户明确报告已配置 Trusted Publisher；真实 OIDC 绑定仍须以授权发布时的结果验证，不能由 placeholder 可见推断其准确性。

当前没有准确版本与提交的独立发布授权。实际发布仍须准确提交 main-push CI、匹配的 Trusted Publisher 和显式准确授权；未满足时保持 Deployment 未完成，不推发布 tag。

## 新候选验证

实现 subagent 已提交工作树候选，主 Agent 启动独立只读审查，不以作者自己的完成宣称替代审阅。

- 候选 CLI 为 `@silvermoon-work/silvermoon@0.1.0-rc.0`；Check CAR CID 为 `bafybeigsrap6t2l42w2qav24dahj76qzudxvfukxpgwfu6sifrwhrzqgfq`。最终交付以提交后的实际 CAR 为准，源变化需重建并更新绑定。
- 主 Agent 独立执行根 `pnpm check` 成功，所有根阶段完成；末段 Turbo 17 个 build/package-lint 任务使用有效缓存。候选日志位于本次 session 的 `silvermoon-candidate-root-check.log`，不是远程 CI 发布凭据。
- 直接运行候选独立 bin，帮助和版本正确；`create-idea`、`event append`、`check` 帮助均可执行。
- 在当前仅使用旧全局安装的真实项目中运行候选 `whats-next`，正确停在新设备 skill 未注册的前置缺口，没有绕过旧安装去推进 Idea，整体/问题 ContentRef 从 CAR 离线呈现可读。
- 作者报告 35 项针对性测试通过，CLI statements/branches/functions/lines 分别为 96.90/91.31/97.51/97.70%，私有 Check 作者包 100%；主 Agent 的根 check 亦包含相同覆盖门禁。独立审查和隔离端到端验收尚在进行，不提前将 ledger 全部勾选。

## 独立安装与全流程验证

主 Agent 将该候选以关闭生命周期脚本的方式打包，在 session 独立目录安装准确 tarball，未使用 workspace link，未修改全局 CLI/skill。安装实际解析到 registry 依赖，帮助、版本及离线 CAR / ContentRef 真实 Engine 报告可读。

使用独立用户 home、个人 skill junction、候选 bin，以及自有 bare primary 的受控 Git 传输，实际通过：

1. 设备与项目整备；
2. 16 位 ID 创建、内容语言 override 和 scaffold 明确 fallback 提示；
3. 五次分别编辑未提交内容、读取当前 revision、sign off、同步同内容；
4. 实现证据追加与同步；
5. 部署证据追加与同步；
6. 同一 Idea 最终 Check Pass；
7. 再修改已签 Technical 补充文档，立即回退到 technical。

受控传输只将测试进程的 Git SSH 调用映射到自有 bare 仓库，不修改生产代码、机器 Git/SSH 配置或远程真实仓库。候选工具的真实设备、文件、Git、Events、Engine 与 CAR 路径均执行；这不是发布后验证，不能代替 T-15 / T-16。

## 独立审查与修复要求

独立只读 code-review 找到三项实际问题，已要求实现 subagent 修复并增加回归：

- 共享用户配置应接受旧 `{version: 1, preferredLanguage}`，不能逼用户改配置后破坏旧工具；
- Project 草稿分流应使用与 Idea 相同的有效历史 subject，防止实现证据提交后误阻断部署证据草稿；
- inventory / replay 不应分别把 working tree 冒充 primary 或因缺上下文永久显示 synchronization，应基于真实本地跟踪快照和有效 subject 形成一致状态，仍不 fetch。

上述初次安装及 smoke 只证明当时制品，修复后必须重建、重新安装验证准确新制品；不复用旧 tarball 宣称修复后的验证通过。

## 修复后最终实施验收

三项审查问题均已修复并增加针对性回归，独立 reviewer 复查相关改动和测试，确认全部解决，未发现紧密相关的新回归。

最终候选 CAR CID 更新为 `bafybeig2er4ote3f7phu3nyi7tih3jzjtmcfjzdmvm3qgodltv4gyxkupe`。CLI 版本仍为尚未发布的 `0.1.0-rc.0`。

- 主 Agent 再次完整执行根 `pnpm check` 成功，所有阶段通过，日志为 session 的 `silvermoon-reviewed-root-check.log`。
- 36 个 CLI 测试与 1 个作者包测试通过；CLI statements/branches/functions/lines 为 96.99/91.80/97.60/97.77%，作者包均为 100%，没有降低全局 90% 阈值或排除新 source。
- 主 Agent 重新打包修复后的准确源，在独立目录更新安装新 tarball，无 workspace link；完整 CLI / Engine / offline CAR 闭环再次通过。
- 新 smoke 使用旧版 `version: 1` 用户语言配置，设备和项目均 ready，内容语言 override 正确。
- 每次未同步签字后，`whats-next`、`event replay`、`list-ideas` 一致显示 synchronization。
- 写入尚未提交的实现/部署证据后，真实 `whats-next` 分别保持 implementation / deployment，不因祖先 subject 上下文丢失误阻断。
- 五次独立签字、相同内容提交/同步、两阶段证据、最终 Pass、随后 Technical 支持内容修改导致回退，全部通过。日志为 session 的 `silvermoon-reviewed-smoke.log`，不是发布后测试。

主 Agent 据此完成本轮 Implementation 审阅；Deployment 的真实 registry 发布与发布版验收仍需独立前提，不能由上述本地结果推断完成。
