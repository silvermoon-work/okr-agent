# 交付边界、旧版过渡与待决问题

## 已明确的方向

- 在本 monorepo 重建 `@silvermoon-work/silvermoon`，以现有 Checker / Task Engine 为基础。
- CLI 命令设计原则上参考旧 Silvermoon，优先延续既有使用习惯，必要差异明确说明。
- 保留控制 Agent 文档写作语言的多语言支持，与 Checker 问题及 CLI 输出语言解耦，不以输出本地化为目标。
- 后续将无 scope 的 `silvermoon` 改为代理新包的 alias / 兼容入口；具体实现与切换时机另定。
- 需求、方案、测试约定、Events 与可提交证据留在 Git，方便长期追溯。
- 本次不保留新模型的三层世界术语、层层嵌套和必备 ledger。
- 人在 ideation 中分轮确认需求、关键技术方案、验收约定；实现与部署完成后的结果验收由 Agent 执行举证。
- 最新 ID 为分钟级 `YYYYMMDDHHmm` 加 4 位 Hex 随机码，共 16 位，不再沿用 ULID；此前 33 位方案被替代，先前“Base64”已由用户更正为 Hex。
- 新 Idea 只放在 `.silvermoon/i`；旧 `.silvermoon/ideas` 原样留档，新 CLI 不消费、不迁移旧 Idea。
- config 尽量延续旧版；取消 guidance 读取与注入，由项目自行用 `.agents/skills` 指导 Spec 写作。
- 不保留专属 `reference` 命令，改用 Check documentation ContentRef 读取说明。

## 这次工作与未来产品必须分开

本 Idea 的创建、文档、ledger、事件、提交同步和人工关口继续遵循当前设备级旧 Silvermoon，不把尚未开发的新规则用于这次 Idea。

本 Idea 下现有的 `outer/inner/ideal` 目录、`Implementation.md`、`Deployment.md` 和 `ledger.md` 是旧工作流的必要承载，不代表未来 Silvermoon 仍保留这些设计。

本次创建和后续调研仅记录构想及支持细节，不表示用户已批准这份准确版本，也不表示开始实现。用户已授权技术调研，并要求结果继续放在旧 ideal 层；详见[调研问题清单](research-questions.md)、[关键技术审阅稿](technical-review.md)和[补充技术调研](technical-notes.md)。准备阶段的 Implementation / Deployment 仍是可调整的高层种子，不是本 Idea 已进入实施阶段。

新包发布后再显式尝试新 Silvermoon。不可在发布前自动替换当前全局 CLI、个人 skill 或当前项目的旧协议。试用新版本不等于默认迁移全部历史 Idea。

发布仍需另行明确授权准确版本和提交；创建、提交、同步此 Idea 不构成 npm 发布、发布标签或 dist-tag 修改授权。

## 技术阶段需要回答的问题

以下是待调研项目，不是假定已决定的实现方案：

1. Check CID 如何选择、固定和升级？Target 如何稳定定位仓库中的 Idea？
2. 盘点旧 Silvermoon 命令后，哪些职责、命名、参数与用法沿用，哪些需调整及其理由是什么？human / agent 呈现、结构化输出与 skill 协作契约如何适配？
3. 新 Spec 目录和引用如何计算版本？调研问题、关键结论、测试目录与具体用例分别如何确认？
4. 哪些变化使哪些确认或验收失效？如何处理只改补充文档、修订方案和变更需求的不同影响？
5. 未提交草稿审核与设备、项目整备如何划界？何时要求提交、同步、primary 可达，如何防止跨草稿偷偷推进？
6. Events 的新 schema、追加约束、并发与主分支同步如何设计？如何明确记录人的确认而不推断授权？
7. Agent 的语义 review 如何成为可检查事实？验收证据如何绑定当前用例、准确制品与环境，并处理故障、缺失、陈旧和重试？
8. 哪些旧设备和项目检查直接复用，哪些需适配新的 Checker？如何保证前置失败不继续展开 Idea？
9. 旧 Idea 已确定不迁移、不消费；新目录、16 位短 ID 和尽量不变的 config 如何实现并存，且旧目录的损坏不影响新 Idea 检查？
10. 新包、Check Bundle 与 skill 如何交付？旧 `silvermoon` alias 如何转发并避免二进制、全局安装和版本冲突？
11. 新发布后的受控试用环境、测试场景及回退方式如何选择，如何在不影响旧流程的情况下验证？
12. 参考旧 Silvermoon，文档内容语言如何配置、继承、覆盖、修改并明确传递给 Agent？如何验证它不受 Checker / CLI 输出语言影响？
13. 新 ID 的时间统一使用什么时区？4 位 Hex 的大小写、同分钟随机顺序、时钟回拨、无效日期和目录碰撞如何处理？
14. 取消 guidance 后，通用工作流 skill 与项目 `.agents/skills` 如何分责，并确保新 CLI 不隐式解析或执行项目 prompts？

## 后续验收规划的重点

后续细化测试目录时，覆盖三套 Spec 的多轮协作、修订与失效；设备/项目前置阻断及草稿例外；同一检查对象的多次 Run；事件历史与证据引用的错误输入；两种 audience 的业务一致性；Implementation / Deployment 的实际验收，以及旧数据和全局 CLI 不被隐式破坏。

这是一份覆盖方向，不替代后续应与人确认的完整测试目录、具体用例及环境。
