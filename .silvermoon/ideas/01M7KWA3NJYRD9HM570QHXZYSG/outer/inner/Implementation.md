# Implementation

已确认方向与未决项见 [Design](./ideal/Design.md)，具体输入、操作、预期及证据见 [验收测试矩阵](./AcceptanceTests.md)。当前仅补充验收规格，未实施 browser 宿主、未运行新目标测试；上游 browser Task 支持仍由用户协调，已安装公共版本不能直接执行该目标。

## Steps

### I-S01: 对齐上游 browser Task 契约

先满足矩阵 E01–E03 的开工条件：核实准确公共 Bundle/SDK/Builder 版本及真实 browser 入口，确认 document 参数映射、能力支持/拒绝语义、持续更新和旧 RC 兼容策略。未满足前只维护规格，不改上游协议或伪造就绪。

### I-S02: 实现 ipfsaw 浏览器宿主

在现有 ipfsaw 包内按矩阵 CLI、BND、CTX、DOC、LIFE、UPD、SEC 用例逐步实施 CID/CAR 加载与启动。保持原 TaskContext，拆分启动调用完成、启动取消和应用关闭；只按核实的 Task Engine 公共语义对位 CLI。未决协议用例须先决策，不生成猜测 API 的测试。

### I-S03: 迁移首个 Check 示例并验证

使用真实 Builder 构建首个 Check browser Task；复用既有 UI 回归，完成矩阵 VIEW、COMP、QUAL 的真实浏览器和准确制品消费者证明。先针对性验证，再运行根 check；不发布、不改历史制品，不把旧 renderer 的通过结果计为新 Task 验收。

## Acceptance criteria

### I-AC01: 标准 Bundle 与原 context 可用

E01–E03、BND01–BND05、CTX01–CTX03、SEC01–SEC04 有准确版本和可复现证据：真实 Builder 的 browser Bundle 经 CID/CAR 两路运行，资源与 imports 原 DAG/CID 保持不变；非法声明、内容及越权操作显式失败。类型检查与运行时能力证明同时成立，无 node 伪装、context 扩展、空能力或旧 renderer 冒充。

### I-AC02: CLI 与生命周期准确

CLI01–CLI06、DOC01–DOC03、LIFE01–LIFE06、UPD01–UPD04 证明互斥来源、document 契约、配置/流/退出码正确；启动调用已完成时应用仍可交互，启动取消不等同关闭，竞态和部分失败只产生一次终态并清理自有资源。保存/替换/恢复后只显示最新有效修订；协议未决项未关闭前不宣称通过。

### I-AC03: 迁移与质量门禁成立

VIEW01–VIEW04、COMP01–COMP03、QUAL01 证明实际 Check Task 在桌面/mobile 的显示、导航及隔离成立；准确候选制品通过隔离消费者验证，旧 RC 的选定兼容/迁移策略可复现且不改历史发布。针对性测试及根 check 真实通过，四项 90% 覆盖率与所有既有门禁不变；记录未运行/阻塞项而非伪造完成。
