# Check Bundle Spec 与可视化讨论

本文支持 [Idea](./Idea.md)，记录已确认的设计语义与初步方案，不是第二份契约，也不表示 schema 或组件已经实现。具体字段与技术选型在实施阶段通过真实样例验证。

## 用途

前期讨论以 checker 为单位，描述检查对象、前置假设、检查规则、问题归属及通过后的展开。Spec 与执行代码、React 渲染器分离；JSON / YAML 数据经校验后交给可视化组件，不要求解析任意 TypeScript 来还原定义。

## 已确认的语义

- 每个 checker 的 parameter 是 precondition 的载体。
- parameter schema 描述数据形状；parameter 的 precondition 文档描述这些数据背后已经成立的语义假设。
- precondition 由接收 parameter 的 checker 唯一声明，不在父节点再维护一份重复的 Ensures。
- 直接展开 child 的父节点代码先检验 child 声明的前置条件，再构造并传入 parameter。根 checker 的前置条件由调用方保证。
- 子 checker 基于前置假设检查自己的规则，不重复检查这些前置条件。
- schema 校验成功不等于语义前置条件已经被证明。代码、测试与评审负责验证调用方是否兑现假设。
- fail 返回问题，不展开任何 children；pass 返回 children，空 children 为叶节点。
- 本节点 pass 只表示本节点的判断成立，不表示其后代检查全部通过。
- Spec 的 checker 引用关系必须是有向无环图（DAG）：允许多个父节点共享同一 checker，但禁止自引用和间接回路，包括未从入口引用的定义。该约束不改变运行时检查图的能力，也不描述同一 checker 按不同 parameter 递归展开的设计。

## 节点与展开关系

节点卡片包括：

1. checker 名称、标题与职责。
2. Parameters，包括参数列表、parameter schema 与 precondition 假设；schema 是 parameter 的一部分。
3. 检查规则与 Problems，包括触发条件，而不仅是问题码列表。
4. Children，包括展开条件、目标 checker、parameter 构造与可选的按对象展开描述。

展开边表达“何时展开、如何构造 parameter”。讨论时核对父节点的实际检验是否足以兑现接收方前置假设，不新增独立的前置条件副本。

## Spec 初步结构

建议包括以下字段，名称与必填规则尚待真实样例确认：

| 层级 | 字段 | 含义 |
| --- | --- | --- |
| Bundle | specVersion、name、root、checkers | Spec 版本、名称、入口与命名 checker 集合 |
| Checker | title、description | 面向讨论的名称与职责 |
| Parameter | schema、preconditions | 数据形状与语义假设 |
| Rule / Problem | description、code、when | 检查规则、问题码与触发条件 |
| Child | checker、when、parameter、forEach | 引用、展开条件、参数构造与可选的批量展开 |

checkers 以 registry 名称为键。root 和所有 child 引用必须可解析；同一 checker 可被多处引用，但 children 不能形成回路。无环约束由 Spec 校验器检查并显式报告错误，不能仅依赖 JSON Schema 或界面防止无限展开。参数 schema 不因可视化而改变现有对象输入约束。

第一版的条件、参数构造与 forEach 使用文档文本，不引入可执行表达式或通用 DSL。各 section 的说明支持 Markdown；引用 parameter 字段使用行内代码，例如 `projectDirectory` 或 `member.directory`。schema 保留结构化数据身份，以 JSON 代码块展示，不改成 Markdown 字符串。Markdown 渲染不得执行原始 HTML、脚本或危险链接。校验不能静态证明参数构造符合目标 schema，更不能证明 precondition。

## TypeScript 项目示例

以下为讨论中的职责脉络，不表示实现状态：

```text
project
  [合法 single repo] -> single-repo
  [合法 monorepo]    -> monorepo
                         workspace
                         packages
                           package { packageDirectory } x N
```

`project` 根据身份与结构判断选择分支，不同时执行 single-repo 和 monorepo。`monorepo` 的 parameter 文档声明目标已被识别为合法的 TypeScript monorepo，父节点代码在展开前兑现该假设。

`package` 的 parameter 文档可以声明 packageDirectory 指向已确认存在且已发现的 workspace 成员；成员发现节点先完成相应验证，再为每个成员构造 target。

树上展示的是 checker 定义与展开规则，而不是某次输入实际生成的节点实例。共享事实读取不自动构成 children 关系。

## 可视化组件方向

组件接收已校验的 Spec，例如 `<CheckBundleViewer spec={spec} />`，宿主 React 容器负责挂载。第一版优先采用可折叠脉络与节点详情双栏：

- 桌面使用单行紧凑树与独立滚动的详情面板，树上只保留节点标题、必要的分流短标签、按对象展开与共享标记，不常驻完整条件或重复的 checker ID。
- 详情依次展示职责、Parameters、检查规则与问题、Children、Parents；不在顶部展示展开来源区或来源下拉框。
- Parameters 内包含参数列表、可折叠 Schema 和前置假设；各节使用一致的 Markdown 排版，字段引用使用行内代码。
- Problems 使用问题码、说明、触发条件三列表格，问题码使用行内代码；说明与条件支持 Markdown。窄屏仅表格区域可横向滚动，不撑宽整个页面。
- children 为空时不渲染 Children 一节，也不显示空状态占位。
- Parents 是低于 Children 优先级的反向引用，放在其后，用父节点、展开条件、参数构造三列表格展示；父节点可点击跳转，没有父节点时不显示。关系由 children 自动反向生成，不要求作者在 Spec 中重复维护 parents。
- 共享 checker 支持引用跳转；循环 Spec 作为无效输入报错，不作为正常定义展示。
- 定义视图不使用运行成功 / 失败状态来暗示已经执行。
- 校验错误显式展示；文档文本按数据呈现，不执行脚本或表达式。
- 支持键盘操作与可见焦点。mobile 使用可开合的 navigation pane，默认只显示详情；打开侧栏后选择节点会关闭侧栏并回到详情，不将整棵树堆在详情上方。

以上排版已在独立手工 HTML mock 中讨论；该 mock 的 Markdown 为手工排版预览，不是 React 组件已接入完整 Markdown renderer 或全部交互验收通过的证据。

## 实施时待确认

- 通过完整真实样例确定规则与问题的关联方式、参数构造描述形式及 schema 引用方式。
- 确定 Spec 与作者代码共同维护的约束，避免文档和代码静默漂移；本次不预设自动生成方案。
- 确定组件所在 workspace 与实际 React 宿主，不提前引入编辑器、执行器、远程服务或 npm 发布范围。
