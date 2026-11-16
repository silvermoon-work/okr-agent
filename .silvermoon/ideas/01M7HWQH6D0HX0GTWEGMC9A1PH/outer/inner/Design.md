# ipfsaw 首轮设计

本设计由主 Agent 按明确委托收敛，供两个实现方遵守；实现发现不兼容或无法证明的部分需上报，不得静默另造协议。命令完整契约见 [CLI Spec](./CliSpec.html)。

## 仓库与包身份

| 所在仓库 | 包与责任 |
| --- | --- |
| 当前 `silvermoon-work/okr-agent` | `packages/ipfsaw` 中的 `@silvermoon-work/ipfsaw` 主实现；现有 Check viewer 的 renderer 适配与兼容迁移 |
| 用户提供的 `D:\Code\ipfsaw`，remote 为 `silvermoon-work/ipfsaw` | npm 名 `ipfsaw` 的薄入口，只依赖主包，不复制宿主、协议、存储或配置逻辑 |

首轮候选主包版本为 `0.1.0-rc.0`，可先保持 private，通过本地 pack 验证。两边必须遵守各自仓库的质量及发布要求；所有 npm / tag / 远端制品发布另需准确授权。

## 薄入口的稳定公共接口

主包提供 ESM 导出 `@silvermoon-work/ipfsaw/cli`：

```ts
export function main(argv?: readonly string[]): Promise<number>;
```

不传 argv 时使用当前进程用户参数。它负责主 CLI 行为、stdout/stderr、SIGINT/SIGTERM、中断与资源清理，返回退出码；不会在 import 时启动 CLI。

主包 bin 和 alias bin 均只做等价委派：

```js
#!/usr/bin/env node
import { main } from "@silvermoon-work/ipfsaw/cli";
process.exitCode = await main(process.argv.slice(2));
```

无额外 argv 重写、二次 npx、子进程包装或重复捕获。alias 依赖主包的准确版本 `0.1.0-rc.0`；版本不存在于 registry 时只做本地准确 tarball 联调，不假装已发布。

## 主链路

```text
指定 YAML / JSON 文件
  -> 有界读取、解析并验证 JSON 兼容数据
  -> 读取根 $schema
  -> 在本次运行的已验证配置快照中查准确 CID
  -> 经共享 IPFS Store 读取固定 renderer manifest 与资源
  -> 回环 HTTP 宿主 / 隔离浏览器上下文
  -> 展示当前 revision；保存后重读并更新
```

首轮接收带字符串 `$schema` 的对象根文档。缺 `$schema`、数组 / 标量根、多文档 YAML、非 JSON 值、循环别名等必须明确报错，不自行推断文档类型。是否扩展这些形式留给后续场景。

Schema URI 按完整字符串精确匹配，不自动访问该地址、不解析 `latest`、不模糊归一化尾斜杠。Renderer 只接收解析后的文档和必要展示元数据，不得到原文件内容以外的本机能力。

首轮使用明确的有界保护：源文档 1 MiB、manifest 64 KiB、renderer 逻辑资源及保留内容 16 MiB、文件数 2048。共享 Store 更严格的限制继续生效，不扩宽它。所有限制都有边界反例；不把这些值伪称为 Task 协议上限，也不增加调参命令来绕过失败。

## Task Engine 风格与本地 registry

用户补充要求 data dir、IPFS gateway 等选项与实际 Task Engine 保持一致。已核对本工作区安装版本的 `task-engine --help`、`server start --help` 和 config 帮助，现将早期 CLI 草案作以下修订；公共 `/cli` 入口与 renderer ABI 不变：

- 绑定管理命令改为 `registry add/list/remove`，因为管理对象是 Schema / CID 对应关系，不是 renderer 的运行、打包或发布。
- `--data-dir` 选择 ipfsaw 自己的应用数据目录，不能被解释为共享 IPFS Store 的内容目录。默认 `~/.silvermoon.work/ipfsaw`，优先级为显式选项、`IPFSAW_DATA_DIR`、默认值。
- 既有 Task 风格的 `--ipfs-gateway` 用于缺失内容块读取；`--content-data-dir` 单独选择 local 内容目录。前者替代早期草案的 `--content-gateway`。
- 所有业务结果默认 stdout 单个 `{ok:true,data}` 或 `{ok:false,error:{code,message}}` JSON，stderr 仅诊断 / 日志；帮助与版本为 stdout 文本例外。无需 `--json` 或其他格式开关。用法错误使用 `ARGUMENT_INVALID` 并退出 1，与实际 Task Engine 对齐；不再使用早期草案的退出码 2。
- 预览成功数据为 `{state:"listening",url,schema,rendererCid}`；只声明 HTTP 就绪。绑定列表数据为 `{version:1,renderers:[{schema,cid}]}`，按 Schema 排序；添加结果含 `schema/cid/changed`，移除结果含 `schema/removed`。未修改结果为明确的 false，而非假装发生修改。

早期 `renderer ...`、`--config`、`--content-gateway` 和 `list --json` 只是未发布设计草案，不需要为其增加兼容别名。此处复用的是命名、语义与 I/O 风格，不引入 Task Engine 的常驻后台 Server 模型。

## 本地配置

ipfsaw 配置只包含版本、renderer 绑定和浏览器交互偏好：

```json
{
  "version": 1,
  "openBrowser": true,
  "renderers": {
    "urn:ipfsaw:check-bundle:1": "<准确的 renderer 根 CID>"
  }
}
```

示例 CID 是占位，不是实际制品。配置位于所选 ipfsaw `--data-dir` 中的 `config.json`。该目录只承载 ipfsaw 的绑定及交互设置，不复用 Task Engine 实例目录，也不接管 IPFS 数据。使用正常平台路径函数解析相对路径；空 / 非法目录参数或环境变量明确报错，不回落到其他目录。缺配置文件视为空绑定；已有非法文件不得静默重建或被参数掩盖。

预览启动时固定一份配置快照。修改 renderer 绑定后需重新启动预览，不在运行中暗中升级代码。文档 `$schema` 改变时可以在该快照内重新选择 bundle；没绑定则展示明确错误。

IPFS 配置完全交给现有 `createConfiguredContent` / `readContentConfiguration`，遵守 `TASK_CONTENT_CONFIG`、既有平台路径及 backend 规则。`--ipfs-gateway` 传给现有 helper 的 gateway override，`--content-data-dir` 传给其 local dataDir override；ipfsaw 的 `--data-dir` 绝不能传成内容目录。已有非法配置或 backend 混用仍由共享机制拒绝，不接受 ipfsaw 配置中的第二套 IPFS 键。关闭自己创建的 Store，不停止用户的 Kubo daemon。

绑定添加先验证 Schema URI 与根 CID，不接受 CID 后拼接任意 path。已有不同 CID 需要 `--replace`；相同绑定为明确无修改的幂等结果。移除不存在的键同样明确报告无修改。配置以受控临时文件原子替换，失败保留旧文件，不动源文档。

## Renderer bundle v1

目录根有 `ipfsaw.renderer.json`，不使用 Task 的 `task.yaml`：

```json
{
  "protocol": "ipfsaw-renderer/v1",
  "entry": "renderer.js",
  "styles": ["assets/renderer.css"]
}
```

`entry` 是浏览器 ESM，`styles` 可为空数组。其余 JS chunks、字体和图片等依赖必须在同一不可变根中，按相对路径加载，不运行时安装 npm 包或依赖外部 CDN。manifest 及资源路径不得使用绝对路径、反斜杠、穿越片段或远端 URL。缺文件、错误 MIME、内容预算、错误 CID 或错误协议均显式失败。

使用通用 UnixFS 目录 / CAR 能力处理自包含交付物；需要的通用 pack / import 适配可作为主包库能力或内部构建工具，不为填充命令树而提前增加发布命令。只在受控本地 Store 验证，不擅自向用户已有远端节点上传制品。

浏览器 entry 默认导出对象：

```ts
interface Renderer {
  mount(
    container: HTMLElement,
    document: unknown,
    context: { schema: string; revision: number },
  ): void | Promise<void>;
  update(
    document: unknown,
    context: { schema: string; revision: number },
  ): void | Promise<void>;
  dispose(): void | Promise<void>;
}
```

此对象在 renderer 自己的浏览器上下文中调用，不由 Node import；宿主使用版本化消息传入数据，不能跨 origin 直接访问对象。加载、ready、update、error 与 dispose 要带 revision，过期请求不得覆盖较新的状态。实现若采用返回 handle 的等价 API，必须先向主 Agent 提出契约修订，不让主包与首个 renderer 各猜一套。

## 浏览器与本机边界

推荐专有 iframe 上下文和私有 MessagePort 握手；不同时给同源第三方内容开放 scripts 与 same-origin。检查消息来源 / 当前窗口、协议、形状和 revision，不广播文档。

Renderer 不得到宿主 token、Store 或任意文件读取 API。宿主仅暴露当前文档及批准 bundle 的 assets，禁止路径穿越、任意 CID 代理和目录列表。回环绑定仍需核验 Host / Origin，并限制跨站读取；可使用本次运行的随机能力 token，不能写入源文件或普通日志。

若 iframe 使用 opaque origin，ESM / CSS / fonts 的 CORS 必须仅为不可变公共 assets 放行，不能顺带放开文档 API。CSP 限制代码和资源来源；错误清楚展示。CID 表示身份，不是安全或可信证明，映射安装是用户明确授权；不得宣称 iframe 能强杀任意 JS 或保证所有浏览器行为。

## 文件更新与退出

监听是变化提示，不是完整快照证明。覆盖普通保存、原子替换、连续写入、暂时缺失、空 / 非法中间版本以及监听错误；有界重读并使用单调 revision。旧异步读取 / renderer 回应不能盖住新版本。

启动错误直接非零；运行中的文档错误由页面与 stderr 显式展示，允许编辑器纠错恢复。旧内容若保留必须明确标为过期，不能显示为当前成功结果。首次就绪 URL 只表示 HTTP 入口可达，不谎称浏览器已完成渲染。

Ctrl+C / SIGTERM 停止新更新，取消在途操作，等待并释放自己拥有的监听、HTTP、消息与 Store。清理故障保留并报告，不早退宣称完成，不删除共享缓存 / 他人 pin。

## Check renderer 的兼容迁移

首轮 Check 文档标识采用 `urn:ipfsaw:check-bundle:1`。现有 `CheckBundleSpec` 与校验 schema 增加可选且值明确的根 `$schema`；旧无标识数据在直接 React 使用中继续有效，通用 CLI 则要求标识以选择 renderer。

不静默剥离 `$schema` 来绕过严格校验；JSON Schema 自身的 `$schema` 仍表示其方言，不与输入文档的应用路由混为一谈。Check renderer 继续执行原 DAG 校验与既有 UI，不复制到通用宿主。另用不同 Schema 的最小 renderer fixture 验证通用派发。

## 双仓验收与发布边界

主实现会话提供准确版本、公共 `/cli` 接口和主包 tarball；alias 会话可先用明确标注的 stub 测委派，但最终必须用该 tarball 进行真实入口验证。不得使用 placeholder 依赖成功安装的假象来关闭门限。

本地消费测试可同时安装主包与 alias 的准确 tarball，满足未发布的精确依赖。`npx ipfsaw` 从 registry 下载的全新机器体验，须在两包分别获准发布后另行证明，本轮不得宣称已完成。
