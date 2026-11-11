# Node.js 工具链检查实施初版

## Steps

### I-S01: 定稿契约与平台证据边界

将 [业务要求](./ideal/Requirements.md)
转换为 TypeBox 输入及问题码，确认项目上下文、工具配对、nvm 适配与有效 registry 的检测证据及支持矩阵。

候选契约位于
`packages/check.nodejs-toolchain/src/contract.ts`，额外跨字段一致性在
`inspect.ts` 拒绝，版本按任意精度数字段比较；配对与管理单独验证 npm
CLI 及其 Node 运行时。URL 结构化规范化，拒绝凭据和重复等价候选。

### I-S02: 实现单 Check 包及参考文档

通过现有 SDK/Builder 实现
`@silvermoon-work/check.nodejs-toolchain`，按需复用旧仓库已有可靠原语，不引入通用工具执行器或新模板模型。

作者包保持 `private: true`，未加入发布映射。入口调用现有
`runCheck`，由 Builder 提取 TypeBox 并打包十二类问题的中文参考文档。子进程仅使用枚举内固定只读命令，限制时间/输出、取消并按 PID 清理进程树；关闭子进程自动下载、pin 和 pnpm 自动版本管理，不改调用方配置。

### I-S03: 验证业务与标准制品

覆盖要求文档中的正常、不满足、非法输入、取消和清理场景，执行真实 Engine 制品验证及仓库检查。

定向检测器测试与真实 CAR/Engine smoke 已执行；后者发现上游环境阻塞，详细证据见
[Verification.md](./Verification.md)。在根因解决且补全真实平台证据前，不得完成实施验收或提交门限。

## Acceptance criteria

### I-AC01: 要求语义可验证

针对 R-02 至 R-08、R-11 的测试证明未声明项不误报、关联约束不被简化、有效配置与输入一致性正确。

### I-AC02: 结果与资源边界正确

通过实际 Engine 执行通过、不通过及故障制品，核对结果和输出参考文档，并验证取消、清理及无环境修改。

### I-AC03: 单包交付符合仓库规范

作者包保持私有且不进入 npm 发布映射，工作区脚本与依赖一致，标准 Bundle/CAR 可构建，准确 CID 可验证，相关测试及
`pnpm check` 通过；支持平台与未验证范围有明确文档。
