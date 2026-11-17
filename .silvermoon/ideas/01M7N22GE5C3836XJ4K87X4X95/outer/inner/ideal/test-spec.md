# 文字版验收用例

本套用例由主 Agent 行使用户明确委托的审批职责确认，用于验证既定需求而非降低要求。每项证据记录准确运行命令、版本/提交、环境、结果；自动化覆盖率不替代真实运行与部署验证。

## T-01: 短 ID

给定 UTC 分钟/年边界、非法日期、确定性随机值和已有同名目录，创建与校验 16 位 `YYYYMMDDHHmm` 加四位小写 Hex；前导零保留，非法日期拒绝，同一分钟不承诺生成顺序，碰撞重试有上限且从不覆盖旧内容。列表按解析时间而不是 locale / 文件系统自然顺序排序。并发或历史冲突明确报告。

## T-02: 配置与语言

给定合法 v2 配置及 idea/project/user 语言覆盖，观察解析、创建和后续指令，内容语言按既定顺序生效。缺失可选用户配置允许，无效显式配置、未知字段、非法 BCP 47、含凭据的 primary URL 应明确失败；输出 audience 不改变内容语言。旧输出 `--language` 不静默改变文档要求。

## T-03: 新旧隔离

在 `.silvermoon/ideas` 和 `.silvermoon/guidance` 放置旧内容及无效旧文件，创建/列举/检查新 Idea。新 CLI 只消费 `.silvermoon/i`，不改动旧内容，不依赖 ledger 或 guidance，不扫描执行项目 skills。Git 整备仍如实报告这些路径上的未提交改动。

## T-04: 五次确认

依次生成 Requirements、技术问题索引、完整 Technical、测试索引、完整 Tests。每次先观察准确 revision，再显式记录确认。缺任一签字都停在对应 level；只完成索引不等于已确认正文，补充文档被签字范围覆盖；编写正文不改变未修改的独立索引 revision。缺失文件/支持资源或旧 revision 不能通过。

## T-05: 修订与回退

在五次签字及实现/部署已有证据后，分别修改需求、技术索引、技术支持细节、测试索引、用例正文。对应签字失效并回退；依赖旧版本的下游确认和验收不能自动继续生效。修改原文后再签只影响新版本，历史证据仍保留，不因删改事件伪造批准。

## T-06: 草稿及 Git 推进

在关联本地 bare primary 的 fixture 内编辑当前 Spec，允许显示 diff 与记录准确草稿确认。未提交/未同步期间不能进入下一协作关口；提交同步同一内容后可推进。签字后再编辑使旧签字不适用。未知源码改动、无 upstream、错误 primary、分叉或不满足主干关系均明确报告；工具不自动删除、暂存、提交、推送他人内容。

## T-07: 前置链

分别制造设备配置、运行时、个人通用 skill、项目 config、Git HEAD 和 primary 关系故障，观察真实 Check。当前最早前置失败阻断 Idea 展开，不并发推进后继；只读诊断、事件读取和修复入口不被“未完成”本身禁止。无可选项目 skill 不阻断。

## T-08: 事件写入

给定合法、坏 JSONL、未知事件、无签字声明、陈旧 digest、并发 writer 和中断状态，验证 replay/append。成功写入使用受控 UTF-8/LF，expected digest/primary 约束有效；重复重试只在同前缀同请求时幂等，冲突不覆盖，不凭 silence 或 CLI flag 推断人的决定。写入失败、不确定清理或锁冲突明确报告；游标只代表观察。

## T-09: 验收证据

给定当前 Tests 用例与实现/部署对象，只有完整、非空、覆盖所需用例且版本/对象/环境匹配的证据才允许 Agent 记录对应验收。仅有 completed 事件、陈旧提交、不同环境、缺失证据或失败用例均不能通过；部署不能绕过实现前置，历史批次不覆盖。

## T-10: Engine

对同一 `CID + Target` 连续两次观测，中间修改 fixture，第二次得到新事实而非旧 Run 结果。通过真实 Engine 执行 CAR；业务未通过与执行故障分开；取消、超时和关闭等待真实 release，不早退宣称清理完成。完整 Check 未通过时根节点局部 pass 不冒充全通过。

## T-11: 内容读取

离线加载随包准确 CAR，检查返回的整体及 Problem documentation ContentRef 可读并与制品一致。缺块、坏 CID、无授权源、无效 UTF-8 或预算超限明确失败；不猜公共 gateway；不把独立文件 CID 当目录基址解析相对链接；显示不执行 Markdown。

## T-12: 命令与呈现

以独立进程执行帮助、版本、创建、查询、whats-next、snapshot check、event replay/append，核验参数、退出码、JSON 结构和错误。human / agent / JSON 对同一事实业务结论一致；reference、旧迁移和不支持参数给出明确用法错误，绝不 fallback 读取旧 Idea。

## T-13: 固定 CID

用规则 A 创建 Idea 后更换 CLI 默认规则为 B，已有 Idea 仍选择 A，新 Idea 选择 B。A 缺失、不受信任或协议不支持时明确阻断，不使用 B 代替；旧目录 Idea 不补 CID。记录选择来源，验证执行的实际 Bundle CID 与记录一致。

## T-14: 工程质量

执行根 `pnpm check`，各代码包的 statements/branches/functions/lines 全局 90% 含未触达 source；构建/类型/typed lint/format/publint 全通过。已被 Git 忽略的生成 `.test-work` 不作为源码 lint；受控 source/test 不被新增排除。检查 npm delivery allowlist、license、声明与 source maps 和 CAR 绑定。失败不能藏入 fallback 或降低门禁。

## T-15: 发布与安装

仅在准确版本和提交获独立授权、该 SHA 的全部必需 main-push CI 成功、placeholder / Trusted Publisher 已可用后，执行现有发布门禁与发布流程。核实 registry 中准确版本与 provenance，用独立无 workspace 链接目录安装并执行帮助/版本/CAR 检查。不把本地打包或 dry-run 当真实部署成功；缺任一前提时保留 blocker。

## T-16: 发布后闭环

在独立仓库/用户配置中使用发布版完成创建、五次确认、修订、实现/部署证据与终态检查，保留准确版本、操作和结果。前后核对当前旧全局 Silvermoon、个人 skill、本仓库旧 Idea 未被覆盖或隐式迁移；本 Idea 的最后门限仍用旧工具记录。
