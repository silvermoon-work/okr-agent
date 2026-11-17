# 委托审阅与实施决策

## 授权与边界

用户在 2026-11-18 明确要求由 subagent 推进，由主 Agent 负责全部门限审批，一路推进至 complete；placeholder package 和 Trusted Publisher 由用户准备。本次委托允许主 Agent 基于证据作出本 Idea 的构想、技术、测试、实施与部署验收决定，不将普通讨论推断为批准。

本 Idea 仍使用旧 Silvermoon 记录实际生命周期，技术和测试约定继续放在 ideal 层；不会提前切换新工具。下列代理审阅是本次明确委托的行使，不是未来产品中默认允许 Agent 代人签字。

发布是独立边界：用户未指定准确版本与提交，不把门限委托自动扩大为任意版本的 npm 发布、标签或 dist-tag 修改授权。若最终无法满足准确发布授权、Trusted Publisher 或准确提交 CI 等外部前提，保留真实 blocker，不伪造 Deployment 完成。

## 本次收口决策

主 Agent 依据已有调研及用户确认，选择以下可实现的首版默认值：

1. ID 固定为 UTC 分钟前缀加四位小写 Hex，严格校验日期，独占创建并有界重试。保证产品列表按解析后的时间排序，不承诺所有文件管理器自然排序。
2. 五个签署对象分别是 Requirements 完整内容、技术问题索引、Technical 完整内容、测试 case 索引、Tests 完整内容。索引不因新增正文变化；完整内容包含支持文档，修改已签署细节仍回退重签。
3. 确认绑定准确内容及上游确认依赖；先审核未提交草稿、记录准确版本决定，再提交并同步同内容，才允许推进。检查不会自行 commit/push 用户仓库。
4. 新 Idea 创建时固定 Check CID。默认 CAR 随 CLI 交付；历史 CID 不可用、不受信任或协议不支持时明确阻断，不默默使用新默认值。旧目录不消费、不补 CID、不迁移。
5. 领域 Events playback state 保留 level；Checker、写入器和查询复用领域规则，CLI 不维护平行状态机。通用 Check 结果不新增 level 协议。
6. `.silvermoon/config.yaml` 延续合法 v2 字段；内容语言延续 idea > project > user > en-US，不从 Checker 输出语言推导。观测 `--language` 不静默改写内容语言。
7. 核心交付为 scoped CLI 与私有 Check 作者包，不顺带切换旧 unscoped alias。alias 的实际转发发布仍是后续明确操作。
8. 发布前只在隔离 fixture 内验证候选。旧全局 CLI 与个人 skill 不更换，本仓库旧 Idea 继续由旧工具驱动。

最终事件字段、文件名及公共 API 由实现候选提出，主 Agent 在独立审查中核对是否完整满足以上不变量；不得为迎合实现修改需求、弱化覆盖率或验收要求。

## 测试约定

主 Agent 以用户明确委托的审核者身份，确认[场景索引](test-index.md)与[文字用例](test-spec.md)作为本次实现/部署验收基线；不是声称测试已经通过。自动化与隔离实际 CLI 验证在实施阶段执行；发布后 registry 安装验证在部署阶段执行。

根门禁现有错误来自已经被 Git 忽略的 `.test-work` 生成制品。允许使 ESLint / Prettier 与该既有生成目录边界一致；不忽略任何受版本控制的 source/test，不删除他人临时文件，不降低规则或覆盖率阈值。根 check 仍须完整执行，新的真实失败继续修复或报告。
