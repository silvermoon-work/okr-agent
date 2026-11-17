# Implementation

轻量实施种子。已确认方向与未决项见 [Design](./ideal/Design.md)。本轮只记录设计，不修改产品代码；上游 browser Task 支持由用户协调，当前核查的安装版本不能直接执行该目标。

## Steps

### I-S01: 对齐上游 browser Task 契约

核实准确 Bundle/SDK/Builder 版本，确定 document 参数映射、context 能力与旧 RC 兼容策略。不改上游协议来伪造就绪。

### I-S02: 实现 ipfsaw 浏览器宿主

在现有 ipfsaw 包内实现 CID/CAR 加载与 Task 启动，保持原 TaskContext；拆分启动取消与 Web App 关闭，对位 Task Engine 的 run CLI 与公共参数。

### I-S03: 迁移首个 Check 示例并验证

用标准 browser Task 构建 Check Web App，覆盖两种来源、参数、资源、文件更新和生命周期回归；更新文档并运行项目要求的验证。

## Acceptance criteria

### I-AC01: 标准 Bundle 与原 context 可用

真实上游格式及类型检查证明 browser 声明和调用合法，无 node 伪装、context 额外字段或专用旧 renderer 冒充；契约正反例有测试。

### I-AC02: CLI 与生命周期准确

测试验证 run 的互斥来源、document 映射、配置与 JSON 语义；启动返回后应用存活，启动 cancel 和关闭行为可区分，失败显式传播。

### I-AC03: 迁移与质量门禁成立

Check 示例与已有 RC 兼容/迁移文档一致；针对性测试和项目根 check 通过，未降低覆盖率或绕过协议校验。
