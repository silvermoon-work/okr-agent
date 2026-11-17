# Checker、Events 与文档组织

## 检查对象与运行

一个 Idea 对应 `Check CID + Target`，不是底层 Engine 的某一次 Run。

- Check CID 固定检查规则的不可变版本。
- Target 稳定标识 Idea；当前阶段、Spec 版本和某次运行结果不作为阶段变化时不断改写的身份。
- 每次 Run 读取当时的项目、Spec、Events 和 Evidence，回答同一个问题：“这个 Idea 是否实现完成？”

同一检查对象可以反复运行。修改 Spec 后，检查可能重新发现共识或验收缺口。升级 Check CID 属于检查规则变更，必须显式处理，不能悄悄替换规则并沿用旧结论。

具体 Target schema、仓库定位方式和规则升级机制在技术阶段确定。

## 前置条件与缺口推进

检查链为“设备整备 → 项目整备 → Idea 共识、实现与部署 → 完成”。

保留旧 Silvermoon 中合理的设备、项目与 Git 约束，包括本地内容提交、与配置 primary 的分支归属及历史关系、必要同步等。前置条件不满足时，返回相应 Problem，不继续推进 Idea。

整备与草稿审核必须兼容：允许在当前协作环节修改、展示和审核未提交草稿；跨入下一环节或按新共识执行前，满足相应提交与 primary 同步条件。具体命令和检查边界需在技术阶段明确，不能以“必须干净”阻断所有草稿讨论。

在 Idea 范围内，由检查事实判断当前到哪、卡在哪。Problem 表达缺什么，其参考说明指导下一步；不是由 CLI 另写一套生命周期状态机。示例：

| 事实 | 缺口 |
| --- | --- |
| Requirement Spec 尚无人确认 | 需求共识未形成 |
| 需求已确认，调研问题未对齐 | 调研范围未确认 |
| Technical Spec 关键决策待审 | 技术方案未确认 |
| 场景或用例尚未确认 | 验收约定未形成 |
| 实现未满足 Test Spec | Implementation 验收未完成 |
| 部署未满足 Test Spec | Deployment 验收未完成 |
| 所有必要条件满足 | Pass |

上表表达语义，不预设最终 Problem code、优先级或具体检查图。

## CLI 职责

Silvermoon CLI 是专用 Checker 的 Wrapper / Host：

1. 定位 Check CID 与 Target；
2. 通过 Task Engine 执行；
3. 将同一结果呈现为 human-readable 或适合 Agent 阅读的形式，并提供 Problem 对应说明。

CLI 不维护独立于 Checker 的阶段和完成判断；不同 audience 不能得到不同业务结论。

命令设计原则上参考旧 Silvermoon，以既有命令职责、命名、参数和使用习惯为基线，而不是从零另造一套命令体系。调研时先盘点旧命令，再明确哪些沿用、哪些因新 Spec / Checker 模型需要调整，以及调整理由；参考旧接口不等于保留已取消的世界术语、结果型 sign off 或旧 Guide 内部架构，也不预先承诺所有旧协议完全兼容。

多语言支持主要面向 Agent 编写的 Idea 文档内容。向 Agent 明确提供有效的内容语言，不把 Check 问题或 CLI 输出的语言当作内容语言来源。当前 Checker 问题不支持多语言，不要求为此扩展通用 Check 结果或增加问题翻译层。

创建 Idea、追加 Events、记录 sign off 等属于配套写入能力：只记录事实，再检查，不自行宣告阶段通过。

复用本仓库现有 Check Task SDK、Builder 和上游 Task Engine 能力，不把旧 Potential Guide / Objective Guide 包一层后冒充迁移。具体模块及包拆分由技术设计决定。

独立 `reference` 命令由 Check 结果中的 documentation ContentRef 和通用 CID 内容读取替代，不继续维护旧 Objective / level / check / problem 的专属引用命名空间。CLI / 宿主必须提供实际可用的内容读取与必要的有界呈现，缺块和不可用应明确报告，不能只输出 CID 就假设 Agent 能访问。

## Events 与证据的权威边界

保留 Events 记录过程事实、据此推导进展的思路。Spec 定义约定，Evidence 支撑验证，Events 记录明确确认、修订、验收等事实，Checker 综合判断。

事件不得凭空制造批准或真实性：一个“完成”事件本身不足以证明当前对象已通过验收。机械检查可以判断结构、引用、版本和确认关系；语义正确性需要 Agent review 和真实证据，不能仅检查标题是否存在。

新事件 schema、版本绑定、并发写入与冲突处理仍待设计；此文不是将旧事件名称直接映射为新流程的授权。

## 平级文档结构

新模型不继续使用 Ideal / Inner / Outer 世界术语和嵌套层级，采用软件工程术语。建议的职责布局如下；具体大小写和文件名在技术阶段定稿：

```text
.silvermoon/i/<idea-id>/
├── requirements/
│   ├── Spec.md
│   └── ...                 # Mock、CLI/API 示例
├── technical/
│   ├── Spec.md             # 面向人的关键技术决策
│   ├── research.md         # 调研问题及人的关注项
│   └── ...                 # 补充技术设计
├── tests/
│   ├── Spec.md             # 场景目录、环境、用例索引
│   └── ...                 # 文字测试用例
├── evidence/
│   ├── implementation/
│   └── deployment/
└── events.jsonl
```

三套 Spec 是逻辑契约，不强制每套只能有一个文件。支持文档属于相应 Spec，不成为平行的第二套要求。

Idea 内容长期留在 Git，保留决策来龙去脉；本次不迁到 IPFS。这不排斥现有 Task / Check Bundle 通过 CID 分发，文档存储和运行制品分发是两件事。

旧 `.silvermoon/ideas` 完整保留作为历史档案。新 CLI 不扫描、不查询、不校验、不写入其中的旧 Idea，不提供旧 Idea 迁移；需要旧流程时继续显式使用旧工具。

用户进一步确定不再沿用 ULID，改用分钟级 `YYYYMMDDHHmm` 加 4 位 Hex 随机码，总计 16 位，以匹配单项目 Idea 稀疏的使用场景。用户已澄清先前“Base64”是口误，实际指 Hex。这个最新方向替代此前 33 位表示；此前 `nnn` 指毫秒的解释只作为讨论历史。时区及碰撞策略的建议见[技术审阅稿](technical-review.md)。

项目 `.silvermoon/config.yaml` 尽量保持旧版路径、字段和语义，不借重建顺便重设计配置。新工具不读取或注入 `.silvermoon/guidance` 提示词；项目可自行通过 `.agents/skills` 指导 Agent 编写 Specs，工具不将其当成第四套契约或批准事实。这里定义未来产品行为，不在本轮更改本仓库现有 skill 路径约定。

## Evidence 与取消 ledger

Test Spec 说明“应该怎么验”，Evidence 记录“实际验了什么”。实现和部署的证据分开保存，不回写为已批准 Test Spec 的一部分。

验收记录需能够追溯到用例 ID、对应 Spec 版本、被测提交或制品、环境、结果及证据引用；重复验收保留批次，不覆盖历史。证据格式、外部引用保留和防止陈旧证据复用的规则需进一步设计。敏感内容不得提交；原始大型日志的保存策略也需明确，不能假定一个外部链接永久可用。

新模型不要求独立 ledger：

- 验收条件由 Test Spec 管理；
- 验收执行与结果由 Evidence 管理；
- 已发生的确认与过程事实由 Events 管理；
- 缺口与完成情况由 Checker 推导。

Agent 可按需在 Technical 下组织实施计划，但不是新增必备镜像勾选清单，任务打勾不能替代验收。
