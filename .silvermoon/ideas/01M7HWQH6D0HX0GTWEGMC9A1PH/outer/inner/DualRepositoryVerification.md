# 准确双制品联调（2026-11-16）

本文补齐 [Implementation](./Implementation.md) 的 I-S03 / I-AC03，承接前轮 [主包验证](./Verification.md)。当前结论是实施候选具备提交验收条件，不表示已经接受 Implementation / Deployment，更不表示 npm 发布或 registry `npx ipfsaw` 交付完成。

## 仓库、源码与制品身份

重新检查时本机 alias 目录仍缺失、指定远端仍无 HEAD/main；本轮从既定 `silvermoon-work/ipfsaw` 克隆到原定 `D:\Code\ipfsaw`，由独立 subagent 实施，主 Agent 完整复核与独立验证。没有替换既有用户代码，没有把主实现复制进 alias，也没有创建第二份 Idea。

| 项目 | 主包 | alias |
| --- | --- | --- |
| npm 身份 | `@silvermoon-work/ipfsaw@0.1.0-rc.0` | `ipfsaw@0.1.0-rc.0` |
| 源码提交 | `91ae6878561be0809bb5491c53f3aa0b6a5826f4` | `bbd41daf642d7d702547b9bf434291190652a95e` |
| tarball SHA-256 | `766a1fe8db0af60ff00bca5e67a87617551c0d17f55de02232336b45a6994db8` | `c6e4a7f8a05c55205848f94a7b7bcd36cc1f56f44c23ee2c6da953612f4f3293` |
| 状态 | private；沿用前轮同一准确 tarball | private；审查及完整检查后只打包一次 |

alias 源码入口：[本机 bin](D:/Code/ipfsaw/src/bin.ts)、[准确提交 bin](https://github.com/silvermoon-work/ipfsaw/blob/bbd41daf642d7d702547b9bf434291190652a95e/src/bin.ts)；[准确提交测试](https://github.com/silvermoon-work/ipfsaw/blob/bbd41daf642d7d702547b9bf434291190652a95e/test/bin.test.ts) 与 [开发说明](https://github.com/silvermoon-work/ipfsaw/blob/bbd41daf642d7d702547b9bf434291190652a95e/README.md)。该提交已通过普通 Git push 到 alias 主干并验证可达，没有 force 或 release tag。

唯一 alias 运行时代码为 shebang、从主包 `/cli` import `main`、原样传入 `process.argv.slice(2)` 并设置返回退出码；没有库 API、子进程包装、二次 npx、参数改写或重复信号／错误处理。

实际 packed manifest 已从准确 tarball 中提取并检查：唯一运行时依赖仍为 `{"@silvermoon-work/ipfsaw":"0.1.0-rc.0"}`，没有 `file:`、`workspace:` 或机器路径。tarball 仅含五个源码／构建文件、README、LICENSE 和 manifest；未带入开发配置、测试、脚本或主包 tarball。

[双制品源码一致性](./evidence/dual-source-match.json) 记录主包 40 个、alias 5 个 src/dist 文件的逐字节比对与 SHA-256，README／LICENSE 同样匹配；安装真实路径位于独立 consumer 的 pnpm store，而不是 workspace 链接。alias 以 ESM 从自己的安装上下文解析主包 `/cli`，最终解析到该 consumer 中准确主包的同一真实文件。

本机验证输入保留于 `C:\Users\Wei\AppData\Local\Temp\okr-agent-ipfsaw-dual-20261116-v1`，文件名分别为 `scoped-main.tgz`、`ipfsaw-alias.tgz`；这是临时本地路径，不是永久或远端制品地址。

## 质量门禁

开发 Node `26.13.1`、pnpm `11.28.12`。本轮在一小时内重新取得 [官方 index](https://nodejs.org/dist/index.json) 与 [schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)，共同确认最高稳定受支持 LTS；没有抬高消费者最低环境。

- 主仓重新执行根 `pnpm check`，退出 `0`：ipfsaw 83、viewer 40、TypeScript 项目 665 项测试通过；原有 toolchain 的 4 项明确原生平台跳过保持原样。四项质量门限未修改。
- alias 的实施方和主 Agent 分别完成冻结安装与根 `pnpm check`，均退出 `0`：候选 hash、格式、构建、严格类型、type-aware lint、7 项 mock 测试、scripts 一对一及 publint 文件系统检查均通过；statements／branches／functions／lines 均 `100%`，四项阈值明确为 `90%`，包含所有源码。
- alias 本地开发 override 仅在其 pnpm 配置中将准确 semver 解析到已核对 hash 的相对主包候选，锁文件记录相对路径与完整性。新 consumer 自己显式 override 全部主包引用到同一准确 tarball；两份候选真实安装及冻结安装均通过，禁用生命周期钩子。这不是 registry 安装验证。

## 23 组真实 CLI 一致性

[结果](./evidence/dual-cli-result.json) 由两个准确安装包的实际 bin 分别执行，不使用 mock。覆盖根／registry／add 帮助、版本、未知命令、拒绝 stdin 和旧 flag、拒绝 registry 预览选项、非法 Schema/CID、缺文档、空 registry、添加／幂等添加／替换冲突／显式替换／列表／删除／幂等删除、已有坏配置，以及 JSON／YAML 预览。

非预览场景逐字比较 stdout、stderr、退出码；业务输出恰一行 JSON。预览只将每次运行必然不同的回环 capability URL 归一化，其余 readiness 数据、日志与退出行为一致。两种入口均验证：未授权文档 API 为 `403`，就绪 HTTP 可达，取消后端口不可连接；JSON 的 SIGINT handler 返回 `130`，YAML 的 SIGTERM handler 返回 `143`。

Windows 信号验证由自有 IPC 包装器向子进程交付 `process.emit('SIGINT'/'SIGTERM')`；包装器只用于测试。没有把它伪称为 Windows 控制台原生 Ctrl+C 或 Unix OS signal 测试。

## alias 原生浏览器场景

[alias 原生结果](./evidence/alias-native-result.json) 的执行模式为 `installed-alias-bin`：启动准确安装的 alias bin，由其调用准确 scoped 主包，并在 Chrome `157.0.8103.51` 原生 headless 浏览器内验证真实 opaque iframe DOM。没有关闭 sandbox、CSP 或站点隔离。

全部通过：Check renderer 首次加载、保存后标题更新、非法 JSON 的明确错误与旧视图隐藏、同目录原子替换恢复、390×844 移动导航按钮及 dialog、不同 Schema 的独立非 React renderer、renderer 故障与纠错恢复、关闭提示与 HTTP 端口实际释放。两个 renderer 的准确 CID 与前轮一致，使用自建 local Store／文档／配置，没有读取个人配置或上传文档。

截图：[桌面](./evidence/alias-native-desktop.png)、[移动导航](./evidence/alias-native-mobile.png)。当前模型不支持图像输入，Agent 的结论来自真实浏览器 DOM／协议断言，不声称已人工视觉审阅。

## 复现及边界

alias 的 [README](https://github.com/silvermoon-work/ipfsaw/blob/bbd41daf642d7d702547b9bf434291190652a95e/README.md) 提供 hash 核验、准确候选准备、冻结安装与完整检查步骤。隔离消费时必须同时持有上述准确 tarball，并在消费者自己的 pnpm 配置中显式固定全部主包引用，不能假设顶层 file 依赖会自动满足 alias 下层 semver。需要新打包时独立记录新 hash，不能重打包后继续冒用此证据。

过程中的失败没有记成成功：alias 初次包检查误从未导出的 publint package.json 定位 CLI，实施方改用公开 API `pack:false`，warnings／errors 仍失败，之后双方完整 check 通过；主 Agent 初次一致性脚本误用 CJS resolver 检查 import-only `/cli`，改为真实 ESM 上下文解析后全部通过，产品入口及制品没有为此改写。没有为了通过检查移除测试、弱化覆盖率或修改制品。

两仓当前源码与本地候选保持 private，没有 npm 发布、release tag、dist-tag 变更或远端 tarball/CAR 上传。alias 暂未建立可依赖准确主包 registry 交付的自动发布／CI；本地根检查不冒充准确 SHA 远端成功 CI。未来发布须另行完成依赖可用性、准确版本／提交授权、远端 CI 与 Trusted Publishing 等要求。

本次完成 I-S03 / I-AC03；所有 D-* 项仍保持未完成，待 Implementation 的明确验收后按准确 Deployment revision 推进，不以本次实施预演自动完成部署门限。
