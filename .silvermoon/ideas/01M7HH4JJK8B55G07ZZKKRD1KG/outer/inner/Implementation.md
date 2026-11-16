# Implementation

这是后续迭代的轻量初版，不追认已有代码为本 Idea 的已验收实施。
当前已有成果、约束和试跑入口见 [Handoff.md](Handoff.md)。

## Steps

### I-S01: 明确下一层问题与职责

以 monorepo 为下一层，逐项确认 workspace 与 packages 的检查对象、
问题归属及失败阻断范围；不把讨论建议自动转成固定政策。

### I-S02: 递增实现领域 checker

按已确认范围添加 schema、checker、registry 组合及少量行为回归。
事实读取与问题判断分离；交付声明迁移须协调其发布消费方。

### I-S03: 验证并构建当前候选

运行聚焦验证和 pnpm check，重建当前 CAR 并保留准确 CID 与试跑命令。

## Acceptance criteria

### I-AC01: 检查结论与阻断范围准确

用通过、失败及独立分支样例证明新规则的问题归属与剪枝，保留已有身份分流行为。

### I-AC02: 结果和内容引用符合契约

通过真实 Engine 执行证明精简结果、直接文档 CID、schema 生成的 cidPaths
及 parent 过程日志正确；故障不得伪装成业务问题。

### I-AC03: 本轮候选可独立试跑

pnpm check 通过；构建产物可运行，给出的命令使用本轮 CAR，而不是旧 CID。
