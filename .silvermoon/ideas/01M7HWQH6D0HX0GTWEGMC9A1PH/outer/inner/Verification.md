# ipfsaw 接手验证（2026-11-16）

本文支持 [Implementation](./Implementation.md)，只记录当前实施证据；不表示 Implementation / Deployment 门限接受，不授权 npm、tag 或远端制品发布。

## 候选身份与环境

- 基线为合并后的主干 `a6e40c600e8d2002fd2b928b660cde8b43c8451c`，加本提交的 MIME 白名单与浏览器启动器修复；没有更改已接受的 Ideal World。
- Windows，Node `26.13.1`，pnpm `11.28.12`。本次开始时机器为 Node `26.13.0`，首轮基线检查使用校验官方 SHA-256 的临时 `26.13.1`；用户升级后，最终源码及制品检查均使用当前全局 `26.13.1`。
- 官方 [发行索引](https://nodejs.org/dist/index.json) 与 [支持周期](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) 在本次检查时共同确认 `26.13.1` 为最高受支持稳定 LTS；未改开发版本或消费者最低环境。
- 私有主包 `@silvermoon-work/ipfsaw@0.1.0-rc.0`，生命周期钩子禁用后只打包一次；隔离消费重复验证始终使用同一 tarball，没有重打包或改写。
- tarball SHA-256：`766a1fe8db0af60ff00bca5e67a87617551c0d17f55de02232336b45a6994db8`。
- 本机保留位置：`C:\Users\Wei\AppData\Local\Temp\okr-agent-ipfsaw-handoff-20261116-v1\silvermoon-work-ipfsaw-0.1.0-rc.0.tgz`。这是临时本地路径，不是远端制品地址或永久保留承诺。
- 本次候选由当前源码新建；未读取或复用旧会话曾被内容排除的候选 / 消费目录。

## I-S01 / I-AC01：契约、内容读取与 MIME 边界

`mime` 原来查询普通对象的继承属性，导致 `payload.__proto__`、`payload.constructor` 等未知扩展可以越过白名单。修复只允许白名单自身属性；5 项新增用例先在旧实现全部失败，再通过 helper、文件验证、pack 和真实 UnixFS load 四个入口验证拒绝。已有合法 MIME、manifest、CID / assets、Store 配置与所有权回归仍通过。

[制品一致性记录](./evidence/artifact-result.json) 逐项记录隔离安装包的 40 个源码与构建文件 SHA-256，并与本次工作区逐字节比较一致；README 与 LICENSE 同样一致。安装结果的真实路径位于独立消费目录的 pnpm store，而不是 workspace 链接。manifest 的身份、准确版本、private 状态及 catalog 转换已验证。

修复源文件的 Git blob：

- `packages/ipfsaw/src/bundle.ts`：`c3a709946acbdb8bd88714f3f8ee675a01b2de44`。
- `packages/ipfsaw/src/cli.ts`：`be511d2df7678b9e352f3b5f14f0f7545fd3099a`。

## I-S02 / I-AC02：持续预览与资源回收

浏览器启动器保留平台 opener 与原生 timeout / AbortSignal。若普通终止后 1 秒仍未关闭，则升级为 `SIGKILL`，仍等待 `close`，关闭时清理自有计时器和监听器。新增受控、跨平台回归先复现旧实现永不升级，再验证 timeout、取消、预先取消、grace 内关闭、多次错误与资源清理。Unix 忽略 TERM 的系统进程情景由受控进程 mock 证明，本机 Windows 未伪称执行了 Unix 原生测试。

使用 Chrome `157.0.8103.51` 原生 headless 浏览器，经 CDP 读取真实隔离 iframe 的 DOM；没有关闭 sandbox、CSP 或站点隔离。对隔离安装的**同一准确 tarball**调用其真实 `main`，未替换为源码入口。使用本次自建 local Store、配置、文档与 renderer CAR；没有读取个人内容配置或上传文档。

[原生结果](./evidence/native-result.json) 记录：

| 场景 | 实际结果 |
| --- | --- |
| 首次加载真实 Check viewer | `Revision 1`，iframe 中出现新建文档标题，非宿主 fixtures 下拉框 |
| 原文件保存 | `Revision 2`，iframe 标题更新 |
| 非法 JSON 中间版本 | `role=alert`，给出 `1:2` 语法位置，旧视图隐藏 |
| 同目录原子替换并纠错 | `Revision 4`，恢复当前标题 |
| 390×844 移动视口 | 导航按钮可见，点击后 `aria-expanded=true`、原生 dialog 打开 |
| 切换到另一 Schema | `Revision 5`，独立非 React note renderer 展示新文本 |
| renderer 受控异常 | 显式 renderer 错误，旧视图隐藏；纠错后可恢复 |
| 关闭 | 安装包 `main` 返回 `143`，浏览器显示连接已关闭，原 HTTP 端口不可连接 |

关闭测试通过自建 IPC 包装器向进程交付 `process.emit('SIGTERM')`，验证真实入口的信号处理与资源释放；不把它写成 Windows 控制台原生 Ctrl+C 或 Unix OS signal 测试。帮助、版本、registry add/list/remove、幂等结果、无效参数 / 文档错误的单行 JSON 与退出码另经准确安装包 bin 的真实子进程验证。

- Check renderer CID：`bafybeic4n2qhjpk4ygo54gqz5qoeng3fhp2i4y5l2rw7szrxwclj7gceri`。
- 独立 note renderer CID：`bafybeibr43ykc5s7hg454e4wy4b73hizxjagiezusp7nbwqsha6thwtvqy`。
- 原生截图：[桌面](./evidence/native-desktop.png)、[移动导航](./evidence/native-mobile.png)。截图由 Chrome 捕获；Agent 的当前模型不支持图像输入，因此结论基于 DOM / 协议断言，而非声称已人工视觉审阅。

## 质量门禁与复现入口

最终根 `pnpm check` 退出 `0`：格式、依赖序构建、类型、typed lint、覆盖率、13 项 release regressions、npm 包 lint 与脚本检查均完成。ipfsaw 83 项、viewer 40 项、TypeScript 项目 665 项测试通过；原有 toolchain 的 4 项显式原生平台跳过保持原样，未减少测试或调整门限。

ipfsaw 覆盖率：statements `96.97%`，branches `91.76%`，functions `100%`，lines `97.84%`；均通过现有四项 `90%` 全局门限。

源码回归入口：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @silvermoon-work/ipfsaw exec vitest run --root . --config ../../vitest.config.ts test/bundle.test.ts test/cli.test.ts test/lifetime.test.ts
pnpm check
```

准确制品的基本复现入口（先核对上述 SHA-256；消费目录应是新的自有临时目录，manifest 固定 `packageManager: pnpm@11.28.12`）：

```powershell
pnpm --dir packages/ipfsaw --config.ignore-scripts=true pack --out <new-candidate.tgz>
# 新生成 tarball 的身份必须独立记录，不能假定其 hash 等于本次证据。
pnpm --dir <consumer> add <exact-candidate.tgz> --ignore-scripts
node <consumer>/node_modules/@silvermoon-work/ipfsaw/dist/bin.js --help
node <consumer>/node_modules/@silvermoon-work/ipfsaw/dist/bin.js --version
```

原生场景可按 [包 README 的受控本地步骤](../../../../../packages/ipfsaw/README.md#受控本地首次运行powershell) 创建独立 Store、Check / note CAR 与文件入口，再逐项执行上表操作。此次自动化是一次性 CDP 验证，不是已接入默认 CI 的跨平台浏览器套件。

验证过程中的非成功结果也保留边界：

- 初次 CDP 脚本未附加 Chrome 的跨进程 opaque iframe，DOM 查询为空；宿主已回报 Revision 1。修正验证脚本的 target/session 路由后成功，未更改产品隔离策略。
- 隔离消费目录初次由无项目 manifest 的全局 pnpm `10.22.0` 安装；补入准确 packageManager 后，非 TTY 重建依赖链接被 pnpm 中止。只对本次自建目录使用 `CI=true`，随后 pnpm `11.28.12` 冻结安装与供应链校验通过；最终证据不采用早先安装结果。
- 安装后第一轮 bin 帮助检查曾超过一次性脚本的 15 秒期限，未宣称成功；相同已安装制品的独立直跑随后为 `1.18s`，源码入口为 `0.51s`，重跑全部制品检查通过。冷启动超时的具体原因未确证，未通过修改产品超时掩盖。

## I-S03 / I-AC03：前轮交接缺口

前轮观察到本机 `D:\Code\ipfsaw` 不存在；对 `https://github.com/silvermoon-work/ipfsaw.git` 执行 `git ls-remote ... HEAD refs/heads/main` 成功但无匹配 refs。因此前轮没有可核验的 alias 提交或准确 tarball，I-S03 / I-AC03 当时保持未完成，未追加 `submitInner` 或 `acceptInner`。

用户随后要求继续推进，本轮已从指定空远端恢复原定独立工作区、完成最小薄入口与准确双制品联调。当前完成结果及证据由 [Dual repository verification](./DualRepositoryVerification.md) 承接；该补充不改写前轮事实，也不以实施预演自动完成后续 D-* 项。

本次没有 npm 发布、release tag、远端 CAR 上传、registry alias 验证或准确 SHA 远端 CI 成功声明。
