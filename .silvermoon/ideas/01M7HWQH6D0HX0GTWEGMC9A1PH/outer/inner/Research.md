# ipfsaw 调研

## 结论

首轮可复用现有 IPFS Store、CLI 基础设施与 Check viewer，但还没有通用 renderer 包协议和真实 YAML/JSON 文件入口。不能只把现有 mock 宿主换个命令名就宣称完成。

以下是静态接口 / 源码调研，不是 renderer 打包、真实内容获取、隔离或持续预览已通过的证据。本轮没有读取用户的内容配置文件或上传文档。

## 仓库内已验证事实

| 证据 | 事实与影响 |
| --- | --- |
| [Builder CLI](../../../../../packages/check-task-builder/src/cli.ts) 的 `createConfiguredContent` 调用与 `finally` 中的 `close` | 有可复用的显式宿主入口及所有权模式；不要在新工具中复制 Store 配置解析 |
| [Builder bin](../../../../../packages/check-task-builder/src/bin.ts) | 已有 SIGINT / SIGTERM、AbortController、退出码与监听清理模式 |
| [Check Spec](../../../../../packages/check-bundle-viewer/src/spec.ts) | 当前数据根只有 `specVersion/name/root/checkers`，严格禁止额外字段；直接加 `$schema` 会被拒绝，必须做明确兼容迁移 |
| [Viewer exports](../../../../../packages/check-bundle-viewer/src/index.ts) | 已有校验器与独立 React 组件，可作为 renderer 内部实现，不等于已有通用入口 |
| [Mock app](../../../../../apps/check-bundle-web/src/app.tsx) | 当前仅切换内置 fixtures，无本地文件加载、IPFS bundle 或监听机制 |

## 安装的共享包接口

核对版本为当前 lockfile 安装的公开依赖，没有安装或升级依赖：

- `@silvermoon-work/ipfs-store@0.1.0-rc.3` 的 `/node` 导出 `contentConfigPath/readContentConfiguration/createConfiguredContent`。
- 默认配置路径服从 `TASK_CONTENT_CONFIG`；否则 Windows 使用 LocalAppData 下的 TaskContent 配置，其他平台使用现有 task-content 配置路径。精确规则直接交给 helper，不在 ipfsaw 复制。
- `readContentConfiguration` 验证原文件及合并值，不能通过 overrides 掩盖原文件错误；本地 backend 有现有默认内容目录，Kubo 使用其既有配置。
- Store 公共接口包含 `read/readContent/resolveContent/prepare/close`，以及受所有权约束的内容写入 / 保留接口；`IpfsStore.fromClient` 可支持测试用受控 block port。
- `@silvermoon-work/task-builder@0.2.0-rc.4` 的 `encodeTaskBundleCar` 会读取并验证 `task.yaml`，执行 Task 协议的文件与 imports 校验，**不是任意静态站点目录的 CAR 编码器**。
- `@silvermoon-work/ipfs-payload@0.1.0-rc.0` 提供带 CID 引用的 JSON / IPLD payload 编解码，不是静态 assets 的通用目录打包器。

实现 renderer 打包时，应使用合适的通用 UnixFS / CAR 能力并验证 manifest 与资源，或提出共享层公开端口缺口；不得复制 Task 打包器、伪造 task.yaml、规避 Task 校验，或把未打包目录标成 CID 制品。

## Task Engine 命令风格的补充调研

用户明确要求与 Task Engine 对齐后，通过本工作区依赖执行帮助命令（不是启动 Server / Task，也没有读取个人配置）：

- `task-engine server start --help`：`--data-dir` 是实例目录，默认配置 `server.dataDir` 或 `~/.silvermoon.work/task-engine`；`--ipfs-gateway` 读取缺失 CID 块，未设置时无公网兜底；`--content-data-dir` 是另一个选项。不可把 data dir 与 content data dir 混同。
- `task-engine config set/list --help`：显式参数、用户配置、产品默认的优先级；变更不自动修改已经运行的 Server。
- 根帮助声明业务结果 stdout 单个 JSON、stderr 日志，无格式切换。故 ipfsaw 不再照早期 Builder 草案提供 `list --json` 或纯文本业务结果。
- 有意输入一个不存在的命令，观察到业务错误为 `{ok:false,error:{code:"ARGUMENT_INVALID",message:...}}`，进程退出 1。探测没有提交任务或初始化自己的内容服务。

ipfsaw 的 registry 维护 Schema / CID 对应关系，采用 `registry add/list/remove`；它不是 npm registry，也不是 Task Engine 配置或 IPFS 节点管理的替代品。详细修订只在 [Design](./Design.md) 与 CLI Spec 中维护，不改变已接受的通用预览目标。

## 浏览器边界
核对 MDN：

- [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)：不授予 `allow-same-origin` 会形成特殊 origin；同源嵌入同时开放 scripts 与 same-origin 会削弱 sandbox。新窗口或导航也需要单独处理。
- [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#security_concerns)：需要核对发送者及消息形状；已知目标时使用明确 origin，不能对任意窗口广播文档。

因此 renderer 代码不应被 Node import / 执行，也不应直接得到本机文件系统、IPFS 配置或宿主 API token。iframe / CSP / 私有 MessagePort 方案仍须实测 ESM、CSS、字体和图片路径及通信边界，不能以“有 CID”或“有 iframe”宣称任意代码安全。

## 持续预览边界

核对 [Node.js fs.watch 官方 caveats](https://nodejs.org/api/fs.html#caveats)：

- Windows 移动 / 重命名被监听目录、删除目录，与普通文件修改不是同一种事件。
- Linux / macOS 的 inode 监听可能在删除重建后仍指向旧 inode。
- `filename` 不保证总是提供。

所以验收必须包括编辑器的原子替换、短暂删除、连续快速保存及无效中间版本；不能把一次事件等同于写入完成，也不能无条件依赖回调文件名。具体采用父目录监听、重读 / 重挂或受控轮询由实现以跨平台测试证明。

## 交付边界

`npx ipfsaw` 首先解析无 scope 的 npm 包名；给 scoped 包设置同名 bin 不会自动建立 registry alias。用户已提供独立 alias 仓库。主包 / alias 本地 tarball 联调可以先做，但主包精确版本未发布前，不得声称全新机器已能从 registry 正常运行该 alias。

## 剩余实施风险

1. 通用目录 / CAR 打包的精确公共依赖与验证实现，需要在不复制 Task 运行时的前提下完成。
2. 隔离浏览器的 assets / ESM / 字体 CORS 与 CSP 必须有真实浏览器证据。
3. Check `$schema` 标识与旧无标识文档的兼容，需要显式测试，不能静默剥离未知字段。
4. 源文件错误、过期 renderer 更新和关闭失败不能回落成貌似成功的旧视图。
5. 双仓联调依赖主包真实 tarball；stub 只能证明 wrapper 委派，不能替代整体交付验证。
