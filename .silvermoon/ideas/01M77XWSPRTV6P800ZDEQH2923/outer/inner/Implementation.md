# 统一 TypeScript Project Check 实施初版

## Steps

### I-S01: 收敛统一输入与项目拓扑

移除 context、requirements 和 projectScopes，按声明识别根、成员及交付职责，保留根内读取和预算边界。固定规则以
[Convention](./ideal/TypeScript-project-convention.md) 为准。

### I-S02: 实现六类项目约定

在同一 Check 内按职责实现环境、开发依赖与 lockfile、项目规范、Agent 脚本、CI/适用 npm 发布及文档结构；明确根推荐工具链与成员运行兼容性、逐包开放/发布及精确提交 CI 复用。实施前明确元数据来源、新鲜度、0.x 边界和支持语法，不新增独立 npm/monorepo
Task。

固定文档整份比较，自由文档不评正文。实施前定稿 AGENTS.md、Release
Skill 的完整 assets 及自由扩展引用路径；比较和修复仅使用同一份资源。必要 SDK 改动仅补齐 assets 到 output 的受限链接，不暴露完整写权限或扩展父子结果协议。

### I-S03: 验证统一标准 CAR

更新参考文档与行为回归，重建 CAR，覆盖根/成员版本冲突、逐包发布与准确 SHA/事件/分支 CI 保护、动态版本和 latest/rc 反例，验证真实执行、文档与回收。

覆盖固定文本缺失、不匹配、仅换行形式不同、自定义内容追加、自由扩展存在性及资源链接故障；从真实 output
CID 解析 problem 的相对链接，逐字节读出对应标准 asset，不依赖 Check
CID 或作者源码。

## Acceptance criteria

### I-AC01: 输入只能定位完整对象

Schema 与运行入口测试证明旧输入被拒绝，声明成员完整纳入；未知拓扑不判通过。

### I-AC02: 六类约定按职责生效

合规与反例证明共享配置覆盖、依赖实际解析、稳定 Agent 接口、发布目标适用性及整份固定文档匹配；不以自由文档关键词判通过，元数据失败不判通过，目标代码不执行。

### I-AC03: 构建执行与仓库检查通过

真实 Engine 验证 CAR、具体结果、参考文档、标准 assets 相对链接/字节与回收；链接失败不产生正常结果，相关测试及 pnpm
check 通过。
