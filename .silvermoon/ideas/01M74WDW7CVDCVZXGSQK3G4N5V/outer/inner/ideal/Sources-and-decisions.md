# 来源、边界与待定设计

本文支持
[Idea](Idea.md)。以下区分用户已确认边界、只读观察和待确认建议。构想验收不等于批准具体 API、数据字段、CLI 协议或发布配置；目前尚未实现新包。

## 已确认边界

- 用户于 2026-11-11 在当前会话请求在 OKR
  Agent 新建两包，不在历史债较多的 Potential
  Guide 继续开发，不迁入整仓。通用引擎归 silvermoon-work/task-engine。
- check-task-sdk 组合 @silvermoon-work/task-sdk，提供真正减少重复代码的领域公共能力；结果、finding、证据、上下文与辅助能力是候选，不是已确认的数据模型。
- check-task-builder 的核心是 check 文件树到标准 builder 输入树的转换；之后组合上游完成整个 build，不要求作者手动串联。编译、SDK
  binding、Bundle 校验、CAR 编码和通用运行时都留在上游。
- CLI 名称是 check-task-builder。init 生成使用领域 SDK 的最小可构建项目；作者在 CLI 外编辑后 build 一次交付标准制品。SDK 不依赖 builder。
- 不扩展 objective SDK/builder、Probe 产品能力、旧调度、监管、服务端或 Web
  UI；不修改或删除旧讨论，不发布 npm、不推送 release tag、不弃用旧包。

## Potential Guide 来源及可保留语义

只读参考目录：`D:\Code\potential-guide`。观察 HEAD：
`b1e3fa7806de0f8655ca164b68bc2145704cb1fe`，远端 shazhou-ww/potential-guide。以下固定链接保留来源，不把旧仓库批准状态继承到新 Idea：

| 来源                                                                                                                                                                                                                                                                                                                                                                                                                                    | 值得讨论并保留的语义；非新 API 批准                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [check-sdk README](https://github.com/shazhou-ww/potential-guide/blob/b1e3fa7806de0f8655ca164b68bc2145704cb1fe/packages/check-sdk/README.md)、[实际适配器](https://github.com/shazhou-ww/potential-guide/blob/b1e3fa7806de0f8655ca164b68bc2145704cb1fe/packages/check-sdk/src/index.ts)、[结果 Schema](https://github.com/shazhou-ww/potential-guide/blob/b1e3fa7806de0f8655ca164b68bc2145704cb1fe/packages/check-sdk/src/contracts.ts) | 旧 createCheckTask 将 inspect 观察组装成结果；旧 pass/problems 分支、target/code/actual 和每节点 documentation 是参考，不是必须沿用的命名。执行身份来自 context.bundle.cid；不能用作者输入冒充已验证身份。 |
| [作者转换](https://github.com/shazhou-ww/potential-guide/blob/b1e3fa7806de0f8655ca164b68bc2145704cb1fe/packages/check-sdk/src/authoring.ts)                                                                                                                                                                                                                                                                                             | 语言/problem codes 同源生成定义、Schema 与资源索引，覆盖文档集合；未知/缺失资源明确失败。新工具应讨论纯树转换，不能沿用固定 staging 目录和旧 build 脚本。                                                  |
| [check-environment](https://github.com/shazhou-ww/potential-guide/blob/b1e3fa7806de0f8655ca164b68bc2145704cb1fe/packages/check-environment/README.md)                                                                                                                                                                                                                                                                                   | 真实检查示例区分正常业务不通过和启动/超时/回收故障；打包资源按文本规范化或二进制字节处理；不把内存输出存在当成交付已验证。无需搬入三套检查和整套缓存接受机制。                                             |
| [check-runtime-files](https://github.com/shazhou-ww/potential-guide/blob/b1e3fa7806de0f8655ca164b68bc2145704cb1fe/packages/check-runtime-files/README.md)                                                                                                                                                                                                                                                                               | 保留路径约束、明确输入故障及读取身份意识；旧 native owner/ACL/mutex 基础设施不是本次迁移需求，不能整包搬入。                                                                                               |
| [probe-sdk](https://github.com/shazhou-ww/potential-guide/blob/b1e3fa7806de0f8655ca164b68bc2145704cb1fe/packages/probe-sdk/README.md)                                                                                                                                                                                                                                                                                                   | Check 是独立普通 Task；消费端验证结果和资源身份，文档读取不反向改写已记录事实。Level、Override、publication、子任务编排不在本次范围。                                                                      |
| [历史 Check/Probe 对齐讨论](https://github.com/shazhou-ww/potential-guide/blob/b1e3fa7806de0f8655ca164b68bc2145704cb1fe/.silvermoon/ideas/01M6W4E8CRV8WG7Z8XZ2R9736B/outer/inner/ideal/Check-alignment.md)                                                                                                                                                                                                                              | 业务准备与通用编译分责、结果/资源/身份语义有价值；历史“两次命令”和包结构不符合本次一次 build 的作者体验，不照搬。                                                                                          |

旧实现采用完整逐语言 IPFS 文档 URI、不隐式语言回退，构建时验证文档而非运行时读取后再决定事实；这些是有价值的语义候选。是否保留文档强制性、frontmatter、索引路径及旧字段，必须单独确认。

## 上游实际接口与约束

只读参考目录：`D:\Code\task-engine`；2026-11-11 观察本地 HEAD 与远端 main 均为
`cc99c27a12a5189ea41327edc51bb770de054179`。

- [task-sdk 源码](https://github.com/silvermoon-work/task-engine/blob/cc99c27a12a5189ea41327edc51bb770de054179/packages/task-sdk/src/index.ts)：runTask(callback) 启动 Worker，TaskContext 提供 signal、bundle.cid、bundle.read 和 invokeTask。新 SDK 不应复制其 IPC、ACK、取消或资源传输。
- [task-builder API](https://github.com/silvermoon-work/task-engine/blob/cc99c27a12a5189ea41327edc51bb770de054179/packages/task-builder/src/index.ts)、
  [只读树契约](https://github.com/silvermoon-work/task-engine/blob/cc99c27a12a5189ea41327edc51bb770de054179/packages/task-builder/README.md)：buildTaskBundle(tree,
  options) 返回 ReadonlyFileTree；list 列直接子项，read 每次返回同字节的新流，逻辑路径统一使用
  `/`。依赖必须在输入树内，不能回退到工具本身的 node_modules。输出资源流是惰性的，须完整消费/验证才能认定交付有效。
- [binding 识别实现](https://github.com/silvermoon-work/task-engine/blob/cc99c27a12a5189ea41327edc51bb770de054179/packages/task-builder/src/esbuild.ts)：通过解析后的包身份识别 SDK
  binding.js/binding.ts，默认包含 @silvermoon-work/task-sdk。source.sdk 还影响 callback 模式生成的 runTask 导入；不能只改成领域包名就宣称兼容。组合 SDK 的真实依赖解析及 binding 需端到端证明。
- [task-builder-cli](https://github.com/silvermoon-work/task-engine/blob/cc99c27a12a5189ea41327edc51bb770de054179/packages/task-builder-cli/README.md)、
  [runner](https://github.com/silvermoon-work/task-engine/blob/cc99c27a12a5189ea41327edc51bb770de054179/packages/task-builder-cli/src/index.ts)：init/build/car、runTaskBuilderCli、createCliTaskProject、Node
  adapter 实际存在。runner 没有任意转换树注入口，不能假设可直接传 tree 给 CLI
  runner；一次 build 的库组合与交付路径须确认后实现，不另造编译器。上游 JSON
  stdout/错误、退出码、覆盖与部分交付规则是已观察行为，不是本 CLI 已批准协议。TS/JS
  contract 执行为受信任 Node 代码，不是安全沙箱。

## 修复、CI 与发布事实

2026-11-11 查询 GitHub 和本机 NRM 当前 Tencent
registry，未改变任何 registry 配置：

- Windows Node 22.13 文件身份修复位于 main 的
  [cc99c27a12a51](https://github.com/silvermoon-work/task-engine/commit/cc99c27a12a5189ea41327edc51bb770de054179)，该 exact-commit
  [CI 42986765023](https://github.com/silvermoon-work/task-engine/actions/runs/42986765023)
  已成功。
- registry 的 task-builder 与 task-builder-cli canary 均是
  `0.1.0-canary-261111-1`；两个对应 release tag 均指向更早的
  `bdfbdbbb5286be34844039abd0658bf4c1c1b904`。
  [Builder 发布](https://github.com/silvermoon-work/task-engine/actions/runs/42943839512)、
  [CLI 发布](https://github.com/silvermoon-work/task-engine/actions/runs/42943950635)
  及
  [发布验证](https://github.com/silvermoon-work/task-engine/actions/runs/42944685609)
  成功，但这些证据不包含后续 Windows 修复。
- task-sdk canary 为 `0.1.0-canary-261110-1`；上述三个包 latest 仍为
  `0.0.0`。npm 元数据未返回 gitHead，故以发布 tag/工作流和版本时间交叉核对，不能用 main 成功替代 registry 证明。
- 尚未发现包含该修复的新 npm 发布。实施时重新核实：若仍未发布，记录精确源码/本地 tarball 验证限制，不能静默使用未修复版本，也不能自行发布或改写上游。当前只是准备证据，不是新包构建/执行成功证据。

## 待确认设计与顺序

1. **领域公共抽象**：最小真实 check 需要哪些结果、finding、证据与上下文辅助能力？建议检查不通过是正常结果、执行故障才失败；这是建议，尚未批准具体数据契约。结合旧 pass/problems 与更通用的 finding 模型比较，不机械改名。
2. **作者 API 与目录**：回调组合方式、Schema/类型同源生成、是否保留语言/problem
   codes、文档要求、资源映射与二进制规则；最小示例应完成真实读取和判断，不只返回常量。
3. **CLI 契约**：已确定作者角色及初始化→外部编辑→一次构建场景。首版推荐仅 init/build，独立重新打 CAR 使用 task-builder
   car；若加入 car 仅代理上游。参数、默认路径、stdout/stderr、错误/退出码、覆盖/取消/部分交付与帮助仍需逐步确认，不能推断为“全部与上游一致”。
4. **包与版本**：按 AGENTS.md 两包建议使用 @silvermoon-work
   scope，工具 CLI 名仍是 check-task-builder；具体版本、发布配置和 release 映射待确认，不继承 @potential-guide
   scope。若需独立可执行入口，保持两个职责包，不无故拆第三包。
5. **进入实施**：先完成本构想的精确版本验收，再收敛最小必要 API/CLI 决策并立即实施闭环，不以穷举未来模型延迟实现。轻量下游种子可以细化；任何新增产品需求须重新确认。
