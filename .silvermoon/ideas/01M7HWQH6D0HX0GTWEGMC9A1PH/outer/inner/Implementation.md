# Implementation

主 Agent 按用户授权完成设计并负责门限审批；实现交给本仓库 subagent 与 alias 独立会话。接口约定见 [Design](./Design.md)、[CLI Spec](./CliSpec.html)，已核实事实与缺口见 [Research](./Research.md)。

## Steps

### I-S01: 定义主包与 renderer 契约

实现私有开发候选 `@silvermoon-work/ipfsaw`、CLI 导出、配置与安全文档读取；提供通用 renderer manifest / 浏览器协议及准确 CID 的内容读取，复用 Task IPFS Store。

### I-S02: 贯通持续预览与 Check renderer

提供本地宿主、持续更新和完整资源释放，用现有 Check viewer 构建自包含 renderer；明确迁移 Check Spec 的 `$schema` 兼容入口，不静默删字段或修改 Task 协议。

### I-S03: 联调 alias 并独立验证

独立会话只在 `D:\Code\ipfsaw` 所属仓库实现无 scope 薄入口。通过本地主包与 alias 的准确 tarball 联调、针对性测试和各自仓库要求的完整检查，验证而不发布。

## Acceptance criteria

### I-AC01: 按契约加载准确 renderer

测试证明 YAML/JSON 解析、映射维护、manifest、CID / assets 读取、错误边界及共享 Store 配置有效；Check 与另一最小 fixture 证明宿主通用性。

### I-AC02: 预览与资源回收可靠

针对保存、原子替换、无效中间版本、过期更新、schema 切换和中断的测试证明预览不伪造成功，并回收自己拥有的监听、HTTP 和 Store 资源。

### I-AC03: 双仓入口一致且质量门禁通过

主 Agent 复核两个准确 tarball 的真实 CLI 输出、参数与退出码一致；主仓 `pnpm check` 及 alias 仓要求的验证通过，不弱化门限、不以占位依赖冒充 registry 可安装。
