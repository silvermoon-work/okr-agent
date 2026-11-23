# Check Bundle 定义视图

私有 React 组件与声明式 Check Bundle Spec v1.0，采用
**Check Task → 有序 Checkpoint → Rule**。仅展示定义，不连接执行器、不执行检查，
不发布 npm；尚未发布的 Spec 保持 v1 迭代，旧树／图结构明确拒绝，不按对象键顺序推测迁移。

```tsx
import {
  CheckBundleViewer,
  typescriptProjectSpec,
  validateCheckBundleSpec,
} from "@silvermoon-work/check-bundle-viewer";
import "@silvermoon-work/check-bundle-viewer/style.css";

const result = validateCheckBundleSpec(typescriptProjectSpec);
// result.valid 为 false 时，issues 提供 JSON Pointer 与原因。
<CheckBundleViewer spec={typescriptProjectSpec} />;
```

组件接受 `unknown`，在边界再次校验；宿主负责安全解析 JSON/YAML，
组件不包含文件解析器、编辑器、网络加载器或执行器。

## Spec v1.0

`checkBundleSpecSchema` 是可序列化的 JSON Schema 2020-12，
`CheckBundleSpec` 与 `CheckpointDefinition` 提供类型。

```yaml
$schema: urn:ipfsaw:check-bundle:1
specVersion: "1.0"
name: 项目检查
description: 只读核验目标目录的项目身份与范围，不执行目标代码。
parameter:
  schema:
    type: object
    properties:
      projectDirectory:
        type: string
    required: [projectDirectory]
checkpoints:
  - id: project
    title: 项目身份
    description: 核验目标项目的身份。
    instructions:
      只读核对根 manifest
      和项目证据；指出不符项，修正后重新检查，不执行目标代码。
    output:
      description: 成功时将项目分类供本次执行内的后续检查点使用。
      fields:
        - name: kind
          description: single-repo 或 monorepo，供后续检查判断适用范围。
    rules:
      - code: project-valid
        description: 目标必须具备合法的项目身份。
```

- `$schema` 可省略；存在时只接受准确的 `urn:ipfsaw:check-bundle:1`。
  `specVersion` 必须为 `"1.0"`，名称及各说明字符串须含非空白字符。
- 根 `description` 必填，描述任务检查什么以及检查范围，不声明运行结果。
- `parameter` 是整个 Check Task 的 Target 契约，仅包含 `schema`，
  必须是根 `type: object` 的有效 JSON Schema。
- `checkpoints` 是非空**有序数组**。每项必须有
  `id`、`title`、`description`、`instructions`
  、`output` 与非空 `rules`；`description`
  简述检查什么、保证什么；`instructions` 是独立的非空 Markdown，
  告诉 Agent 如何准备材料、review、记录事实和迭代；详情以 Instructions 区域单独展示，
  支持安全的步骤列表和 JSON 示例，绝不执行其中命令。Rules 记录验收要求，
  不再另建重复的 goal / acceptance。ID 全任务唯一，使用小写可移植标识
  `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`，排除 Windows 保留文件名 stem
  （如 `con`、`nul.txt`、`com1`）。
- 每条 Rule 只有 `code`、`description`。同一检查点内 code 唯一，
  不同检查点可以使用相同 code；code 和说明均表达应满足的正向约束，
  如 `project-valid`、`worktree-clean`，而非失败状态名称。
- `output` 必须有非空白 `description`；仅当成功值是对象时可附加 `fields`，
  每项只有非空白
  `name`、`description`。提供时数组不得为空，名称在本检查点内唯一。
  这是自然语言的成功 Context 输出文档，不是 JSON 输出验证或序列化契约。
  `undefined`、基本值、`Map`、函数等只用说明描述，不伪造对象字段或执行结果。
- 所有结构严格拒绝额外字段，没有 root、checkers、children、parents、
  检查点级 parameter、`rule.problems`、图、共享引用或虚拟根。
  根、parameter、检查点均不支持 `preconditions`；旧字段作为未知字段拒绝，
  不兼容映射为任务说明或假设。

验证器检查完整形状、参数 Schema、ID、局部规则码及输出字段名唯一性，
并提供准确数组位置。
参数 Schema 支持文档内 `$defs` / `$ref`；不能解析的外部引用明确报错，
没有网络解析器。不执行自定义关键字，`format` 和未知扩展关键字仅作注释；
编译 Schema 不等于验证某次输入或证明检查通过。
循环对象、函数、非有限数字等非 JSON 数据明确拒绝。

## 顺序与交互

所有检查点共享同一个任务 Target，定义按数组顺序检查：**通过继续，不通过即停止**。
定义不构造子参数、不执行表达式，也不表示任何运行状态。
侧栏任意选择仅用于阅读，不是跳过执行门禁。

- 任务名称显示在标题栏；默认显示「任务总览」，根任务说明、全局 Parameters 列表、
  完整 Schema 只在此展示，没有全局假设或前置条件区块。独立总览按钮不占检查点列表位置。
  侧栏用单层有序列表呈现检查点，无嵌套或折叠按钮。
  检查点详情显示完整标题与 ID、目标／说明、Rules 规则码／说明表格及成功 Context
  输出文档，不重复任务说明、参数或 Schema。
- 保留 12px 单行省略标题、完整可访问按钮名称与 `title`；
  选择后聚焦完整详情标题并重置详情滚动位置。不同实例的 ID 与选择相互独立。
- 桌面侧栏初始 30%，分隔条可拖动或用左右方向键、Home、End 调至 20%–80%；
  侧栏至少 180px、详情至少 240px，各自滚动。宿主可设置 `--cbv-height`。
  固定高度容器可用 `.cbv-fill` 使标题自然占高、内容填满剩余空间。
- 650px 以下通过「检查点」打开原生模态
  `dialog`；浏览器负责焦点约束与背景 inert。
  关闭、Escape、背景点击恢复入口焦点；选择关闭侧栏并聚焦详情。
  窗口变化关闭模态并保留选择与宽度，需要现代 `dialog.showModal()`、
  `matchMedia` 和 CSS `:has()` 支持。
- ipfsaw browser Task 和 legacy renderer 启用展示层 URL 导航
  `#checkpoint=<Checkpoint ID>`，更新、刷新与浏览器前进／后退恢复选择；
  仅显式有效 ID 进入检查点详情；ID 不存在时清除 checkpoint 参数并回到任务总览。
  总览清除 checkpoint 参数，合法的 `overview` ID 仍是独立检查点，不是保留字。
  保留其他 fragment 参数，
  不将选择写入 Task Target；宽度与滚动位置不持久化。
  导航 fragment 最长 4096 字符；超长 ID 仍可本地阅读，但不写入 URL。
  普通 React 使用默认不读写 URL，单实例宿主可显式传入 `navigation`。
- Parameters 仅将直接 `properties` / `required` 投影为字段列表，不展开
  `$ref`、`allOf` 或推断字段。类型列保持不换行、最小宽度，过长内容在表格区域
  横向滚动，不撑宽页面。完整 Schema 默认折叠并保持字面 JSON。

## Markdown 与安全

任务说明、检查点目标／说明、规则、参数与输出字段说明统一使用 `react-markdown` /
`remark-gfm`，
支持段落、列表、强调、链接、代码与 GFM 表格。字段引用用反引号行内代码。
任务名称、标题、ID、规则码和输出字段名始终为纯文本。

不启用 raw HTML、不使用 `dangerouslySetInnerHTML`，原始 HTML 丢弃，
链接使用安全 URL 策略，图片禁用，避免远程图片请求。
不执行 JavaScript、shell、MDX、表达式或代码高亮。

## 样例与维护

`typescriptProjectSpec` 描述项目身份与 workspace 配置的有序检查定义：
项目身份通过后，monorepo 核验必需的 pnpm workspace 普通文件、YAML 和显式非空
`packages` 字符串数组；single repo 不适用 workspace 配置要求。
同一个 `workspace-configuration-valid` 下的配置要求合为一条规则。
样例人工维护，不代表已经执行过目标项目。
项目检查点的成功输出 `kind` 记录 `single-repo` / `monorepo`；
workspace 检查点成功输出为 `undefined`，不提供额外数据。

`typescriptProjectDesignSpec` 是独立的未实现设计候选，在前述检查之后依次讨论
全局配置入口、九个根 scripts、根开发工具容器与七个共享工具的声明。
九个名称及准确 `turbo run <同名任务>` 已确认；
工具组合、版本元数据与 Node/peer 兼容性细则仍为候选，不自动升级工具。
Turbo 内容、成员发现、单包工程要求尚待细化，因此不伪造空规则检查点或占位规则码。
设计不把本仓库当前配置自动视为通用政策，也不修改生产 Check 作者源文件。
未实现检查点的输出明确标记为待设计或无实际数据，不伪造已执行事实。

宿主还提供有序讨论 mock、重复 ID、重复规则码、非法 Schema 与不支持的旧版示例。
Silvermoon 的两个独立任务定义在
[`docs/silvermoon-single-checker.yaml`](../../docs/silvermoon-single-checker.yaml)，
及
[`docs/silvermoon-commit-check.yaml`](../../docs/silvermoon-commit-check.yaml)；
前者保留环境至完成的 13 个有序检查点，后者独立核验提交，不建立伪流水线节点。

## 本地预览与验证

使用根 `.node-version` 的 Node 和精确 `packageManager`：

```sh
pnpm --filter @silvermoon-work/check-bundle-viewer build
pnpm --filter @silvermoon-work/check-bundle-web dev
pnpm --filter @silvermoon-work/check-bundle-viewer test-coverage
pnpm --filter @silvermoon-work/check-bundle-web test-coverage
```

访问 <http://127.0.0.1:4173/>，停止用 Ctrl+C；仅监听回环、端口占用失败。
源码变更后需重新 build，宿主 dev 不代替库构建。
严格类型、类型感知 lint 与单次 Vitest 保留；四项全局覆盖率均要求 90%。
jsdom 覆盖顺序、唯一性、格式拒绝、导航、安全 Markdown、拖动、焦点和模态交互，
不替代浏览器原生焦点约束或实际视觉验收。

## ipfsaw renderer 与 browser Task

build 同时生成组件模块、自包含的 `dist/renderer/` browser ESM、CSS、source map、
`ipfsaw.renderer.json`，保留 `mount/update/dispose` ABI 与全高布局。
复用同一组件，不复制验证或 Markdown 逻辑。
用于通用 CLI 的文档须带 v1 `$schema`，配置绑定准确 renderer 根 CID；
已有旧 renderer CID 不会自动升级，须重新构建、打包并显式更新绑定。
受控本地预览见 [ipfsaw](../ipfsaw/README.md)。

同次 build 输出带 v1 `$schema` 的 `dist/typescript-project-design.json`；
ipfsaw 的标准 browser Task 构建也直接消费同一个 v1 schema 与示例。
既有文档／CAR 不会被静默重写；旧结构或临时 v2 标记须显式更新，重新构建并使用新的准确制品。
