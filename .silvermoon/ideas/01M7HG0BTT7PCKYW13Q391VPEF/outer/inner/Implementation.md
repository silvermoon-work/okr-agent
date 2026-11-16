# Implementation

准备阶段的轻量初版；具体字段与组件位置在实施时确定。按用户授权由 subagent 实现，主 Agent 基于校验与审查证据负责 implementation 门限审批。

## Steps

### I-S01: 定义 Spec 与真实样例

结合已确认的 precondition 语义，用真实 Check 完善字段、版本与校验约束；checker 引用允许共享，禁止形成环，所有定义均参与无环校验。

### I-S02: 实现 React 定义视图

实现可嵌入的紧凑脉络与详情组件，支持条件、批量展开及共享引用；mobile 使用 navigation pane。按 supporting document 将参数列表、Schema 与前置假设归入 Parameters，说明支持 Markdown，字段引用使用行内代码，空 Children 隐藏。

### I-S03: 验证契约与渲染行为

补充针对无效 Spec、引用与交互边界的测试，更新使用文档并运行项目要求的校验。

## Acceptance criteria

### I-AC01: Spec 语义可表达且可校验

真实样例可描述节点契约与展开规则；正反例测试证明结构和引用校验有效，允许共享 DAG，拒绝自环、间接环及未连接子图中的环，不将文档条件误当可执行证明。

### I-AC02: 组件可嵌入并可靠导航

React 容器样例与交互验证证明详情、条件分流、批量标记、共享引用及无效循环报错可用，并满足 supporting document 的紧凑树、移动导航、Markdown 和空节隐藏约定。

### I-AC03: 项目校验与文档完整

使用文档说明前置条件的责任边界；项目要求的检查通过且未改变 Check 执行协议。
