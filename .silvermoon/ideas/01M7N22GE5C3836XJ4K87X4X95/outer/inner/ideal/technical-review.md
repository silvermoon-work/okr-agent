# Silvermoon 重建：关键技术审阅稿

## 阅读方式

这是旧 ideal 层的技术调研支持文档，不是已批准的实施设计。用户已明确的需求与下列“建议”分开；建议用于本轮 review，不以文档写入或 Git 提交替代 sign off。[问题目录](research-questions.md)与[技术依据及补充设计](technical-notes.md)供追溯。

## 总体建议

使用一个专用 Silvermoon Check Bundle 驱动“设备 → 项目 → Idea”的检查链。CLI 调用 Task Engine，呈现业务结果并提供创建、事件追加等配套写入，不复制业务状态机。首版不嵌入 Copilot SDK 去自主运行实现 Agent；Agent 通过普通工具遵循 Problem 说明推进。

建议两个 workspace：

- `@silvermoon-work/silvermoon`：npm CLI / Host、通用 skill、配置与 Git 适配。
- `@silvermoon-work/check.silvermoon`：私有 Check 作者包，交付标准 CAR/CID，不额外发布 npm。

先不增设独立协议包。状态归约、版本及布局校验只保留一份共享实现，构建时打入 Check；CLI 写入也复用它。实现时验证模块边界不产生依赖环，不让 CAR 依赖全局安装的 JS 模块。

CLI 版本随包固定一个准确 Check CID 与其 CAR。首版不为选择规则另增项目配置；升级 CLI 所固定的规则变化需要显式告知，不把旧确认或旧验收直接当成新规则通过。具体规则升级流程仍需定稿。

## 命令设计建议

以旧版 `bin/silvermoon.ts` 的命令面为基线，而不是按新模型另造一套动词：

| 命令 | 建议 |
| --- | --- |
| `whats-next [idea]` | 保留。无 selector 时观察设备/项目，有 selector 时观察同一 Idea 的完成缺口。 |
| `create-idea` | 保留。只创建新目录 scaffold 和初始元数据，不推断批准，不自动提交。 |
| `list-ideas` | 保留本地查询、alias、状态/时间/文本过滤；仅查询新 `.silvermoon/i`，不 fetch，不要求所有 Idea 完成。 |
| `event replay` | 保留全量及准确 cursor 增量读取；展示新事件归约事实。 |
| `event append` | 保留 input、expected digest、必要的 expected primary 与显式人类决定声明；事件业务类型换为新 Spec / Evidence 语义。 |
| `check` | 保留 snapshot 验证职责以及 worktree / staged / commit / remote 入口；有效但未完成的 Idea 应可通过 snapshot check，不能拿生命周期未完成阻断文档提交。 |
| `reference` | 取消专属引用命名空间，读取 Check 返回的 documentation ContentRef。 |
| `migrate` | 首版不提供旧 Idea 迁移，因此不保留旧迁移命令；未来自身新协议升级另行定义。 |

`--root`、`--audience human|agent`、`--json` 等已有习惯优先延续。JSON 不承诺继续沿用旧四投影的全部 schema，需提供明确的新契约与用法说明，不能把 breaking change 伪装成完全兼容。

`whats-next` 的“当前缺口”仍是正常观测；执行故障与用法错误独立报告。退出码建议继续区分成功观测、检查/执行失败和用法错误；完整逐命令矩阵在 CLI Spec 中确定。

不新增另一个 `reference <CID>` 专属命令。Agent audience 可由 Host 按预算读取当前 Problem 说明并显示原始 CID；只需扩展阅读能力，不扩展业务判断。原文超预算或读取失败应明确提示，不能伪装成完整说明或业务成功。

## 存储边界

按已明确要求，新工具只消费：

```text
.silvermoon/
├── config.yaml
├── ideas/                  # 旧内容：原样留档，新工具不读写
└── i/
    └── <16-character-id>/
        ├── requirements/
        ├── technical/
        ├── tests/
        ├── evidence/
        │   ├── implementation/
        │   └── deployment/
        └── events.jsonl
```

旧目录损坏、存在旧 guidance 或历史 ledger，不应成为新布局校验失败的理由。但通用 Git 整备仍会看到仓库里的未提交改动；“不消费旧 Idea”不等于忽略其 Git 改动或自动提交它。

首版不迁移、不导入、不自动归档或重命名旧内容。旧 alias 不加入新索引；输入旧 ID 时明确指出它不是新 ID，不尝试 fallback 到旧目录。

## 新 ID

用户在调研中进一步明确，项目内 Idea 稀疏，无需继续使用 ULID；最新要求为 `YYYYMMDDHHmm` 加 4 位 Hex 随机码，共 `12 + 4 = 16` 位。“Base64”已由用户更正为 Hex。此前“17 位毫秒时间 + 16 位随机”的 33 位提案已被替代，不作为当前目标。

建议：

- 时间建议使用 UTC，四位年份、固定宽度、补零；日期校验拒绝“2 月 30 日”等归一化输入。此处 `MM` 是月、`mm` 是分钟，不是照抄某库的格式 token。
- 随机部分建议使用 `crypto.randomBytes(2).toString("hex")`，恰为 4 位小写 Hex、16 bit，同一分钟有 65,536 种取值。固定小写避免跨平台大小写歧义，解析器不静默把未知目录改名。
- 目录示例：`202611171609` + `7a2f`；前缀对应本地 `2026-11-18 00:09 +08:00`。这是建议的 UTC 表示，不是已确认使用本地时区。
- 同分钟内按随机部分形成稳定次序，不承诺生成先后；不同设备时钟也不提供全局真实时间全序。创建用独占方式检测碰撞并有界重试，不覆盖现有目录。
- 跨分支在同分钟独立创建可能重名，普通本地独占创建无法防止这种情况。需要在实现期定义可区分的创建事实或历史检查，冲突时显式处理，不能假装短随机码保证跨分支全局唯一。
- ID 创建时间不作为事件授权、证据新鲜度或当前时钟正确性的证明。

一个需纠正的前提：标准 ULID 的 Crockford Base32 在规范 ASCII 字典序下本来就是按毫秒时间可排序的。新格式的直接价值是可读的日历时间；自然排序 / locale 排序与 ASCII 排序不同，不能仅凭目录呈现断定 ULID 编码错误。

新格式不再叫标准 ULID 字符串，代码命名和验证使用 IdeaId；查询按解析的分钟时间排序、同分钟以 ID 作稳定 tie-break，不依赖文件管理器排序。UTC、Hex 固定小写及回拨策略属于本提案待确认项。短 ID 不是秘密、权限凭据或无需冲突检测的全局唯一承诺。

注意：16 位无分隔符格式保证的是 ASCII 字典序下的分钟顺序，不保证文件管理器的数字感知自然排序。例如 `2026111716090000` 在 ASCII 下早于 `202611171610a000`，但 ICU numeric collation 得到相反顺序。若必须保证特定文件管理器里的自然时间顺序，需要实测该环境并重新讨论分隔符等表示；当前不擅自把 16 位要求改为 17 位。

## 配置与语言

旧项目配置只有 `version`、`primaryRepository`、`primaryBranch`、可选 `preferredLanguage`。

建议首版保持同一路径和这组字段，继续读取合法 v2 config，不强迫改 version 来隔离新旧 Idea；目录本身已隔离两种存储。这里将 config 的 version 明确定义为该配置契约版本，新事件协议独立有版本，不借用旧 v2 事件 schema。若最终发现必须改变字段语义，再显式提出配置升级，不偷偷更改现有文件。

用户级配置继续参考旧路径 `~/.config/silvermoon/config.yaml`，默认内容语言建议保持“idea override → project → user → en-US”。BCP 47 校验及机器标识不翻译等规则延续。

保留 `create-idea --language <tag>` 作为内容语言 override；旧观测命令的 `--language` 曾表示输出语言，不能悄悄改成内容语言。建议首版不承诺输出本地化，也不静默忽略这个旧参数；不支持的旧用法明确报用法错误并说明内容语言入口，是否保留过渡兼容需 review。

当前 Check 业务结果没有通用 metadata 槽位。不为 Silvermoon 添加语言字段到通用 Check 协议；当前 Problem 的动态 brief 可明确写出 `contentLanguage`、当前候选版本等执行必要事实，静态文档说明如何使用。事件查询和创建命令可返回领域元数据，但不得从 CLI 的显示语言推导文档语言。

## 共识与版本绑定

建议用五个可追溯确认点表达协作，而不是只保留三次模糊“通过”：

1. Requirement Spec；
2. 技术调研问题及人的关注项；
3. Technical Spec 的关键结论；
4. 测试场景目录、环境和阶段归属；
5. Test Spec 的具体用例。

它们都是人明确确认，不增加与人对称的 Agent 签字环节。后续实现/部署记录 Agent 的验收主张及证据，不生成旧式 acceptInner / acceptOuter。

平级目录不再靠包含关系隐式失效。建议确认记录绑定本对象版本与上游版本；旧上游变化使依赖它的确认待复核。补充技术文档仍留在受控版本中，不能借“无需人逐行审核”绕过重大方案变更。

Evidence 按批次记录用例 ID、Spec 版本、提交/制品、环境、结果与来源。实现证据变化应重新评估部署证明的适用性。Checker 能校验这些关系，但不会执行 LLM 审查来证明文档的业务真理；Agent 的检查声明必须有可追溯证据。

准确的 event 名称和 payload、测试目录与具体用例的版本切分、局部修订最小失效集合，留待实施前定稿，不在本调研冒充最终 schema。

## 整备与草稿

保留设备配置、运行时、个人通用 skill；保留项目 config、Git HEAD、primary 归属/历史关系、同步和事件历史检查。

不直接继承“任何 dirty 一律阻断”的旧实现。建议仅在事件能识别的当前协作环节允许对应 Spec 草稿变化，并返回“继续编辑/审核当前草稿”的缺口；不进入下一协作环节，不按新草稿验收。

无关源码、未知文件和混合改动仍应明确报告，不能自动清理、自动暂存或一律称为合法草稿。人的 sign off 要绑定当时的准确内容；之后提交、同步同一内容，再允许跨阶段推进。不能复用旧版“必须先把候选提交 primary 才能请求 sign off”的顺序，否则与未提交 diff 审核冲突。

检查器本身允许只读诊断；前置失败阻断的是推进，不是禁止运行 `check`、查看 diff 或修复整备。

## Skills 代替 guidance

取消新 CLI 对 `.silvermoon/guidance` 的发现、校验和 prompt 注入。项目自行提供 `.agents/skills`，由 Agent 宿主按其正常机制加载，不由 Silvermoon 扫描或执行。

设备级通用 Silvermoon skill 仍用于说明如何消费 Check / Events 和请求人的确认；项目 skill 只补充“本项目 Spec 怎么写”。缺少可选项目 skill 不阻断整备，也不能以 skill 文本替代 Idea 中已确认的要求。

本仓库现有项目 skill 目录约定与未来产品支持的项目路径是两件事；本轮不改仓库指导文件或安装 skill。

## 本轮需要 review 的取舍

重点确认 16 位 Hex 短 ID 的时区与碰撞处理、v2 config 原样复用、上述旧参数兼容边界，以及“先签准确草稿、再提交同步”的新关口顺序。其余细节依据见补充文档；当前不请求实施、发布、alias 切换或旧 Idea 迁移授权。
