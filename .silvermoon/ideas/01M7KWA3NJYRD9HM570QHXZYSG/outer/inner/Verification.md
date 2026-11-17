# Browser Task 实施候选验证

本文是 [Implementation](./Implementation.md) 的证据索引，按 [接入决定](./IntegrationDecisions.md) 对照 [测试矩阵](./AcceptanceTests.md)。以下为本轮已观察结果及剩余事项，不把 42 个计划 ID 自动标记为全部通过。

## 真实上游与实现范围

- Protocol/Engine 精确 `0.2.1-rc.1`，Builder/Builder CLI 精确 `0.2.1-rc.0`；Node SDK 为 `0.2.0`，仅在 Node 作者或类型引用中使用。
- IPFS Store/Payload 使用配套公共稳定 `0.1.0`，没有增加第二套内容配置。实际浏览器运行模块不注入 Node SDK。
- 新 `run` 与 legacy 根文档 / registry 路径分开；标准 browser Task 不回退到旧 renderer manifest。
- 通用加载、启动上下文、浏览器桥接和 Check 作者入口都位于现有 ipfsaw 包，没有增加 workspace 包。
- 必要的 Node 消费迁移包括新 ESM `main.mjs` 入口以及 Engine 公共 `result` 代替旧 output envelope；既有 Check 领域规则未因此扩展或弱化。

`src/check-task.ts` 是真正默认导出的 `(parameters, context)` 启动函数，复用现有 Check viewer；由官方 Builder 的 browser explicit 模式生成 Task 目录及 CAR。公共声明为：

```yaml
runtime:
  type: browser
entry: main.mjs
```

没有 minVersion 或 `ipfsaw.renderer.json` 冒充；CSS 经 include 收录，作者用相对入口 URL 引用，不假设 Builder 做 CSS import / URL 改写。

## 自动检查与主干整合

主 Agent 在控制请求错误处理复审前独立执行完整 `pnpm check`，退出码 0：

- ipfsaw 121 项测试；statements / branches / functions / lines 为 96.46 / 91.42 / 95.65 / 97.03。
- viewer 40 项测试及其原有 DAG / Markdown / mobile 用例通过。
- Node Check / Builder / SDK 及其他成员检查、类型、lint、格式、覆盖率和 package lint 全部通过。

此后保留并整合 origin/main 的 RC.1 发布、工程简化与新发布门卫。保留包及 CLI 版本 `0.1.0-rc.1`，未发布的新功能不冒充 registry 中已发布 RC.1 的能力；保留主干 rimraf + tsc 命令链，再追加真正生成 browser runtime / Task / CAR 的功能脚本，而非恢复无逻辑包装。

控制请求错误反馈修复和主干整合后，主 Agent 重新执行完整 `pnpm check`，最终退出码 0；ipfsaw **125 项**测试通过，四项覆盖率为 **96.53 / 91.54 / 97.31 / 97.09**，均满足既有 90% 门限。冻结依赖安装也通过。

过程中有两次非通过结果被保留而未隐藏：一处新改文档格式问题经仅格式化该文件后解决；一次 Vitest fork 启动超时导致三个文件未运行及覆盖率失败。未改超时、排除代码或降低门限，原命令隔离重跑 125 项通过，随后最终完整根检查通过。

## 原生浏览器与本地文件预验

主 Agent 用独立创建的受控 local Store 配置、自己编写且不带 `$schema` 的 YAML 和实际 Builder CAR 验证。未读取 / 改写个人配置、未上传或访问历史被排除候选。

本轮初始真实 CAR 根：

```text
bafybeifl7pv4bc7rwrq7tsnjujlzcevsuzzsp6afs52t3stqcljhe52mca
```

这是本轮 Builder 产物身份，不是已发布 renderer CID 或用户公共节点可获取性声明；最终隔离消费者使用的准确候选也携带相同 CAR 根。

| 证据范围 | 实际观察 |
| --- | --- |
| CLI `run --car --document` | stdout 恰一个 listening JSON；原始 YAML 经真实参数契约校验，不需要 registry / `$schema` 选择 |
| CLI `run --cid --document` | 只将相同 CAR 区块导入自己创建的受控 local Store 后按相同根加载；与 CAR 路径展示及交互一致，无远端 fallback |
| Task 完成与应用存活 | 宿主收到结果验证确认并显示 Started 后，仍可点击成员节点，详情与 Parents 正常变化 |
| completed cancel | 点击 Cancel startup 不销毁已经完成启动的页面，状态仍为 Started |
| 独立 close | 点击 Close app 移除 iframe，显示关闭状态；不是修改已完成 Task 的结果 |
| 刷新 | 原生 Chrome 真实 reload 后，history entry 中的会话能力继续有效，新页面可再次启动 |
| 普通保存 | YAML 标题变更后自动进入新 revision，标题更新、选择重置到根节点，符合首版重启应用策略 |
| 参数错误 | 将 specVersion 改为非法值时页面显示参数错误、隐藏旧视图且没有 iframe；恢复文件可继续处理 |
| 桌面 | 原生 Chrome 1280px 宿主 / 1265px iframe，32px 单行树、桌面导航，无页面横向溢出；叶节点不显示 Children，Parents 正确 |
| mobile | 原生 Chrome 390px 宿主 / 375px iframe，默认无内联整棵树；导航为真实 modal，焦点在其中，选节点后关闭并展示详情 |
| 启动中 cancel | 另用官方 Builder 构建带受控延迟的 browser Task；启动中按 Cancel 后显示 cancelled 且移除未交付 iframe；并非用已完成 Task 的 cancel 代替此测试 |
| router 与调用身份 | 延迟 fixture 改为立即返回后，按钮计数可增加，页面内部 hash 导航保留同一 runId，宿主仍为同一 Started revision，不重新调用 Task |
| 控制 RPC 故障 | 真实浏览器将 cancel/close 控制请求模拟为明确 503：cancel 显示未确认且保留应用；close 移除本地页面，但明确提示宿主关闭未确认，绝不显示确认成功 |

截图在会话交付附件 `browser-task-acceptance` 中，不包含文档私密正文或授权 token。原生 Chrome/CDP 操作不是 jsdom；集成浏览器的 opaque iframe 截图限制没有通过放宽 sandbox/CSP 解决。

## Context 与明确限制

类型与实现均不增加 container、assetUrl、onClose。DOM 来自 Task 自己的 browser 环境。启动期间 readContent / resolveContent 使用真实公共 Store，初始能力来自 Bundle 与参数中的真实 ContentRef；解析或遍历得到的内容按作用域授权，逐请求取消传到 Store。

当前 putContent / invokeTask / progress / log / messages 是明确的 `unsupported_capability`，不是空成功。这是首轮宿主能力限制，使用这些能力的通用 Task 不应被宣传为完全可运行。启动完成后调用能力拒绝 run_finished，启动 reader 释放；DOM 的继续存活不依赖启动 signal。

Bundle 与 CAR 使用上游 taskBundleLimits，并遵守更严格 Store 约束；不把旧 renderer 的 16 MiB 限额作为新 Task 协议。真实隔离、入口及 payload 正反例主要在 `task.test.ts`、`task-frame.test.ts` 和 `task-browser.test.ts`，不会把其中受控 DOM 模拟的通过冒充原生浏览器证明。

## 准确候选与隔离消费者

这是新 browser Task 功能的独立验收制品，不是历史被排除目录的复制、重建或替代访问；本次没有访问历史受限候选。

- 文件：会话附件 `browser-task-acceptance/ipfsaw-browser-host-candidate.tgz`。
- 包身份：`@silvermoon-work/ipfsaw@0.1.0-rc.1`，仅本地源码候选，不是宣称已发布版本含新增功能。
- tarball 大小：856,839 bytes。
- SHA-256：`fab2ec25fd0f5b2730fdbb894b0895e18eb250866186aa0877235137a1f2befc`。
- 生命周期 hooks 禁用，仅 pack 一次；对该准确 tarball 的 strict publint 通过。
- 在独立消费者目录以 production-only、offline、ignore-scripts、ignore-workspace 安装，无源工作区链接；只复用已有依赖 cache，没有切换 registry 或公网下载。
- 首次离线安装因消费者所在磁盘的 pnpm 自动工具缓存缺失失败；随后使用当前已经匹配的 pnpm 11.28.12，并显式选择现有 D 盘缓存成功。没有因此升级包管理器或绕过依赖约束。
- 消费目录中的 **72 个 src/dist 文件**与最终工作区逐字节相同；公共 main 导出存在且 import 不注册信号监听器。
- 真实安装 bin 的版本退出 0，用法错误为 JSON ARGUMENT_INVALID / 退出 1。
- 消费者仅从安装包加载 runtime 和随包 Check Task CAR，在原生 Chrome 重做启动后交互、叶节点 / Parents、完成后 cancel、reload 和独立 close，均通过。
- 消费者通过公共 main 的受控 SIGTERM 事件返回 143；返回时 HTTP 端口确已关闭，stdout 只有一个业务 JSON。这是受控 Node 信号事件测试，不冒充所有平台的外部 OS 信号投递证明。

无 scope alias 源码仍由用户另一个仓库 / session 维护。公共 main 直接委派接口未改变，本轮验证的是 scoped 准确候选，不声称已替该仓库发布或完成新 alias registry 安装验证。

## 测试矩阵证据映射与审查结论

| 矩阵范围 | 证据与适用边界 |
| --- | --- |
| E01–E03 | 准确公共版本与真实 browser 声明 / explicit main.mjs；接入决定 D01–D06 与对应测试、原生启动证据 |
| CLI01–CLI06 | 扩展 cli.test.ts、既有 lifetime/bin 测试、两种真实来源、隔离消费 bin 与公共 main 退出 / 流证明；不添加空 server/history/async |
| DOC01–DOC03 | 保留安全解析回归，新 run 不加 schema 选择约束；真实原始 YAML、参数错误与恢复；前端 hash 导航不重启。通用 router 参数不是宿主额外功能，按 D01 留给作者契约 |
| BND01–BND05 | task.test.ts 用官方 Builder 的实际 CAR、同 CID、资源、错误 runtime、坏块 / 缺块、原 import DAG 身份和结果引用；真实 Check CSS 及 CAR/CID 页面 |
| CTX01–CTX03 | 类型检查、task-frame.test.ts、真实 Store 作用域集成；受控 browser 作者明确拒绝出现额外 DOM context 字段并实际完成；不支持能力按文档明确拒绝 |
| SEC01–SEC04 | 保留旧 Host/Origin/资源边界及限制回归，新增 Task 控制认证 / 版本、内容并发 / 独立取消、更严格 reader 和 imports 测试；预算委托官方 Task/Store 验证器，不将每个公共实现细节复制到宿主再测一遍 |
| LIFE01–LIFE06 | 单一完成点 / late complete / signal / 独立 close 用例，真实延迟启动取消、完成后交互与 cancel、关闭、控制失败显式不确定、准确消费者退出与端口关闭 |
| UPD01–UPD04 | 既有文件 / 原子替换 / 错误恢复回归加新 Task 修订与会话用例；原生普通保存与参数纠错。选 D02 重启分支，未实现或宣称应用级 update 通道 |
| VIEW01–VIEW04 | 原 viewer 40 项回归、Task bridge 用例与本轮实际标准 Task 原生桌面/mobile 截图和交互；DOM-only 结果不替代原生证据 |
| COMP01–COMP03 | 选 D03 保留 legacy 分路，旧回归继续通过；COMP02 的破坏性迁移分支不适用，不伪记为通过。准确候选隔离消费者与公开 main 保持一致 |
| QUAL01 | 最终整合后完整根 check、125 项 ipfsaw 测试、原有 90% 四项门限、冻结安装和准确 tarball strict publint；含主干新发布门卫 |

42 个 ID 是验收规格和证据的索引，不等于 42 个新增测试函数，也不意味着每个测试变体都由真实浏览器重复执行。按表区分公开验证器 / 类型 / 单元 / 集成 / 原生页面 / 制品消费者的证明层级，保留其边界。

独立发现的控制错误静默处理已修复，新增四项回归证明确实在修复前失败、修复后通过，并实际注入请求故障复验。没有未报告的功能阻塞；暂不支持的 context 能力、保存时应用状态重置、iframe 不是任意代码绝对沙箱等限制已在使用文档明确说明。

所有 npm / tag / 远端制品发布均未执行。本轮依赖发布通知不授权 ipfsaw 发布；历史受限目录仍未访问。该文件记录实现审查证据，本身不是生命周期 accept 事件。
