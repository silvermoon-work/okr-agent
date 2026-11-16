# Implementation

主 Agent 按用户授权完成设计并负责门限审批；实现交给本仓库 subagent 与 alias 独立会话。接口约定见 [Design](./Design.md)、[CLI Spec](./CliSpec.html)，已核实事实与缺口见 [Research](./Research.md)。

## 当前交接状态

2026-11-16 已保留本地与远端历史，用普通 merge 同步到主干。主包 CLI / registry、通用 renderer、持续预览与 Check 适配已实现；接手独立审查又修复 MIME 继承属性绕过，以及浏览器启动器忽略普通终止时无法结束的问题。

当前源码的根 `pnpm check` 退出码 0：ipfsaw 83 项、viewer 40 项及 TypeScript 项目 665 项测试通过，四项覆盖率门限未修改。当前私有 scoped 主包的新准确 tarball 已隔离安装，40 个源码 / 构建文件逐字节一致，并用其真实 CLI 在原生 Chrome 贯通保存、语法错误、原子替换、移动导航、不同 Schema、renderer 故障与关闭。准确身份、失败过程与验证边界见 [Verification](./Verification.md)。旧会话的内容排除属于旧交接记录；本次没有访问或复用那些候选目录。

本机 `D:\Code\ipfsaw` 不存在，独立 alias 远端也没有可达 HEAD/main，因此 I-S03 / I-AC03 仍未完成；未提交 submitInner、未接受 Implementation / Deployment。alias 仍由用户另开的 session 接管。后续先取得 alias 准确提交与 tarball，在本次准确 scoped tarball 上完成双仓联调及 alias 质量门禁，再推进生命周期；npm、release tag 与远端制品发布始终另需明确授权。当前主包保持 private。

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
