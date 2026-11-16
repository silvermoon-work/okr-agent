# Implementation

主 Agent 按用户授权完成设计并负责门限审批；实现交给本仓库 subagent 与 alias 独立会话。接口约定见 [Design](./Design.md)、[CLI Spec](./CliSpec.html)，已核实事实与缺口见 [Research](./Research.md)。

## 当前交接状态

用户要求先将源码提交到 origin/main，再由本地继续处理。主包 CLI / registry、通用 renderer 内容读取与本地持续预览、Check 适配及四项回归修复已实现；主 Agent 独立通过 74 项 ipfsaw 与 38 项 viewer 覆盖率测试。subagent 报告完整 `pnpm check` 通过，提交整合后的根检查结果以实际输出为准。

候选制品及消费测试目录被工具明确判为组织内容排除。未绕过访问、复制或另处重打包；修复版制品运行、源码制品一致性和原生浏览器验收仍未完成，因此本次源码提交不表示 Implementation / Deployment 门限接受。Ledger 保持未完成；alias 仓库后续提交发布由用户另开的 session 接管。

后续顺序：在组织允许的条件下完成制品及真实浏览器验收，确认准确版本与提交并通过主干准确 SHA CI 后，先发布 scoped 主包 RC，再由用户通知 alias 仓更新依赖并发版。当前包保持 private，本次不发布 npm 或 release tag。

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
