# 定义并可视化 Check Bundle Spec

## 问题

当前 Check 的定义主要通过代码表达，前期讨论难以共同审视 checker 的职责、parameter 前置假设、问题归属及 children 展开关系。

## 结果

建立可校验的声明式 Check Bundle Spec，并通过可嵌入 React 容器的组件呈现检查脉络与节点详情，支持逐层讨论。已确认的语义和方案边界见 [Supporting document](./CheckBundleSpec.md)。

## 边界

- Spec 描述定义而非运行记录；不改变 runCheck 执行协议，不执行 checker 或文档表达式。
- precondition 在接收 parameter 的 checker 文档中唯一声明，由直接展开它的父节点代码检验；根节点由调用方保证。
- fail 不展开任何 children；不增加逐节点失败影响或父节点 Ensures 描述。

## 验收标准

- 一个真实 Check 样例可完整描述 parameter、前置假设、问题触发条件及 children 条件与参数构造。
- Spec 可校验结构和 checker 引用，明确区分 schema 合法与语义前置条件成立。
- React 容器可呈现条件分流、按对象展开、共享引用及节点详情，供前期讨论使用。
