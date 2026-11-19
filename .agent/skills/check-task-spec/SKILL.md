---
name: check-task-spec
description:
  编写、评审和迭代 Check Task 的 docs/spec.yaml；用于梳理 Task → Checkpoint →
  Rule、规则码前缀、Agent 指令、实现判据及后续 reference 文档映射。
---

# Check Task Spec 编写

## 使用范围

当用户要求设计、编写、评审或调整 checker spec / Check Task spec 时使用。
默认交付作者包的
`docs/spec.yaml`，先讨论清楚规格，再按用户授权推进代码和文档生成。
写规格不等于实现 checker，也不自动授权修改运行时契约、构建 CAR、发布或改变消费者政策。

先核对当前契约，不能把历史实现或某个设计候选当成通用标准：

- [项目指导](../../../docs/agent-project.md)
- [SDK 执行与文档模型](../../../packages/check-task-sdk/README.md)
- [Spec v1 结构与校验](../../../packages/check-bundle-viewer/README.md)
- [Builder 的 Spec 文档生成](../../../packages/check-task-builder/README.md)

## 三层模型

只有 **Check Task → 有序 Checkpoints → Rules**：

- **Task** 定义检查对象、整个任务的目标/范围和唯一一份输入 Target。
- **Checkpoint** 是一个独立可理解的验收关口，声明本步目标、Agent 指令、
  Rules 和成功输出。所有步骤共享 Task Target，按数组顺序执行，通过继续，
  首次业务失败即停止；同一步保留可独立判断的问题。
- **Rule** 是本步要满足的正向条件，由实现代码判断；不是子 Checkpoint、
  失败类型清单或内部函数调用步骤。

不增加虚拟根、父子边、DAG、检查点局部输入或隐式分流。
按工具、对象或验收职责拆 Checkpoint，不机械地把每次文件读取或判断拆成一步。
拆分会改变失败收集边界，须明确告知用户：跨步骤不再一次收集全部失败。

## 字段各司其职

| 字段                      | 读者与内容要求                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Task `name`               | 人类可读的任务名称。                                                                                                 |
| Task `description`        | 说明整个任务检查什么、不检查什么，以及对象和副作用边界；不宣称已经执行或通过。                                       |
| `parameter.schema`        | 整个任务的最小业务输入，使用根为 `type: object` 的有效 JSON Schema；无必要参数时允许 `{}`。                          |
| Checkpoint `id` / `title` | 稳定程序标识 / 简短显示标题；不能把 title 当 id。                                                                    |
| Checkpoint `description`  | **一句话简介**：本步检查什么、保证什么；不塞步骤、长篇政策、修复指南或成功输出说明。                                 |
| Checkpoint `instructions` | **给执行/修复该关口的 Agent 的行动指令**：准备什么、如何检查和记录事实、失败如何修复并重新验收；后续进入 reference。 |
| Rule `code`               | 正向条件的稳定标识，尽量带所属 Checkpoint ID 前缀。                                                                  |
| Rule `description`        | **给后续实现 Check Task 代码的判定规格**：把条件、适用范围、比较语义和边界讲清楚，足以据此编写判断和测试。           |
| Checkpoint `output`       | 成功值的用途、形态、边界及后续消费者；不是某次运行结果，也不是结果 JSON Schema。                                     |

### description：一句话定位

好：`核验 Node.js 入口、版本及其属于 nvm 管理安装的关系。`

不要把定位写成操作手册：`先运行……再修改……然后重试……` 应进入 instructions。
状态和迁移差异放 Task 范围说明或包 README，不在每步简介重复长篇解释。

### instructions：指导 Agent 完成关口

用明确步骤回答：

1. 应准备或读取哪些材料，依赖哪个较早检查点的成功输出？
2. Agent 应如何 review、收集和记录事实，哪些操作不可执行？
3. 不符时怎样修正，修正后从哪里重新验收？

这里的检查可以是人工 review、证据准备或调用已有 checker，
不能为了“可操作”而擅自要求安装、联网、改配置或执行目标项目代码。
指令中的命令只是文本，不是授权，也不会由 Spec viewer 自动执行。
不要复制一份带不同表述的验收清单；以 Rules 为唯一验收条件来源。

### Rule.description：足以实现的规则

按需说明以下内容，不要求每条写成固定模板：

- 检查对象和适用条件；哪些是固定政策，哪些确实来自业务输入。
- 必须成立的条件，尤其是“全部满足”还是“任一满足”。
- 精确比较、大小写、路径/URL 规范化、版本比较、阈值及边界值。
- 缺失、无效或无法确认如何归类；业务不通过与执行故障的边界。

反例：`版本要合适。`

正例：`版本输出须能解析为独立数字点分版本；声明 minimumVersions.node 时， 实际版本还须不低于该下限，按任意精度数字段比较、忽略前导零并补齐缺少的尾段； 未声明下限只检查可识别性。`

Rule 描述期望条件；运行时 `brief` 描述实际失败事实、对象和差异，不回显秘密。
解析失败和版本过低可以共用一条 Rule，由 brief 区分，不能把期望条件写成某次失败报告。
意外 I/O、取消、超时、未知协议或清理失败不得静默转成通过。

## ID 与规则粒度

- Checkpoint ID 全任务唯一，使用小写可移植标识；
  格式为 `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`，避开 Windows 保留设备名。
- Rule code 尽量使用 **`<checkpoint-id>-<positive-condition>`**，
  如 `node-installation-executable`、`node-installation-managed-by-nvm`。
  避免 `node-missing`、`version-too-low` 等失败状态命名。
- 同一步内 code 唯一。SDK 允许不同检查点复用 code，但通常应借前缀明确归属；
  前缀是作者约定，不是当前 SDK/Spec 的新增硬校验条件。
- 一条 Rule 对应一项完整验收条件，不要求与内部探测步骤一一对应：
  - `...-executable` 可同时要求入口存在、固定版本命令成功退出。
  - `...-version-valid` 可同时要求版本可识别、满足可选下限。
  - nvm 管理归属与版本合格是独立条件，应另写 `...-managed-by-nvm`；
    node、npm 分别确认，不能从一个工具推断另一个。
- 合并规则码不应删掉原条件或丢失诊断；拆分/合并时同步改动当前规格中的引用。
  若只改设计，明确运行时代码及历史 CAR 尚未同步，不能宣称新旧规则码已经一致。

## 输入与成功输出

- 先确定对象是设备、项目还是提交快照，不照搬另一个任务的参数。
  设备工具链不应仅因项目 Check 有路径参数，就增加 projectDirectory 或业务 context。
- 固定标准不应让调用方通过开关重新选择；只暴露确有必要的变化量，
  如可选的 `minimumVersions`。省略最低版本不等于跳过必需工具。
- 不把 PATH、环境 map、token、运行期资源能力或自报结论塞进业务输入。
  业务输入与 SDK 的 `context.outputOf` 是不同概念。
- `output.description` 说明真实成功值和消费者；无需新增数据时写 `undefined`。
  仅普通对象输出可选列 `fields: [{name, description}]`，名称在本步唯一；
  Map、函数、原始值或 undefined 不伪造对象字段。
- 后步只用 `context.outputOf(earlierDefinition)`
  读取本次较早成功的同一份定义对象，
  不是传字符串 ID，也不是读取另一次执行的缓存。
  输出不自动序列化、发布到 IPFS 或进入日志/Task 报告。

## 从 Spec 到代码与 reference

| Spec 信息                    | 后续落点                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Task 名称、说明及输入 Schema | Task 总览文档；输入需与代码中的 TypeBox 契约保持一致。                       |
| Checkpoint ID 与数组顺序     | `defineCheckpoint` 定义、`createCheckContract` 的 checkpointIds 及执行列表。 |
| Checkpoint description       | 本步代码元数据与 reference 的概述。                                          |
| Checkpoint instructions      | 本步 reference 中的 Agent instructions，保留 Markdown 步骤与示例。           |
| Rule code / description      | Rule 声明、实际判断逻辑和失败归因依据；reference 中只维护一份 Rules。        |
| Checkpoint output            | 成功值文档及后续 `outputOf` 接线，实际值的类型和行为由实现保证。             |

实现阶段可在 `check.build.yaml` 中用 `spec: docs/spec.yaml` 接入现有 Builder。
这是文档生成入口，**不是自动生成 checker 判断代码**。
Builder 要求 Spec 的 Checkpoint ID/顺序匹配编译后契约，Rule
code 的并集准确匹配契约。
设计尚未实现或新旧 ID/规则码不一致时，不提前接入生产构建来掩盖差异。

Builder 在只读虚拟文件树中生成：

- `resources/references/check.md`：Task 范围与全局输入。
- `resources/references/checkpoints/<checkpoint-id>.md`：本步概述、Agent 指令、
  Rules 和成功输出说明。

不会回写源目录里的 Markdown；已有有效文档仅附加为 Supplementary guidance。
不要为每条 Rule 另建问题文档，也不要手工复制多份相同验收条件。
失败报告按 Checkpoint 聚合 reference；规则归因由 code 与 brief 承担。

## 最小完整示例

下面仅演示文本检查的结构，不代替设备或项目 Check 的具体政策：

```yaml
$schema: urn:ipfsaw:check-bundle:1
specVersion: "1.0"
name: 文字检查
description:
  检查输入文字是否准确等于 hello，不读取文件、不执行命令、不修改输入。
parameter:
  schema:
    type: object
    additionalProperties: false
    required: [text]
    properties:
      text:
        type: string
checkpoints:
  - id: text
    title: 文字符合标准
    description: 确认输入文字准确符合约定值。
    instructions: |
      1. 读取任务输入 text，按下列 Rule 核对原始字符串，不修剪或改写。
      2. 若不符，记录实际差异；按用户意图修正输入后重新执行任务。
      3. 不以修改期望值或仅声称已修复来获得通过。
    rules:
      - code: text-value-valid
        description:
          text 必须严格等于 hello，区分大小写，不忽略前后空白；空字符串不通过。
    output:
      description: 成功输出为 undefined，不向后续 Context 新增数据。
```

## 交付前检查

1. 检查三层职责、顺序及输入最小化，所有 Rule 都有足以实现的判据。
   未确认政策明确标记待定，不能从本机现状猜出标准或用空要求冒充通过。
2. 使用严格 YAML；不用 anchors/aliases、自定义标签或额外结构字段。
   全部文本非空；Checkpoint 提供 id、title、description、instructions、rules、output。
   不新增 preconditions、children、parents、逐 Rule 文档或检查点级 parameter。
3. 用现有 `validateCheckBundleSpec`
   验证结构，并用参数 Schema 验证代表性的合法/非法输入。
   前缀、一句话简介和 Rule 语义需额外 review，Schema 通过不证明这些编辑质量或检查已执行。
4. 确认规格与已实现能力的差异、后续 reference 映射及受影响的规则码引用。
   仅写规格不更新历史 npm/CAR，也不宣称已完成运行验收。
5. 对改动文件做格式检查，按项目要求运行 `pnpm check`。
   需要展示时复用当前 ipfsaw 文档预览流程；预览成功不代表 checker 已运行。
