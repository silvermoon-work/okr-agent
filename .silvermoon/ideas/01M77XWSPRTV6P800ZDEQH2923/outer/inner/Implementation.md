# 统一 TypeScript Project Check 实施初版

## Steps

### I-S01: 收敛统一输入与项目拓扑

移除 context、requirements 和 projectScopes，按声明识别根、成员及交付职责，保留根内读取和预算边界。固定规则以
[Convention](./ideal/TypeScript-project-convention.md) 为准。

已实现闭合顶层对象与全部声明成员发现；catalog-only
workspace 不虚构成员，未声明嵌套 manifest、链接、未知所有权不通过。旧可配置归一化器已替换为每次创建的固定内部标准。

### I-S02: 实现六类项目约定

最终来源选择为受宿主授权的 canonical-v1：完整 npm install-v1
packument、官方精确历史 Node 记录与新鲜 GitHub
schedule；不以 npmx 的无上游观察时间 SWR 缓存作新鲜依据，也不把本设备镜像策略写进通用制品。当前 Windows 本地只跑受控 HTTP/fixture 与构建，生产 live 验证在已获授权的 Ubuntu 进行。当前生命周期与精确历史发行存在性的时间依据分别记录。

在同一 Check 内按职责实现环境、开发依赖与 lockfile、项目规范、Agent 脚本、CI/适用 npm 发布及文档结构；明确根推荐工具链与成员运行兼容性、逐包开放/发布及精确提交 CI 复用。实施前明确元数据来源、新鲜度、0.x 边界和支持语法，不新增独立 npm/monorepo
Task。

固定文档仅根 AGENTS.md，引用自由扩展 docs/agent-project.md，不设置 Release
Skill。比较和修复仅使用同一份完整 asset；必要 SDK 改动仅补齐 assets 到 output 的受限链接，不暴露完整写权限或扩展父子结果协议。

生产包元数据策略明确捕获为已授权 Tencent 源，无 canonical/npm 其他源回退或目标/环境 URL 覆盖；即使镜像 HTTP 新鲜，也不据此断言上游已完整同步，无法证明最新则 unconfirmed。Node 仍使用官方 index 与 nodejs/Release
schedule。每请求 10 秒/16MiB、最多 64 个公开包、仅执行内缓存且证据不超过一小时。版本系列为 major>=1 固定 major、0.minor 固定 minor、0.0.patch 精确锁定。上一轮不符合当前设备来源限制的 canonical 直接观察保留为历史失败证据，不再作为当前来源。

新增一个完整正向支持的单包 npm publisher v1：有限 tsc
rootDir/outDir→实际源码成对入口/声明/映射及真实源交付；发布器完整源字节来自同一 Bundle
asset，目标副本只比较、不执行；完整声明式 workflow 及必需 Node/聚合矩阵匹配受检标准。实际守卫覆盖准确 tag/name/version、private、RC 连续历史、已有版本/依赖、main 可达、准确 SHA/main-push 全部必需 CI 复用、OIDC/client、单次禁钩子 pack/同 tarball、dispatch
dry-run。应用/库角色不再仅凭 private:false 或 main 推断。未知实现仍 unconfirmed，不声称线上权限或当前发布事实已经成立，详见
[Verification.md](./Verification.md)。

### I-S03: 验证统一标准 CAR

更新参考文档与行为回归，重建 CAR，覆盖根/成员版本冲突、逐包发布与准确 SHA/事件/分支 CI 保护、动态版本和 latest/rc 反例，验证真实执行、文档与回收。

覆盖固定文本缺失、不匹配、仅换行形式不同、自定义内容追加、自由扩展存在性及资源链接故障；从真实 output
CID 解析 problem 的相对链接，逐字节读出对应标准 asset，不依赖 Check
CID 或作者源码。

同一 callback/检查器分别构建生产 CAR 与内部确定性元数据验证 CAR；二者身份和用途分开记录。真实 Engine 使用公共 readTaskBundleCar 与 IpfsStore.fromClient，无内部导入或补丁；通过/不通过、四类非法输入、I/O 故障、取消、资源回收及 output 资源字节均已有证据。最终仓库门禁状态以 Verification 的准确命令结果为准，不把局部测试冒充 pnpm
check。

## Acceptance criteria

### I-AC01: 输入只能定位完整对象

Schema 与运行入口测试证明旧输入被拒绝，声明成员完整纳入；未知拓扑不判通过。

### I-AC02: 六类约定按职责生效

合规与反例证明共享配置覆盖、依赖实际解析、稳定 Agent 接口、发布目标适用性及整份固定文档匹配；不以自由文档关键词判通过，元数据失败不判通过，目标代码不执行。

### I-AC03: 构建执行与仓库检查通过

真实 Engine 验证 CAR、具体结果、参考文档、标准 assets 相对链接/字节与回收；链接失败不产生正常结果，相关测试及 pnpm
check 通过。
