# 技术调研问题与覆盖范围

## 性质与同步方式

用户已授权开展技术调研，结果放在旧 Silvermoon 的 ideal 层；本文件及结论不记录新的 acceptIdeal，也不启动实现。

以下“用户关注”来自本次已表达的要求，不是假定用户逐项签署了问题目录。Agent 的实现责任覆盖这些问题，并补充必须解决的技术问题。后续可在这个清单上继续选择、补充和修订。

## 用户关注的关键问题

| ID | 调研问题 | 结果入口 |
| --- | --- | --- |
| R-Q01 | 三套完整 Spec 加两个独立索引的五次 sign off，如何由 Events 的含 level 状态与 Checker 驱动，而不是另一套 CLI 状态机？ | [审阅稿：共识与版本](technical-review.md#共识与版本绑定) |
| R-Q02 | 如何保留设备、项目、primary 整备，又允许审核未提交的 Spec diff？ | [审阅稿：整备与草稿](technical-review.md#整备与草稿) |
| R-Q03 | 旧 CLI 的哪些命令和参数沿用，reference 如何被 CID 读取替代？ | [审阅稿：命令设计](technical-review.md#命令设计建议) |
| R-Q04 | config 如何尽量不变，内容语言如何继续控制文档而非问题翻译？ | [审阅稿：配置与语言](technical-review.md#配置与语言) |
| R-Q05 | 16 位分钟级加 4 位 Hex 的短 ID，如何定义时区、排序和碰撞处理？ | [审阅稿：新-id](technical-review.md#新-id) |
| R-Q06 | `.silvermoon/i` 如何与仅留档的 `.silvermoon/ideas` 隔离？ | [审阅稿：存储边界](technical-review.md#存储边界) |
| R-Q07 | 无 guidance 时，项目 skills 与通用 Silvermoon skill 如何分责？ | [审阅稿：skills](technical-review.md#skills-代替-guidance) |
| R-Q08 | 实现和部署验收的 Evidence 如何替代 ledger，而不成为自报成功？ | [审阅稿：共识与版本](technical-review.md#共识与版本绑定) |

## Agent 仍需覆盖的补充问题

| ID | 调研问题 | 结果入口 |
| --- | --- | --- |
| R-Q09 | 当前 SDK 能否表达顺序前置？并发 child、fail 剪枝与 DAG 去重有什么限制？ | [补充：检查图](technical-notes.md#检查图与执行身份) |
| R-Q10 | Engine 是否重用相同输入的结果，如何确保每次观测读取当前事实？ | [补充：执行与回收](technical-notes.md#engine-执行与回收) |
| R-Q11 | 当前 Task result、ContentRef、节点日志实际是什么协议？文档相对链接如何读取？ | [补充：输出与内容](technical-notes.md#结果与内容读取) |
| R-Q12 | 平级 Spec 如何绑定全部补充内容及上游依赖，独立计算索引版本，并在已签内容修改后准确回退重签？ | [补充：版本模型](technical-notes.md#版本模型与证据) |
| R-Q13 | Events 并发、重试、主分支边界、崩溃及无效历史如何处理？ | [补充：事件写入](technical-notes.md#events-读写边界) |
| R-Q14 | 包、Check CAR、skill、旧 unscoped 入口如何交付且不提前自举切换？ | [补充：交付](technical-notes.md#包与发布边界) |
| R-Q15 | 哪些结论已有源码或运行证据，哪些仍是待批准的方案和待实现验证的假设？ | [补充：验证](technical-notes.md#调研验证与限制) |

## 当前状态

已完成旧源码、当前 SDK / Engine / IPFS Store 公共接口的只读核对，提出可审阅方案。最终 schema、全部命令输出样例和完整 Test Spec 尚未定稿；不能把本清单或技术提案当成人已 sign off。
