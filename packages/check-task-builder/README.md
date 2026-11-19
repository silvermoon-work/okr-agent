# Check Task Builder

当前工作树配套 Task Builder/Builder CLI `0.2.1-rc.0`、
Protocol/Engine `0.2.1-rc.1` 和 Node-only SDK `0.2.0`：
新生成模板锁定该 Builder CLI，新 Node 构建入口为 ESM `main.mjs`，
Engine snapshot 直接提供 `result` payload。源码集成与 smoke 已按该公共接口更新；
历史 npm/CAR 不重写，旧 `worker.cjs` 的加载兼容由上游保留。

把 Check 项目只读文件树转换为标准 Task Builder 输入，再复用
`@silvermoon-work/task-builder@0.2.1-rc.0`
编译、绑定、校验和编码 CAR。不复制上游编译器，不生成编辑器类型文件，不保留完整中间项目。

## CLI

```sh
check-task-builder init text-check
cd text-check
pnpm install
pnpm typecheck
pnpm build
```

```text
check-task-builder init <directory> [--package-name <name>] [--task-name <name>]
check-task-builder build [build-file] [--out-dir <directory>] [--no-car]
  [--content-gateway <url>] [--content-data-dir <directory>]
```

`init` 创建实际读取 `assets/expected.txt` 并判断输入文本的可编辑项目。输入
`{"text":"hello"}` 通过，`{"text":"other"}`
正常不通过。目标目录必须不存在且父目录存在；不交互、不安装、不覆盖。模板固定本包/SDK版本，并显式声明
`task-builder-cli@0.2.1-rc.0` 开发依赖； `pnpm car` 调用上游 CLI，本 CLI
**没有** `car` 命令。

```yaml
# check.build.yaml
name: Text check
runtime:
  minVersion: 22.15.0
source:
  entry: src/main.ts
  contract: src/contract.ts
include:
  - from: assets/**
    to: resources/
binary: []
outDirectory: dist/text-check
```

可选 `references: references/idea` 选择相对配置所在目录的安全子目录；
默认值为 `references`。该字段只由 Check Builder 使用，不传给上游 Task Builder。

可选 `spec: ../../docs/my-task.yaml` 启用 Task
Spec 驱动文档；不提供时保持手写文档行为。
Spec 为 `$schema: urn:ipfsaw:check-bundle:1`、`specVersion: "1.0"`，
包含 `name`、必需的非空根 `description`、全局 `parameter: {schema}` 和有序
`checkpoints: [{id, title?, description, instructions, rules, output}]`。
根 `description` 写整个 Task 的自然语言目标与范围；Checkpoint 的
`description` 简述本步检查什么、保证什么；必填、非空的 `instructions`
以 Markdown 独立编写给 Agent 的材料准备、review、事件记录和失败迭代指示，
可含原样保留的 JSON 代码块，不会自动执行；`rules: [{code, description}]`
是唯一验收列表；
`output: {description, fields?: [{name, description}]}`
只记录成功 Context 值的用途和边界，
不是输出 JSON
Schema 或运行时验证。fields 仅用于对象输出，若提供必须非空且名称唯一。

Spec 路径相对构建配置目录，以所提供文件树根为边界归一化：
允许树内的 `../../docs/...`，拒绝越界、绝对路径、URL、反斜线和 glob。
`spec` 不传给上游 Builder。输入最多 1 MiB，严格 UTF-8、安全 YAML，
拒绝 alias/循环引用及自定义 tag；不执行 Spec 内容、展开 include 或请求网络。
Checkpoint 文档复用 SDK 渲染器验证，ID 与顺序必须匹配编译后契约的 checkpoint
ID，
所有 Rule code 的并集必须恰好匹配契约的全局 RuleCode，禁止每条 Rule 的独立文档。

文档只存在于只读虚拟文件树覆盖层，不改写源文件：生成
`resources/references/check.md`（Task 目标/范围指引、全局参数 schema 各一次）和
`resources/references/checkpoints/<id>.md`（独立的概述、Agent 指示、规则与成功输出说明）。
源树缺失文档或目录时可生成；已有非空、有效 UTF-8 文档附加在
`Supplementary guidance` 下，适合维护诊断步骤而非重复验收条件。
读取错误、大小写不符、空白/无效编码文档、未声明的 Checkpoint Markdown
及路径/文件容量限制仍会导致构建失败。自定义 `references/idea`、
`references/commit` 子树同样支持此模式；附件保持原映射。生成器不复制编译器。
Task 根、parameter 和 Checkpoint 均不支持 `preconditions`；
旧字段作为未知字段拒绝，不提供兼容别名。

生成入口使用 `defineCheckpoint` 和 `runCheck(contract,{checkpoints})`，
按列表顺序执行，首个失败 Checkpoint 停止后续步骤。
输出 `pass`、`documentation`、`references` 和失败时的 `problems`；
问题仅包含 checkpoint、code、brief，不再有逐问题文档或图节点来源。
过程日志只含 checkpoint 与 pass，执行期 output 不进入日志或业务结果。
这是当前源码模板；消费尚未发布的候选时须使用同一验证 SDK tarball，
不能假定历史 registry 版本已具有新 API。

`source.entry` 是显式 Task 入口，使用 SDK 的 `runCheck` 或自行包装
`createCheckCallback`；`source.contract` 默认导出
`createCheckContract(Input, RuleCode, checkpointIds)` 生成的契约。
共享 schema 必须包含 `check-rule-code` 和 `check-checkpoint-id`；
规则码仅来自作者 TypeBox Schema；不接受 YAML `problemCodes`，也不接受 source 的
`mode/sdk/exportName`。契约模块求值是受信任代码执行，不是沙箱。可选 `$schema` 为
`https://silvermoon-work.github.io/okr-agent/schemas/check-build/v1.json`，是格式标识，不要求联网下载。

## 不可变 imports 与内容来源

沿用上游 `imports: Record<Path, CID>`，可固定子 Task、普通文件或非空目录：

```yaml
imports:
  resources/tasks/child: "<verified-child-cid>"
```

导入路径必须在 `resources/` 下，不能与 include 或其他导入重叠。库 API 的第三参数
`{ content: ipfsStore }` 显式注入
`@silvermoon-work/ipfs-store`；缺失来源、缺块、路径冲突或 CID 不符均失败，不回退联网。库不读取用户内容配置，也不关闭调用方的 store。

CLI 显式解析 IPFS Store 公共配置，并支持上述 `--content-*`
覆盖；未配置 gateway 时仅使用本地内容，不猜测公共源。CLI 在完成交付后关闭自己创建的 store。产物目录中的隐藏
`.task-imports.car`
保存原始导入块，属于离线再打包必需的交付元数据；移动目录时必须一并保留。编码器校验展开资源及原始 CID，最终 CAR
graft 原节点，不以重新导入的相似文件树替代原 DAG。`--no-car`
仍交付该 sidecar，旧 CAR 不更新。

父 Check 通过
`context.invokeTask({key,bundle:context.bundle,path:"resources/tasks/child",parameters,timeoutMs})`
调用子 Task。Bundle 是准确根 CID，不是 SpaceRef；内容读取使用
resolveContent/readContent。旧 Space
API 调用须迁移，随后重建子包和父包并更新 CID。
已有制品不会原地升级；旧 Engine 数据域也不自动兼容。

## 参考标准和资源

必需 `references/check.md` 和每个已声明 Checkpoint 的
`references/checkpoints/<checkpoint-id>.md`，均为非空有效 UTF-8。
不再接受 `references/problems/` 逐规则文档。
这些约定路径严格区分大小写，包括在 Windows 上构建时。未声明的 Checkpoint
Markdown、缺失/空白/无效编码文档均构建失败；不要求 frontmatter，不抓取全部 Markdown 链接。收录整个有效
`references/`
子树（或 `references` 指定的子树），统一映射到 `resources/references/`，
保持图片和相对链接路径，无需逐一列出参考资源。仅选择的子树参与文档校验和收录；
自定义目录仍须提供相同的 `check.md` 和 `checkpoints/` 结构。
二进制参考附件沿用上游规则，在
`binary` 中选择输出路径，例如
`resources/references/**/*.png`。不可交付的路径明确失败，不静默省略。上游资源选择排除点开头的路径及
`node_modules`；参考目录出现这些路径时明确拒绝，而不是漏掉资源后声称完整构建。

## 路径和交付协议

默认文件
`check.build.yaml`。CLI 路径相对 cwd，配置路径相对配置所在目录；输出优先级
`--out-dir` > `outDirectory` > 配置目录下 `dist`。包名为 `@example/text-check`
的模板使用 `dist/example-text-check` 及同级 `.car`。

先完整读取并用上游 CAR 编码器校验暂存 Bundle，再替换本次选择的文件。dist 仅交付最终目录和同级 CAR；不自动 clean，不删除未选中的旧文件。
`--no-car` 不删除或更新旧 CAR，并在本次结果中返回
`car: null`。已有输出不是原子目录交换：部分替换失败会报告
`DELIVERY_UNCERTAIN`，不声称回滚。模块已验证但 CAR 交付失败时，失败信封的 `data`
仅包含已验证模块。暂存清理无法确认时报告 `CLEANUP_UNCERTAIN`。

成功/失败均向 stdout 写单条换行 JSON：

```json
{ "ok": true, "data": { "module": {}, "cid": "...", "car": null } }
```

```json
{ "ok": false, "error": { "code": "OPERATION_FAILED", "message": "..." } }
```

帮助/版本及无参数帮助为 stdout 文本，诊断保留 stderr；成功退出 0，一般失败 1，取消且清理确认后为 130/143，不确定交付或清理为 1。正常
`pass:false`
是运行期业务结果，与构建失败无关。JSON 信封和已公开参数为自动化接口；不应解析帮助文本。

## 库 API

```ts
import {
  createCheckProject,
  transformCheckTree,
  buildCheckBundle,
} from "@silvermoon-work/check-task-builder";
import { directoryTree } from "@silvermoon-work/task-builder-cli/node";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";

const input = await directoryTree(process.cwd());
const definition = await transformCheckTree(input, "check.build.yaml");
// definition.tree + definition.options 可交给标准上游 builder
const bundle = await buildCheckBundle(input, "check.build.yaml");
const archive = await encodeTaskBundleCar(bundle);
try {
  // 消费 archive.stream；CID 为 archive.cid
} finally {
  await archive.close();
}
```

输入树必须包含源码及真实依赖；不会回退到工具自己的 node_modules。文件树逻辑路径统一使用
`/`，不是宿主文件系统路径。资源为惰性流，`buildCheckBundle`
返回不代表全部资源字节已经消费；交付必须完整消费并通过上游验证，例如使用
`encodeTaskBundleCar`。 `createCheckProject({ name?, taskName? })`
仅返回模板树，不写盘。
`runCheckBuilderCli(argv, { cwd?, stdout?, stderr?, signal?, signalExitCode? })`
位于 `/cli`，不退出进程、不注册信号处理器。

使用 imports 时，向 `transformCheckTree` 或 `buildCheckBundle` 第三参数传入
`{ content }`；该对象也可以作为 Engine 的
`ipfsStore`。消费者负责在全部借用者关闭后
`await content.close()`。构建宿主要求 Node.js >=22.15.0，Engine 另要求
`^22.15.0 || >=23.5.0`。

开发验证：本包的 `build`、`typecheck`、`test-coverage`、`lint` 和
`lint-package`。`scripts/smoke.mjs`
可复制到独立安装目录，使用 Task Engine `0.2.1-rc.1` 执行 Bundle，通过
`run.result.data` 验证 pass/fail，校验 schema 生成的 cidPaths，
按 documentation 直接 CID 读取文档，并验证资源回收；第三参数 `fault`
验证抛错制品。若 Bundle 包含参考附属资源（例如
`references/assets/standard.txt`），还会验证输出资源的字节与 Bundle 一致。需要显式安装
`@silvermoon-work/task-engine@0.2.1-rc.1`、`@silvermoon-work/task-builder@0.2.1-rc.0`、
`@silvermoon-work/task-builder-cli@0.2.1-rc.0`、`@silvermoon-work/ipfs-store@0.1.0`
和 `ipfs-unixfs-exporter@16.2.3`。

```sh
node smoke.mjs path/to/dist/text-check
node smoke.mjs path/to/fault-bundle fault
```
