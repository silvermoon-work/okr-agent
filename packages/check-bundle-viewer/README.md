# Check Bundle 定义视图

私有 React 组件与声明式 Check Bundle Spec v1.0。仅用于讨论定义，
不连接 `runCheck`，不改变 SDK 输入、执行图或报告协议，不发布 npm。

```tsx
import {
  CheckBundleViewer,
  typescriptProjectSpec,
  validateCheckBundleSpec,
} from "@silvermoon-work/check-bundle-viewer";
import "@silvermoon-work/check-bundle-viewer/style.css";

const result = validateCheckBundleSpec(typescriptProjectSpec);
// result.valid 为 false 时，issues 提供 JSON Pointer 与错误原因。
<CheckBundleViewer spec={typescriptProjectSpec} />;
```

组件接受 `unknown`，在边界再次校验，失败显示错误而非静默空白。
宿主可先从 JSON 解析数据，或安全解析 YAML 为 JSON 兼容数据；组件不包含文件解析器、
编辑器、网络加载器或执行器。

## Spec v1.0

导出的 `checkBundleSpecSchema` 是可 JSON 序列化的 JSON Schema 2020-12；
`CheckBundleSpec` 提供 TypeScript 类型。`validateCheckBundleSpec` 同时校验
完整文档形状、每个参数 Schema，以及 root /
child 引用与整个定义图的无环性（包括未连接定义）。
JSON Schema 本身不能保证图无环，DAG 约束由运行时 Spec 校验器执行；
自引用和多节点循环都会报错，诊断包含闭环路径与闭环边的 JSON Pointer。
文档结构不允许额外字段；所有说明字符串非空。

| 字段                                   | 约束                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| `specVersion` / `name`                 | 精确版本 `"1.0"` / Bundle 名称                           |
| `root`                                 | 显式入口，必须引用 `checkers` 自有键                     |
| `checkers`                             | 非空的命名 checker 集合，允许共享引用，禁止循环（DAG）   |
| Checker `title` / `description`        | 名称与职责                                               |
| `parameter.schema`                     | 根 `type: "object"` 的 JSON Schema 2020-12               |
| `parameter.preconditions`              | 不重复的自然语言假设数组，可为空                         |
| `rules`                                | 规则数组，可为空；每条含 `description`、`problems`       |
| Rule `problems`                        | 每条含 `code`、`description`、`when`；归属该规则，可为空 |
| `children`                             | 展开边数组，空数组代表叶节点                             |
| Child `checker` / `when` / `parameter` | 目标引用 / 展开条件文本 / 参数构造文本                   |
| Child `forEach`                        | 可选的按对象展开说明文本                                 |

参数 Schema 支持文档内 `$defs` /
`$ref`。无网络解析器，不能解析的外部引用明确报错；
不执行自定义关键字，`format` 仅作注释而不验证格式值，未知扩展关键字也仅作注释。
参数 Schema 由 Ajv 编译检查有效性，但**不验证某次输入或参数绑定**。
类型声明不能替代边界校验。循环的 JavaScript 对象、函数、非有限数字等非 JSON 数据会报错；
checker 引用形成的定义循环同样不合法。

## 语义边界

- 前置条件只在接收方的 `parameter.preconditions` 声明。根节点由调用方保证；
  直接展开 child 的父节点**代码**先验证这些假设，再构造参数。
  展开边只记条件和映射，不维护重复的 Ensures。
- Schema 合法不是语义证明，不能证明参数构造满足接收方 schema 或前置假设。
  `when`、`parameter`、`forEach` 全是惰性文档，不求值，不是 DSL。
- 不通过时返回问题且不展开 children；本节点通过不意味着后代全部通过。
  定义图没有逐节点失败影响或运行状态，兄弟节点不代表固定串行步骤。
- 定义图必须是 DAG，每个定义首次出现时展开一次。共享引用跳转到首次定义；
  含循环的 Spec 显示校验错误，不渲染为正常脉络。
  未从入口引用的定义独立列出，不会隐藏。
- 使用原生按钮的 Tab、Enter、Space 操作。选择节点将焦点移至详情标题；
  引用跳转展开目标的祖先并聚焦目标按钮。各组件实例使用独立 ID，状态相互独立。
- 桌面使用约 32px 高的单行树，只展示标题、必要的分支标记、× N 与共享跳转。
  checker ID、完整条件和参数映射在详情中阅读。树与详情各自滚动；
  宿主可通过 `--cbv-height` 自定义面板高度。
- 650px 以下默认只显示详情。「检查脉络」打开原生模态 `dialog` 侧栏，
  浏览器负责焦点约束与背景 inert；关闭按钮、Escape 与背景点击关闭并恢复入口焦点。
  选择节点关闭侧栏并聚焦详情；调整窗口会关闭模态层并保留选择/折叠状态。
  需要支持原生 `dialog.showModal()`、`matchMedia` 和 CSS `:has()` 的现代浏览器。
- Parameters 将直接声明的 `properties` / `required`
  投影为字段列表，并展示语义前置假设。
  不解析 `$ref`、`allOf`
  等组合，也不推断继承的字段或必填性；无可直接枚举字段时引导阅读完整
  JSON Schema。折叠 Schema 仍是字面 JSON，不经过 Markdown。
- Problems 按原规则分组，使用问题码 / 说明 / 触发条件三列表格；
  Children 为空时整节省略。Parents 在 Children 之后（叶节点则在 Problems 之后）；
  逐条反转原始 children 边，不去重同一父节点的不同映射，保留
  `forEach`，不新增 parents 数据。
  无父节点时不显示该节。表格支持区域内横向滚动和键盘聚焦，不撑宽页面。

## Markdown 与安全边界

所有说明使用 `react-markdown` 与 `remark-gfm`，支持段落、列表、强调、链接、
行内代码、代码块及 GFM 表格等。字段引用应写为反引号行内代码，例如
`` `projectDirectory` ``、`` `member.directory` ``，不是插值语法。
标题、checker 名称和问题码仍为普通标签。字段说明、规则及问题触发、children 参数映射、
前置假设和 Parents 中反向呈现的说明均使用同一渲染路径。

不启用 raw HTML 插件，不使用 `dangerouslySetInnerHTML`；
原始 HTML 被丢弃，链接使用 renderer 默认安全 URL 策略，图片禁用以避免说明文本发起远程图片请求。
不执行 JavaScript、表达式、shell、MDX 或语法高亮代码。
参数 schema 中的说明作为 JSON 字面内容保留；字段列表中的 description 单独按 Markdown 阅读。

## 真实样例与维护

`src/typescript-project.ts` 人工记录当前源码的身份分流：
[`project`](../check.typescript-project/src/checks/project.ts) →
[`single-repo` / `monorepo`](../check.typescript-project/src/checks/repositories.ts)。
问题码为当前契约的
`typescript-project-invalid`；两个分支当前仅检查取消信号后通过，
没有工程检查 children。示例不冒充旧 `src-legacy`
的成员脚本检查，也不把丰富 mock 中的规划节点
说成已经实现。该文档不自动生成或同步。
作者修改对应代码时，应在同一变更中复核 parameter、问题触发与边；代码、测试和评审
而非 schema 负责证明语义。此功能没有修改 Check 作者源文件。

宿主的分流/批量、共享引用与无效数据是明确标注的 mock；循环引用属于无效 Spec 示例，
不能当作现有 Check 的实际执行拓扑。

## 本地预览与验证

在仓库根使用 `.node-version` 的 Node 和根 `packageManager` 的 pnpm：

```sh
pnpm --filter @silvermoon-work/check-bundle-viewer build
pnpm --filter @silvermoon-work/check-bundle-web dev
```

访问
<http://127.0.0.1:4173/>。服务仅监听回环地址，端口占用会失败，不自动改端口。
停止用 Ctrl+C。无需远程服务，字体为本机系统字体，不依赖外链资源。
修改组件源码后需重新 build；宿主 dev 不代替库的 TypeScript 构建。

```sh
pnpm --filter @silvermoon-work/check-bundle-viewer test-coverage
pnpm --filter @silvermoon-work/check-bundle-web test-coverage
pnpm check
```

两个 workspace 使用共享严格类型、类型感知 lint 和包含 TSX 的单次 Vitest；
四项全局覆盖率均要求 90%。浏览器视觉、窄屏与原生键盘体验需要另行实际验收，
jsdom 行为测试通过受控的 matchMedia、动画帧及 dialog 方法模拟平台缺口，
验证选择、引用、关闭与 resize 的应用行为；不能证明浏览器原生焦点约束或替代浏览器证据。

## ipfsaw browser renderer

`pnpm --filter @silvermoon-work/check-bundle-viewer build`
同时生成原有组件模块与
`dist/renderer/` 中真正自包含的 browser ESM、CSS、source map 和
`ipfsaw.renderer.json`。入口默认导出 `mount/update/dispose`，复用同一组件；
不复制脉络树或 Markdown/DAG 逻辑。组件仍接受旧无标识文档；可选根
`$schema` 只允许准确的 `urn:ipfsaw:check-bundle:1`，未知字段仍严格拒绝。
用于通用 CLI 时必须带此标识，配置绑定准确根 CID。
受控本地 pack/import/preview 指令见 [ipfsaw](../ipfsaw/README.md)。
