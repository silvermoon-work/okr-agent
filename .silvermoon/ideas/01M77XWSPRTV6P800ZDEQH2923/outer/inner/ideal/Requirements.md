# 固定 TypeScript 工程标准要求

本文是 [Idea.md](./Idea.md) 的 supporting
document，定义业务范围与可观察结果，不指定内部文件拆分。

## R-01: 标准与对象分离

- Check 的准确 Bundle
  CID 决定按什么标准检查，input 决定检查谁；不再由 input 改变合格线。
- 本次先调整 `@silvermoon-work/check.typescript-project`，再实现
  [npm 包项目标准](./Npm-package-standard.md)。不把这项结论扩展为所有 Check 都禁止参数；Node.js 工具链的能力要求及授权执行上下文不在本次修改范围。
- 标准允许已支持的等价配置，不要求继承 preset、复制模板、固定配置文件内容或提供 lineage 来源。
- 固定的是长期最佳实践规则，而非某一时点的版本快照。保留现有类型/lint/格式/测试质量标准，并补全本轮确认的环境、开发依赖、Agent 操作接口、工作流及文档结构。pnpm 精确锁定、开发工具按声明及 lockfile 实际解析跟进所选 major 内最新稳定版本，取代历史最低版本常量。具体语义见
  [Maintenance-invariants.md](./Maintenance-invariants.md)。
- 规则本身改变时重建新 CID；相同规则因发布元数据更新而从通过变为不通过，是正常维护信号，不要求每次上游发版都重建 Check。

## R-02: 输入只定位检查对象

Project Check 类 Task 统一直接描述项目位置，不保留仅包装路径的 context 层：

```json
{
  "projectDirectory": "D:\\Projects\\example"
}
```

- `projectDirectory` 为执行机上的绝对项目目录，不是控制机目录或 policy 选择器。
- 输入为闭合对象，唯一必填字段是非空
  `projectDirectory`。禁止 context、projectScopes、requirements、profile、enabled、skip、threshold 或其他未知字段。
- 项目范围由 Check 根据项目自身声明确定：单项目检查完整项目；支持的 pnpm
  workspace 检查根项目与声明发现的全部适用成员，不接受调用方替换成员清单或选择性排除。
- 保持现有受支持的 workspace 发现语义、最多 128 个成员及越界/链接/读取预算限制。声明损坏、不支持的成员发现语法或无法确认完整范围时明确报告无法确认，不跳过后宣称整个项目通过。
- 不把任意嵌套 package.json 都猜作成员；对于不支持的项目结构，不能用额外 scopes 输入绕过范围问题。
- 直接传入某个独立项目目录时，仅报告该项目的结论，不宣称其外层 workspace 已合规。所需共享配置只能按明确支持的根内解析边界读取；若不能在该边界确定依赖上下文，应报告无法确认，不能为补证而无界向上扫描或读取根外内容。
- 空路径、相对路径、缺失字段或未知字段明确拒绝；不存在或不可读的目标仍按执行故障处理。
- 旧
  `{context:{projectDirectory}}`、任何层级的 projectScopes 都作为非法输入拒绝，不增加自动解包、兼容别名或静默忽略。
- 旧 `requirements` 无论是
  `{}`、null、禁用领域、降低阈值或等于默认值，均明确作为非法输入拒绝，不忽略、不继续检查后声称通过。
- 不接入 executionEnvironment，也不探测宿主工具。执行身份、授权、超时等由 Task 宿主协议负责，不混入项目检查业务输入。

## R-03: 固定标准

标准按 [Project-practices.md](./Project-practices.md)
的六类组织；以下保留核心质量线并补充新共性。旧实现与
[参考文档](../../../../../../packages/check.typescript-project/references/check.md)
是能力基线，不是新增标准已经实现的证明。

| 类别           | 不可由输入覆盖的要求                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 环境配置       | 项目默认开发 Node 属于仍受官方支持的 LTS，声明与 CI 默认选择一致；pnpm 精确锁定同 major 最新稳定版本，冻结安装                                                                      |
| 开发依赖       | TypeScript、lint、format、测试与覆盖率能力由明确 devDependencies 承载；构建工具按职责适用；检查 package.json/catalog、对应 importer 的 lockfile 实际解析、新鲜度及 peer/Node 兼容性 |
| 项目规范       | 严格类型与五项安全选项、类型感知 lint、格式策略、非 watch 测试、未触达文件与四项至少 90 覆盖率                                                                                      |
| 标准脚本       | typecheck、lint、format:check、format、test、test:coverage、check 为稳定 Agent 接口，构建项目另有 build；检查语义、连接、非交互及失败传播                                           |
| Workflow       | GitHub 项目覆盖 PR 与主分支 push（main 必须覆盖），冻结安装并执行统一 check；npm 发布标准由父 npm Check 增加，不要求私有应用发布                                                    |
| 项目结构与文档 | README.md、CONTRIBUTING.md、Agent 维护指引、正确 gitignore 及必要已跟踪配置；项目拓扑明确，所有适用代码和成员实际进入检查链路                                                       |

单包、单成员 workspace 与多成员 workspace 只是统一 Check 内的拓扑分支，不是不同合格线。成员共享根工具、配置与调度是允许的，但必须证明有效覆盖，而不是只看根文件存在。

| 领域         | 固定要求                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 依赖管理     | packageManager 精确锁定 pnpm 稳定版本，并处于所选 major 内最新稳定 minor.patch；存在 lockfile，CI 使用同一锁定版本与冻结安装 |
| TypeScript   | 声明 TypeScript 依赖，strict，源码与测试纳入类型检查                                                                         |
| 类型安全选项 | noUncheckedIndexedAccess、exactOptionalPropertyTypes、noImplicitOverride、noImplicitReturns、noFallthroughCasesInSwitch      |
| lint         | 类型感知，源码与测试纳入范围                                                                                                 |
| 格式化       | 有只检查、不写入的格式校验入口                                                                                               |
| 测试         | 非 watch，未发现测试不能被配置为成功                                                                                         |
| 覆盖率       | 纳入未触达文件，branches/functions/lines/statements 四项阈值均不低于 90                                                      |
| 聚合门禁     | 连接 typecheck、lint、formatting、test、coverage，并传播失败                                                                 |
| CI           | GitHub 项目 PR 与主分支 push 接入，main 存在时必须覆盖；同一有效检查链路包含冻结安装、统一 check 与覆盖率                    |

阈值是最低标准，不要求目标配置恰好等于 90；更高合法阈值可满足。项目配置与连接静态检查，另观察工具发布及 Node 支持周期事实；不执行目标代码、不探测本机安装版本，也不以此证明成绩或 CI 历史。

## R-04: 删除配置不降低检测质量

- 删除或收敛仅为接收调用方政策而存在的归一化、默认合并、关闭领域及跨政策冲突逻辑；不保留无人可达的公开政策执行器作为另一个入口。
- 内部可以有只读标准数据与必要共享类型，但不得暴露修改它们的参数或可变公共对象来改变后续 Run 的规则。
- 保留现有静态语义解析及预算，按本轮范围补足拓扑、lockfile、标准脚本和文档等能力；新增能力均需证据，不能因为旧 Check 通过就宣称新版完整标准通过。
- 初期工具实现以 ESLint/typescript-eslint、Prettier、Vitest 为已知路径；Biome 能合并 lint/format 不代表已证明类型感知等价，未经能力对照和回归不自动认可或宣称不合规。未知配置报告无法确认。
- 不擅自扩大未确认的工具/平台支持，不让单包/多包分支改变质量线；不支持的声明、动态语法或覆盖关系报告无法确认。
- 不执行目标命令、模块、配置、安装、构建或修复。网络仅允许获授权发布元数据查询，不下载/执行包、不探测项目服务或发送项目源码及秘密；来源、新鲜度与故障边界见维护不变量文档。
- 问题仍分 missing、mismatch、unconfirmed；输入非法、读取故障、取消等仍是执行故障。输出文档继续采用现有 code/brief/documentation 与 output
  CID 协议。

## R-05: 组合与交付

- 父 Check 固定依赖本标准的准确 CID，通过不可变 imports 与 `bundle: SpaceRef`
  调用；直接传同一个 `{projectDirectory}`
  对象，不包装 context、不透传或覆盖子政策。
- TypeScript 固定标准是 npm 包项目 Check 的前置；后者复用本 Check，不复制规则或透传政策。父子具体结果与文档的最小组合边界见
  [npm 包项目标准](./Npm-package-standard.md)，不引入广义 preset 政策语言。
- 包继续私有，仅交付标准 CAR/CID 与更新文档；不要求发布作者 npm 包。
- 新模型改变契约与制品身份，需要重建新 CAR 并明确新旧输入不兼容。旧 CAR/CID 与历史已验收文档不被改写或冒充已经迁移。
- 本次不自动改写其他 idea、已发布 Pinboard 内容或外部父 Bundle；如有实际消费者，文档说明需要按新 schema 重建并更新引用。远程上传、pin、外部发布另行授权。

## R-06: 验收场景

1. 对现有合规 fixture 使用仅含顶层 projectDirectory 的输入，通过；配置内故意有类型错误或失败测试仍不执行目标代码。
2. 分别去掉严格模式、降低覆盖率至 89、断开 lint/test/coverage 门禁或 CI 连接，出现对应具体问题；不能通过任何输入参数放宽。
3. 旧 context 包装、projectScopes、requirements 的空对象、原本有效的局部覆盖、禁用领域、null 和未知政策字段都被 schema/运行入口明确拒绝；无成功形状 fallback。
4. workspace 自动检查根与全部声明成员；成员中一个不满足即可定位问题，不允许输入隐藏它；不支持的范围声明、越界/链接/预算限制明确报告，不将范围不完整判为通过。
5. 真实 Engine 对新 CAR 执行通过、不通过、非法旧输入及读取/执行故障，核对业务结果、文档字节和资源回收。
6. 父 Task 使用 imports 固定该 CAR 的根身份，通过 SpaceRef 直接传同一个
   `{projectDirectory}` 对象，得到真实子业务结论；执行故障按上游语义传播。
7. 独立于作者源码/隐藏依赖的 CAR 消费与当前仓库 `pnpm check`
   通过，交付说明准确记录新 CID、固定标准和旧输入拒绝行为。
8. 发布元数据出现同 major 更新的稳定 minor/patch 时，旧锁定版本不通过；仅出现更高 major 或 prerelease 不因此失败，也不自动升级。元数据查询失败、过期、不完整或来源冲突不得用旧缓存或默认值判通过。
9. 版本判断保留来源、观测时间、项目锁定版本、所选 major 与候选版本等非秘密证据；受控元数据测试验证长期规则，另以真实获授权来源验证查询链路，不把固定测试版本冒充当前最新。
10. 同 major 最新工具在 lockfile 中存在但不属于目标 importer 时不能通过；声明范围合格但目标实际锁定过期、缺失或 peer/Node 冲突时准确报告。
11. 单包、只有 catalog 的根、单成员及多成员 workspace 覆盖同一标准；根聚合器不因没有自身源码/构建而误报，成员也不因根有配置就被推断合格。
12. 标准脚本缺失、空壳、写入检查、watch/交互入口或吞掉失败均被识别；文档不能只凭存在判定内容可用，未知内容语义明确无法确认。
13. GitHub origin、缺失 origin、非 GitHub
    origin 及默认分支差异按明确来源/适用性判断；不能因来源不明静默跳过 CI 后声称完整通过。
