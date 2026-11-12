# 固定工程标准与 npm 组合检查实施初版

## Steps

### I-S01: 收敛输入和标准数据

统一两个 Project
Check 为仅含顶层 projectDirectory 的闭合输入，移除 context、projectScopes、公开 requirements 及政策归一化；固定完整标准，由项目声明识别范围。

### I-S02: 实现 npm 附加标准与最小组合

在固定 TypeScript
CAR 基础上实现 npm 项目的具体共性，按已确认结果/文档契约完成最小组合，不复制子规则。

### I-S03: 验证标准 CAR 与组合

更新两个 Check 的参考文档和行为回归，重建 CAR，验证真实执行、父子具体问题与文档、故障及 imports/SpaceRef 身份。

## Acceptance criteria

### I-AC01: 输入只能定位对象

通过 Schema 与运行入口测试证明旧包装、成员筛选和政策覆盖明确拒绝；workspace 根与全部声明成员自动纳入，不能确认完整范围时不判通过。

### I-AC02: 固定标准没有退化

用合规及各领域不满足 fixture 证明 TypeScript 完整标准与 npm 附加标准生效、未知配置不误判，且目标代码保持不执行。

### I-AC03: 构建执行与仓库检查通过

真实 Engine 及父子调用验证准确身份、具体结果、文档与回收；相关测试和
`pnpm check` 通过。
