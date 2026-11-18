# RC 发布与部署验证记录

## 授权与真实发布

用户在 2026-11-18 明确授权发布上一轮已指定的 RC，并下载、安装到本地继续验证；随后明确要求沿用现有发布流程。本次只发布：

- npm 包：`@silvermoon-work/silvermoon@0.1.0-rc.0`；
- 准确源码提交：`353fe73d26fd90414a1df4e14a2a1e1b6e3f97b3`；
- 不可变 tag：`@silvermoon-work/silvermoon@0.1.0-rc.0`；
- Check CID：`bafybeig2er4ote3f7phu3nyi7tih3jzjtmcfjzdmvm3qgodltv4gyxkupe`。

发布前重新确认该提交在 primary 历史内，[准确提交的 main-push CI](https://github.com/silvermoon-work/okr-agent/actions/runs/44137586803) 的 Quality default、Node.js 22.15.0 / 24.11.1、Release verification (v1) 及其聚合步骤全部成功；目标版本和 tag 不存在，运行时依赖已有可用 registry 版本。

[真实 Trusted Publishing](https://github.com/silvermoon-work/okr-agent/actions/runs/44210568719) 成功。准确提交的现有 `publish-npm.yaml` 在 `npm` environment 中构建选中包及依赖，由已发布的 `publish-gate` 通过后执行原生 pnpm 目录发布。未改 workflow，未绕过生命周期，未使用 npm token。仅增加 `rc=0.1.0-rc.0`，`latest` 仍为 `0.0.0`；未发布其他依赖或旧 unscoped alias。

标准 `AGENTS.md` 的准确 tarball 规则与项目此前批准的目录发布实验存在文档冲突；项目指导已明确不再保留 exact-tarball 验证，本次用户又明确确认沿用现有流程。此记录不擅自修改标准文件。

## Registry 下载与独立本地安装

本次有效 NRM registry 为 taobao，即 `https://registry.npmmirror.com/`；沿用实际配置，未使用 `--registry`，未切换为历史记录中的腾讯镜像。镜像最初返回 E404，向同一镜像请求同步后，准确版本端点及刷新后的包元数据均已包含 RC。

从该镜像下载真实发布制品，不使用 workspace、源码构建或发布前本地 tarball 替代：

- 下载大小：229143 bytes；
- SHA-1：`2e46e23ef372637a723224c90d09a69692fdda22`；
- integrity：`sha512-7X2KKnjXgIA6B4hLUAqlqhrwzs+iL8dnnyXQd1ERnoZI3GJL7srgZoHvM7mGyvIXR2gTcdDQTZPmFtsRl1EtdQ==`。

下载字节与 registry 的两项摘要均一致。元数据存在 SLSA v1 provenance 引用；镜像的 attestation 内容端点返回 404，因此这里只确认 provenance 元数据存在，不声称完成签名的独立密码学验证。

本地保留于 `~/.local/share/silvermoon/0.1.0-rc.0/`，其中包含原始下载及独立 pnpm 安装。安装使用精确 pnpm `11.28.12`、`pnpm install --ignore-scripts --strict-peer-dependencies`；发布包的 `workspace:` / `catalog:` 已转换为 registry 版本。安装后的包名、版本及 Check CID 正确，真实路径不在本仓库。

直接运行：

```sh
~/.local/share/silvermoon/0.1.0-rc.0/node_modules/.bin/silvermoon --version
```

输出 `0.1.0-rc.0`。这不是全局切换；生命周期仍由旧 CLI 维护。

## 已通过的发布后验证

- 使用精确开发 Node `26.13.1` 和 pnpm `11.28.12` 完整执行根 `pnpm check` 成功，未修改源码、降低阈值或排除失败用例。此前最新 main 的 ipfsaw 远程 CI 失败仍是历史事实，本次本地成功不改写该远程成绩。
- 发布版 `--version`、主帮助及创建、snapshot、event append 子命令帮助可运行。
- 在独立规范化真实路径、用户 home、个人 skill 链接及自有 bare primary 的 fixture 内，真实 Engine 执行随包 CAR；`check --worktree --json` 为 pass，离线 documentation 非空且可读。
- 发布版 `create-idea --language en-US --json` 创建合法 16 位 ID，内容语言正确覆盖项目和旧 `version: 1` 用户语言配置。
- 发布版 `list-ideas --all --json` 返回新 Idea 的 `requirements`，明确 `fresh: false`；故意放入的无效旧归档不被解析。
- 安装与验证前后，旧全局 `silvermoon` 的命令路径、版本、入口 SHA-256、个人 skill 链接与内容摘要、以及本仓库旧 Idea 的 Git 树一致。测试没有覆盖旧配置、旧 Idea 或 skill；随后只按旧流程更新本部署记录和执行清单。

最初 fixture 使用 macOS `/var` 别名，被项目根防重定向检查拒绝；改用 `realpath` 后不再出现。该项属于测试路径修正，不将它误报为产品缺陷。

## 未通过：配置并存与真实生命周期闭环

### 配置格式兼容缺口

在本仓库使用发布版运行 `check --worktree --audience agent`，明确失败：

```text
primaryRepository must be owner/repository, never a URL or credentials.
```

本仓库合法旧 v2 配置使用无凭据的 `https://github.com/silvermoon-work/okr-agent.git`，旧 CLI 检查仍成功；新版只接受 `owner/repository`。这与既定配置并存方向及包文档的兼容描述不一致。未通过改写共享配置来掩盖问题。

### Worker 缺少 Git 执行上下文

独立 fixture 使用合法的新配置、自有 bare primary 和进程级 SSH shim，仅将固定测试仓库映射到本地。相同环境下，直接执行 `git -c core.sshCommand=ssh fetch --no-tags -- origin refs/heads/main` 成功；发布版 `whats-next --json` 通过 Device 后，在真实 Engine 的 repository 检查失败：

```text
Host key verification failed.
fatal: Could not read from remote repository.
```

已核对安装的 `@silvermoon-work/task-engine@0.2.1-rc.1`：其 `type-supervisor` 创建 Worker 时显式设置环境，仅包含空 `NODE_OPTIONS` 和可选 Windows 系统目录，不继承 `PATH`、`HOME` 或 `SSH_AUTH_SOCK`。Silvermoon 的 Git 适配在 Worker 内扩展的是该空环境，未使用宿主的受控 Git 上下文；因此 CLI 主进程可用的传输没有传入 Check。没有修改 Engine、安装包、全局 SSH 配置或 Worker 隔离来制造通过。

因此 T-16 的发布版五次确认、实现/部署证据和终态检查没有完整通过；此前候选 smoke 和单元测试不能代替本次发布后结果。

## 当前状态与恢复条件

发布及本地独立安装已经完成，不再以发布授权为 blocker。真实闭环仍有上述缺口，Idea 保持 `deploying`；不记录 `submitOuter` / `acceptOuter`，不宣告 complete。

后续需在实现阶段修复无凭据旧 primary URL 的兼容及宿主到 Check 的显式、受控 Git 执行上下文，补针对性回归，再为新准确版本与提交完成检查和发布授权。不能通过放宽 Worker 隔离、修改旧共享配置、复用旧证据、移动现有 tag 或覆盖已发布 `rc.0` 绕过问题。本次授权不自动扩大为另发 RC 或正式替换全局 CLI。

## RC.1 修复后交付准备

用户随后明确要求修复后发布新 RC，并确认业务 Target 使用 `userHome + repoRoot + idea`，不是通用 Git 环境集合。两个缺口已按[Inner 决议](inner/rc0-resolution.md)重新实施；新的[实施证据](inner/implementation-evidence.md)覆盖真实 CLI / Engine / CAR 的五次确认、同步、两阶段证据、终态与修订回退。旧配置不变，Target、操作策略和必要运行上下文分离，未修改 Task Engine。

新候选为 `@silvermoon-work/silvermoon@0.1.0-rc.1`，准确源码提交 `938751db3cc15fabccf156ad60825f02e842eccb`，Check CID 为 `bafybeiag6a6uymuygy22oghwhmththrrxrrfqhkwf6gpzju3yh2btw5le4`。根 `pnpm check` 成功，38 个 CLI 测试与 1 个作者包测试通过；原实施验收没有复用，新 Inner revision 已按既有门限委托重新 submit / accept。

[该准确提交的 main-push CI](https://github.com/silvermoon-work/okr-agent/actions/runs/44219803173) 已全部成功：Quality default、Node.js 22.15.0 / 24.11.1、Release verification (v1) 及其 Confirm required checks succeeded 步骤均 success。候选源码已经在 primary，后续提交只包含生命周期记录和交付准备，不改变该发布对象。

已将准确版本与完整提交的发布确认提交交互工具；工具返回用户不可用，未提供明确选择。用户对“修复后发新 RC”的方向授权已记录，但不将工具不可用推断为仓库所要求的准确版本 / SHA 确认。因此本轮尚未创建或推送 `rc.1` tag，未发布或从 registry 安装 `rc.1`；`rc.0`、旧全局 CLI 和个人 skill 未改变。

恢复条件为确认上述准确发布对象，然后重新核实 CI、main 祖先关系、版本/tag 未占用和现有门禁要求；通过既有 Trusted Publishing workflow 发布到 `rc` 后，再从当前 NRM registry 下载、校验、独立安装，使用同一真实 CLI 回归运行发布制品。现有 `SILVERMOON_TEST_BIN` 测试入口仅选择独立已安装 CLI，不替换 CAR Worker 或改变业务逻辑。Deployment ledger 继续保持未完成，直到新版本的真实外部验证成立。
