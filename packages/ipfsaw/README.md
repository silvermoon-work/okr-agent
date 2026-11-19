# ipfsaw

`@silvermoon-work/ipfsaw@0.1.0-rc.2` 发布候选提供标准 browser Task 的
`run --cid/--car --document` 入口，同时保留既有 YAML/JSON 到不可变 renderer
绑定的 legacy 预览。它不是编辑器，不执行 Node Worker Task，
不自动安装 renderer，不上传文档。该包是已登记的 npm 交付项，仅通过固定
发布流程、按准确提交与版本授权发到 npm `rc` 标签；未发布前不代表 registry
上的任何版本或 `npx ipfsaw` 已可用。独立 alias 的发布与验证不属于本包。

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
ipfsaw run (--cid <bundleCID> | --car <localCAR>) --document <YAMLorJSON>
       [--data-dir <path>] [--no-open]
       [--ipfs-gateway <url>] [--content-data-dir <directory>]
ipfsaw <document> [--data-dir <path>] [--no-open]
       [--ipfs-gateway <url>] [--content-data-dir <directory>]
ipfsaw registry add <schema-uri> <cid> [--replace] [--data-dir <path>]
ipfsaw registry list [--data-dir <path>]
ipfsaw registry remove <schema-uri> [--data-dir <path>]
```

`run` 是下面说明的 **RC.2 功能**；其余是保留的 legacy 入口。
每个 source/document 选项只能出现一次。`run`
不接受旧 renderer，也不在校验失败后自动回退。

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
`data.url` 是不带访问凭据的 `http://127.0.0.1:<port>/`：
服务运行期间，可在本机不同浏览器、新标签页或无痕窗口中直接打开、复制和刷新，
不依赖 URL fragment、history、cookie 或浏览器存储。
正常预览没有常驻宿主标题栏；加载时显示状态，成功后让应用占满窗口，
错误或断连时重新显示提示。Check
viewer 的标题下方，有序检查点侧栏与详情填满剩余高度。
默认展示任务总览，仅在该处展示根任务说明与全局 Target 参数列表 / Schema；
`#checkpoint=<id>` 直接进入检查点目标、规则与成功 Context 输出文档。
独立「任务总览」操作清除 checkpoint 参数，不占用检查点 ID（包括 `overview`）。
当前未发布 Spec 仍为 v1.0 / `urn:ipfsaw:check-bundle:1`，
根 `description` 必填以说明任务检查内容与范围，`parameter` 仅包含 `schema`。
所有层级都不支持 `preconditions`，旧字段作为未知字段拒绝，不映射为假设。
检查点必需的 `output.description` 与可选非空、字段名唯一的 `output.fields`
仅是安全 Markdown 文档，不验证、序列化或执行成功输出；
旧 CAR 不会自动获得新视图，需重建并使用新的准确制品。
最后一个预览页面的 SSE 连接断开后，CLI 等待 3 秒重连窗口，再关闭 HTTP、
自己持有的 Store/会话/opener 并正常退出（0）；清理失败仍为非零。
刷新期间重连会取消退出，仍有其他标签页/浏览器连接时不退出。
首次页面连接前持续等待，因此 `--no-open` 或自动打开失败不会让服务提前退出。
离开检测依据连接，不是浏览器进程；断网或浏览器丢弃后台页面也可能触发退出。

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
与 Task RPC 使用同源 fetch 和非保密的 `X-IPFSAW-Client: browser` 请求标记，
不使用 Authorization 或链接 token。自定义请求头使其他来源的浏览器脚本必须先预检；
宿主拒绝外源及 opaque Origin 的文档/RPC 请求和 CORS 预检，
只为批准的不可变 assets / Task runtime 保留 opaque iframe 所需的 CORS。
这是信任本机用户和进程的预览服务，不提供用户身份认证或同机进程隔离；
持有本地地址的同机进程可以读取预览。不要向不信任的本机用户开放敏感文档。
只提供当前批准 bundle 的精确 assets，无任意 CID/file proxy、目录列表。
最多 8 个 SSE 连接，慢客户端的有界输出队列超限会断开。
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

## 标准 browser Task（RC.2）

### 版本、构建与启动

使用准确公共 Protocol `0.2.1-rc.1`、Builder/Builder CLI `0.2.1-rc.0`、
Engine `0.2.1-rc.1`、IPFS Store/Payload `0.1.0`。SDK `0.2.0` 只供类型引用和
既有 Node 作者使用，**不会导入浏览器运行时**；Node Engine 不执行 browser Task。
本宿主不是把任务提交给 Node
Engine 的客户端，不提供 server/history/queue/async 空命令。
Engine CLI `0.2.1-rc.0` 的 run 命令形状是对照，而非本包运行依赖。

```powershell
pnpm exec turbo run build --filter=@silvermoon-work/ipfsaw
```

这同时构建 `dist/task-runtime.js`，并将 `src/check-task.ts` 中真正的默认启动函数
预打包静态依赖，再交给官方 `buildTaskBundle` 的 browser explicit 目标及
`encodeTaskBundleCar`。产物为：

- `packages/ipfsaw/dist/check-task/task.yaml`、`main.mjs`、`resources/check.css`；
- `packages/ipfsaw/dist/check-task.car`、准确根 `check-task.cid`；
- `packages/ipfsaw/dist/check-task.json`：TypeScript 项目有序工程检查设计稿（未实现），带 v1
  `$schema`。

这是标准 Task CAR，不包含
`ipfsaw.renderer.json`，不依赖旧 mount/update/dispose 对象。
无远端上传、发布或个人 Store 修改。示例复用共享 Check viewer 及其严格 Spec
v1／安全 Markdown。
Check Task 共享一个 Target，检查点按数组顺序定义为通过继续、不通过即停止；
这里只展示定义，不执行 Check。尚未发布的 Spec 保持 v1 迭代；旧树／图结构明确拒绝，需更新并重建准确 CAR，
不会自动重解释历史文档或更新旧 renderer CID。

运行前选择自己的受控 `TASK_CONTENT_CONFIG`，不要为试跑重写个人配置。下面只在
**不存在的新目录**创建独立 local 配置，使用完恢复原环境变量；不会向 gateway/Kubo 回退：

```powershell
$demo = Join-Path (Get-Location) ".browser-task-preview"
if (Test-Path $demo) { throw "Choose a new isolated demo directory." }
New-Item -ItemType Directory $demo | Out-Null
$content = Join-Path $demo "content"
[IO.File]::WriteAllText(
  (Join-Path $demo "task-content.json"),
  (@{ backend = "local"; dataDir = $content } | ConvertTo-Json),
  (New-Object Text.UTF8Encoding $false)
)
$previousContentConfig = $env:TASK_CONTENT_CONFIG
$env:TASK_CONTENT_CONFIG = Join-Path $demo "task-content.json"
node packages\ipfsaw\dist\bin.js run --car packages\ipfsaw\dist\check-task.car --document packages\ipfsaw\dist\check-task.json --data-dir $demo --no-open
# Ctrl+C 后恢复；如此前未设置该变量，Remove-Item Env:TASK_CONTENT_CONFIG
$env:TASK_CONTENT_CONFIG = $previousContentConfig
```

从 stdout 的唯一 JSON 读取 URL，浏览器打开。`--car` 先由公共 CAR
reader 完整校验，
仅在本次宿主内持有，不偷偷持久化或上传到配置的内容 backend。
`--cid <准确根CID>`
通过同一个验证器加载同一 DAG；其块须已存在于明确配置的共享 Store，
或由用户明确配置的 gateway 获取。不会因为刚用 `--car`
打开就声称共享 Store 已被导入。
两条路径都不要求 registry，也不借文档 `$schema` 选包。`--data-dir`
仍只管 app 配置，
`--content-data-dir`/`--ipfs-gateway` 原样使用公共 Store
helper 的覆盖/backend 语义。

### 作者与参数契约

browser Bundle 必须真实声明 `{type:"browser"}`、入口 `main.mjs`；
Builder 使用
`source.mode:"explicit"`（非 Node 的默认值），保留作者 exports，不注入 SDK。
本宿主选择的入口契约是 ESM **默认导出函数**，签名：

```ts
import type { TaskCallback } from "@silvermoon-work/task-sdk";
const start: TaskCallback<Parameters, Result> = async (parameters, context) => {
  context.signal.throwIfAborted();
  const main = document.createElement("main");
  document.body.append(main);
  main.textContent = "App started";
  return { started: true }; // 必须符合该 Bundle 的 resultSchema
};
export default start;
```

`Parameters`/`Result`
由作者的真实契约定义，不是宿主新增通用类型。静态依赖需完整 bundle，
CSS/字体/图片通过 Builder include/binary；Builder 不负责 CSS
import 或资源 URL 重写。
浏览器作者可用原生 `import.meta.url`
相对定位已批准 Bundle 的资源，或通过 context 读取内容；
没有 `container`、`assetUrl`、`onClose`，没有隐藏的替代 context。

`--document` 的 YAML/JSON 值经共享的 UTF-8/有限数/alias/深度/展开与 1
MiB 安全检查，
再按真实 Task parameters/payload 契约校验（与 Engine
parameters 输入规则一致，包括显式
`{data,cidPaths}` payload）。不会自动套 `{document,route}`。当前上游 parameters
Schema
要求对象根；这是协议约束，而非旧 `$schema` 分流约束。不需要
`$schema`，除非作者 schema 要求。
前端导航不重新启动 Task，也不应把导航位置放进 Task 参数。
宿主提供有界的 `ipfsaw-navigation/v1` 展示层桥接：
活动的 opaque iframe 发送 `ready` 获取外层 URL fragment，
发送 `{type:"navigate", hash:"#...", replace:boolean}` 更新同源预览页的历史；
宿主以 `{type:"state", hash}` 回复，并同步前进／后退和 hash 变化。
消息均带 `protocol`；宿主校验活动 frame 的 source、opaque origin、
fragment 形状和 4096 字符上限，只允许修改 fragment，不接受路径或外部 URL。
应用应校验父页 source/origin，且不能在 fragment 中放凭据或私密文档。
这不是 TaskContext 能力，也不改变 Task 输入、结果或 legacy renderer ABI。
内置 Check viewer 用它保存
`#checkpoint=<Checkpoint ID>`，普通应用不使用则行为不变。

参数和结果使用公共 payload 编解码；只有声明的 ContentRef 才提供引用能力，普通 CID 字符串
不会变成授权。结果按官方 resultSchema 验证；函数、DOM、函数 handle 和不合法引用不能作为结果。
不支持的消息能力明确拒绝，而非丢弃消息或绕过 messageSchema。

### 实际 context 能力与预算

所有字段/方法遵守真实 TaskContext；以下为宿主实现范围，不把类型共享当实现证明：

| 成员                                     | 实际行为                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| runId / scope / startedAt / bundle       | 每次启动独立身份、作用域、开始时间和已验证 Bundle 根                                                                 |
| signal                                   | 仅未完成启动的取消；完成后不拿它关闭 app                                                                             |
| readContent                              | 公共 Store 的真实文件流/目录条目；受启动 reader 预算约束                                                             |
| resolveContent                           | 公共 Store 路径解析，返回真实 CID 并授权该结果                                                                       |
| 内容作用域                               | 初始只允许 Bundle 根与 parameters 中真实 ContentRef；解析结果和目录条目可继续读取；逐请求 AbortSignal 取消传到 Store |
| putContent / invokeTask / progress / log | 明确拒绝 `unsupported_capability`，无写入、子任务或假日志回执                                                        |
| messages                                 | 尝试迭代明确拒绝 `unsupported_capability`，不存在静默空 inbox                                                        |

启动完成后调用能力方法拒绝
`run_finished`，reader 被释放；应用 DOM/副作用继续存在。
内容在私有 MessagePort→宿主同源 RPC 中传递；opaque
iframe 不直接访问宿主文档/RPC。
这里只做有界、完整读取再交给浏览器流，不承诺跨 RPC 的逐块零拷贝。

Bundle 逻辑总量/单文件各 **64 MiB**、256 文件、512 路径、CAR **72 MiB**，
均来自官方 `taskBundleLimits`，再受更严格的调用方 Store 限制约束。
Store 自身块数/块大小/深度/读取预算继续生效；不把旧 renderer 的 16
MiB 冒充 Task 协议。
每个启动最多 8 个并发内容请求，最多 8 个独立页面会话；控制取消有界处理。
文档仍限制源与展开 JSON 各 1 MiB；结果遵守上游默认 payload 预算。

保留 loopback Host/Origin、sandbox、最小 CSP、精确批准 assets 和有界重读；
runtime 模块与不可变 assets 可供 opaque
iframe 以 CORS 加载，文档/RPC 不开放跨源权限。
只有 Check 现有 AJV 动态 schema 编译需要的 iframe `unsafe-eval`
被保留，宿主页面不开放 eval。
不把文档、参数、秘密或能力写进 URL/日志；
本机 URL 不带访问凭据，可在本机其他浏览器中直接打开。

### 就绪、保存和关闭

CLI 只输出一次
`{ok:true,data:{state:"listening",url,bundleCid,runtime:"browser"}}`，
仅说明 HTTP 可连接，**不说明浏览器已执行 Task**。页面先显示 launching，默认导出完成且
结果通过宿主验证后隐藏加载提示、只显示应用；后续故障走页面与 stderr，不再追加 stdout 结果。
失败退出 1，SIGINT/SIGTERM 为 130/143；帮助/版本仍为文本。
`--no-open` 保留前台 HTTP，等待用户首次打开 URL；
最后一个页面离开并超过重连窗口后同样自动退出。

真实内容变化后立刻隐藏旧页面，在新 iframe 进行一次新的启动；普通保存、原子替换、
暂时缺失、非法文件及纠错恢复由有界重读处理。只提交最新 revision，不让旧成功/错误覆盖新内容，
稳定坏输入不重复拉包或刷屏。同内容保存不重复启动。
保存仍会重置应用内存状态；不是永久更新协议，legacy renderer 仍走自己的 update。
外层 URL fragment 保持不变，内置 Check
viewer 因而能在更新、刷新后恢复所选检查点；
不存在的 ID 回到当前有序数组的第一项。侧栏宽度和滚动位置不持久化。

不提供容易误解为停止服务的 **Cancel startup / Close app** 宿主按钮。
关闭最后一个页面后由 CLI 回收整个预览；未完成的启动仍受超时及取消信号控制。
启动返回不销毁 app、不返回可序列化函数 handle、不保持 Task 永久 running。
CLI
Ctrl+C 关闭自己持有的 HTTP/Store/会话/opener 并等待资源回收，是关闭宿主/apps，
不是取消已经完成的 Task。销毁 realm 不等于承诺任意插件副作用全部可回滚。

新回归在 `test/task.test.ts`、`task-frame.test.ts`、`task-browser.test.ts`
与扩展的
`cli.test.ts`；复用既有 viewer
有序列表／格式校验／导航／Markdown/mobile 回归。DOM-only 测试不替代父会话的
真实桌面/mobile、准确 CAR/CID 和制品消费者验收；没有把历史制品或旧 RC 的通过当新 Task 证明。

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
