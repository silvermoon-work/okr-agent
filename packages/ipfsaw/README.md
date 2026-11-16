# ipfsaw（本地开发候选）

`@silvermoon-work/ipfsaw@0.1.0-rc.0` 是私有候选：监听一份 YAML/JSON，
用用户明确绑定的不可变 UnixFS renderer 展示。不是编辑器或 Task 执行器，
不自动安装 renderer，不上传文档。尚未发布 npm；不代表 registry 上的
`npx ipfsaw` 已可用。独立 alias 的发布与验证不属于本包。

## 受控本地首次运行（PowerShell）

在仓库根使用锁定 Node / pnpm：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @silvermoon-work/check-bundle-viewer build
pnpm --filter @silvermoon-work/ipfsaw build
pnpm --filter @silvermoon-work/ipfsaw demo

$env:TASK_CONTENT_CONFIG = (Resolve-Path packages\ipfsaw\.ipfsaw-demo\task-content.json).Path
node packages\ipfsaw\dist\bin.js packages\ipfsaw\.ipfsaw-demo\check.json --data-dir packages\ipfsaw\.ipfsaw-demo\state --no-open
```

`demo` 只创建新的 `packages\ipfsaw\.ipfsaw-demo`，存在则拒绝覆盖。
它以通用 UnixFS importer/CAR writer 打包真实 Check 浏览器构建与不同
`urn:ipfsaw:note:1` 的极小 renderer；经公开 Store 验证并导入单独的本地内容目录。
不会读取个人内容配置或访问 gateway/Kubo。保留 `check.car` / `note.car`、
准确 `.cid`、源文档和两份配置；不是预置宿主 fixtures 下拉框。

从 stdout 的唯一 JSON 结果读取 `data.url`，在浏览器打开。URL 中的 fragment
是本次运行能力，勿公开分享；日志不会打印它。URL 表示 HTTP 已就绪，不保证
浏览器 renderer 已完成渲染。在原编辑器中保存、原子替换或纠正
`check.json`，页面持续更新；也可把同一文件替换为 `note.json` 的内容，
证明宿主按 Schema 分流，不依赖 Check/React。Ctrl+C 等待释放资源。
结束后移除本次设置的 `TASK_CONTENT_CONFIG`，不要改写个人配置。

## CLI

```text
ipfsaw <document> [--data-dir <path>] [--no-open]
       [--ipfs-gateway <url>] [--content-data-dir <directory>]
ipfsaw registry add <schema-uri> <cid> [--replace] [--data-dir <path>]
ipfsaw registry list [--data-dir <path>]
ipfsaw registry remove <schema-uri> [--data-dir <path>]
```

根 / registry 无参数显示帮助；所有 callable 节点支持 `-h/--help`，
根支持 `--version`。不接受 stdin、`--json`、旧草案 `renderer`、
`--config` 或 `--content-gateway`。Registry 不访问内容 Store，
也不接受预览专属选项。

应用目录优先级：`--data-dir` > `IPFSAW_DATA_DIR` >
`~/.silvermoon.work/ipfsaw`；路径按 cwd 转为绝对路径。配置在其
`config.json`，缺文件等于空绑定，已有坏配置不能静默重建或用参数掩盖。
只支持：

```json
{
  "version": 1,
  "openBrowser": false,
  "renderers": {
    "urn:ipfsaw:check-bundle:1": "<准确 renderer 根 CID>"
  }
}
```

示例 CID 是占位，实际首次运行用 demo 输出；Schema 按完整 URI 精确匹配，
不抓取其网络地址。配置启动时固定快照；改变绑定须重启。不同 CID
必须 `--replace`，相同绑定 / 删除不存在项返回明确的幂等结果。写入以
受控同目录临时文件原子替换，失败保留旧文件并回收临时文件；不提供并发写入合并。

`--data-dir` 是 **ipfsaw 应用状态目录，不是内容 Store**，不会覆盖或借用
Task Engine 的实例目录。IPFS 完全复用公开
`@silvermoon-work/ipfs-store/node` 的 `createConfiguredContent` /
`readContentConfiguration` 及 `TASK_CONTENT_CONFIG`、既有平台路径、
backend 和 gateway 策略。`--ipfs-gateway` 映射既有 `gateway` override，
`--content-data-dir` 映射既有 `dataDir` override；原 helper 仍校验原配置。
没有额外的 ipfsaw IPFS 设置或公网 fallback。

### 输出和退出

除帮助 / 版本文本外，每次 business 调用 stdout 恰有一行 JSON：

```json
{ "ok": true, "data": { "version": 1, "renderers": [] } }
```

- 预览：`data = {state:"listening",url,schema,rendererCid}`，仅一次；
  后续状态走页面和 stderr，不是连续 JSON 流。
- Add：`data = {schema,cid,changed:boolean}`。
- Remove：`data = {schema,removed:boolean}`。
- List：`data = {version:1,renderers:[{schema,cid}]}`，按 Schema 排序。
- 失败：`{ok:false,error:{code,message}}`，用法错误码 `ARGUMENT_INVALID`，
  配置 `CONFIGURATION_INVALID`，文档 `DOCUMENT_INVALID`，冲突
  `REGISTRY_CONFLICT`，清理 `CLEANUP_FAILED`，其他 `OPERATION_FAILED`。

成功 / 帮助为 0；用法、启动或清理失败为 1；SIGINT 为 130，
SIGTERM 为 143。已输出就绪结果后发生清理失败只写 stderr 并非零退出，
不会再输出第二个 envelope。浏览器自动打开是尽力操作，失败明确警告，
保留 `data.url`；`--no-open` 优先于 `openBrowser`。不需要交互提示。

## Renderer ABI / 信任边界

目录根 `ipfsaw.renderer.json`：

```json
{
  "protocol": "ipfsaw-renderer/v1",
  "entry": "renderer.js",
  "styles": ["renderer.css"]
}
```

`styles` 可为空。所有 ESM chunks、CSS、图片、字体必须在同一根；
路径不可绝对、穿越、反斜杠、URL、query 或编码路径。入口为 JS/MJS，
styles 为 CSS；资源仅接受明确支持的 MIME 扩展名。不可运行时安装 npm
或依赖 CDN。浏览器 ESM 默认对象：

```ts
{
  mount(container: HTMLElement, document: unknown, context: {schema: string; revision: number}): void | Promise<void>;
  update(document: unknown, context: {schema: string; revision: number}): void | Promise<void>;
  dispose(): void | Promise<void>;
}
```

库导出 `packRenderer(files)`、`loadRenderer(store,cid,signal?)`、
`importRendererCar(callerOwnedLocalStore,car)`。它们是有界通用目录/CAR
能力，不使用 Task 元数据。Import 仅接受显式调用方拥有的 local Store，
不会向 Kubo 上传。Load 经 Store 验证完整 DAG 与文件数据，关闭自己的
reader scope，**不关闭调用方 Store**。CLI 关闭自己创建的 Store，
不停止 Kubo daemon，不删缓存或他人 pins。

文档源 / 展开 JSON 为 1 MiB、manifest 64 KiB、renderer 逻辑内容与
Store reader 各 16 MiB、文件数 2048；更严格的 Store 限制继续生效。
文档必须有字符串 `$schema` 的对象根；拒绝多文档 YAML、未知标签、
非有限数、循环 aliases、过量展开或深度。定期有界重读支持普通保存、
原子替换、暂时缺失和快速写入，不依赖跨平台不可靠的 inode watcher。
加载期间再次核对当前内容，错误状态隐藏旧视图并可纠错恢复。

HTTP 只绑定 `127.0.0.1` 随机端口，校验 Host / Origin；文档 SSE
要求每次运行能力的 Authorization，opaque iframe 无权读取此接口。
只提供当前批准 bundle 的精确 assets，无任意 CID/file proxy、目录列表。
最多 8 个授权 SSE 连接，慢客户端的有界输出队列超限会断开。
Renderer 在 `sandbox="allow-scripts"` 且无 same-origin 的 iframe 中运行，
经来源校验与私有 MessagePort 收到数据；Node 从不 import renderer JS。
ESM/CSS/fonts 的 CORS 仅开放不可变 assets，不开放文档 API。
CSP 限制网络、表单及资源；加载 / 协议 / 响应超时明确可见。
仅 opaque renderer 的 script CSP 允许 `unsafe-eval`，因为复用的 Check
AJV 校验器要动态编译用户的参数 Schema；宿主不允许 eval，
不会为此改变 Check 原有语义校验。该权限不开放远端脚本或文档 API。
更新未完成时替换 iframe，防止旧异步 renderer 覆盖当前内容。
替换时立即隐藏旧上下文，给异步 `dispose` 最多 500 ms 回应时间，
随后销毁；最多保留 4 个待销毁上下文。页面退出不能保证任意插件完成清理。

CID 只证明身份，不证明可信。显式绑定授权执行该 JavaScript；
iframe 不是对任意恶意代码的绝对沙箱或强制终止保证，浏览器及操作系统
仍是信任边界。不要绑定不信任的 renderer。宿主停止时断开连接，
浏览器显示服务已关闭，不再声称旧内容是当前成功结果。

## 薄入口稳定接口

```ts
import { main } from "@silvermoon-work/ipfsaw/cli";
// 无 import 副作用；负责 stdio、信号、清理；返回退出码，不主动 process.exit。
process.exitCode = await main(process.argv.slice(2));
```

`main(argv?: readonly string[]): Promise<number>` 不变。主包 bin 和独立 alias
均直接委派，不开子进程包装、不二次 npx。消费方必须使用最终准确主包
tarball / hash；未经授权不 publish、tag 或宣称 registry alias 已验证。

## 验证

```powershell
pnpm --filter @silvermoon-work/ipfsaw typecheck
pnpm --filter @silvermoon-work/ipfsaw lint
pnpm --filter @silvermoon-work/ipfsaw test-coverage
pnpm --filter @silvermoon-work/check-bundle-viewer test-coverage
pnpm check
```

测试使用仓库内受控临时目录或调用方 CAR block port，不读个人 Store /
registry 配置，不访问公网 gateway。
