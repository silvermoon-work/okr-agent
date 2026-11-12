# 统一 TypeScript Project Check 实施初版

## Steps

### I-S01: 收敛统一输入与项目拓扑

移除 context、requirements 和 projectScopes，按声明识别根、成员及交付职责，保留根内读取和预算边界。固定规则以
[Convention](./ideal/TypeScript-project-convention.md) 为准。

### I-S02: 实现六类项目约定

在同一 Check 内按职责实现环境、开发依赖与 lockfile、项目规范、Agent 脚本、CI/适用 npm 发布及文档结构；实施前明确元数据来源、新鲜度、0.x 边界和支持语法，不新增独立 npm/monorepo
Task。

### I-S03: 验证统一标准 CAR

更新参考文档与行为回归，重建 CAR，覆盖不同拓扑、适用性、动态版本事实和 latest/rc 配置反例，验证真实执行、文档与回收。

## Acceptance criteria

### I-AC01: 输入只能定位完整对象

Schema 与运行入口测试证明旧输入被拒绝，声明成员完整纳入；未知拓扑不判通过。

### I-AC02: 六类约定按职责生效

合规与反例证明共享配置覆盖、依赖实际解析、稳定 Agent 接口及发布目标适用性；元数据失败不判通过，目标代码不执行。

### I-AC03: 构建执行与仓库检查通过

真实 Engine 验证 CAR、具体结果、文档与回收；相关测试及 pnpm check 通过。
