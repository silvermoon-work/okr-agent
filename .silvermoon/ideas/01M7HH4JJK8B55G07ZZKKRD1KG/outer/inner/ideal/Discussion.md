# TypeScript 项目检查讨论续接

记录 2026-11-16 会话中已明确的规则、用户偏好和待讨论方向，
不是完整工程标准，不代替本 Idea 的构想验收。

## 问题驱动，而不是函数驱动

先明确每个 checker 负责发现什么问题、检查什么对象、依赖哪些事实、
失败后阻断什么，再定义 children 与模块。不能只是把旧函数套进 defineChecker。

事实读取可以执行内共享 Promise；不要把产生 problems 的 CheckerResult
当作通用事实缓存，也不要依赖共享可变变量或兄弟节点执行顺序。
registry 显式组合，保留名称与 target schema 的关联，不要求逐叶一个文件。
职责树用于理解；执行仍是有去重、共享节点和环处理的 graph search。

## 已确认的根检查

根目标是确认“这是一个 TypeScript 技术栈 repo，并识别组织形式”，
不是先要求目录安全、scripts、tools、deliverable 等全套合规。

- 根 package.json 是有效 JSON 对象。
- TypeScript 依赖声明、tsconfig 或 TS 源码中任一明确依据即可识别技术栈。
- 有 workspace 声明就是 monorepo，否则就是 single repo；不按成员数量猜测。
- 身份不成立报告 typescript-project-invalid，brief 给具体原因。
- 身份成立只展开 single-repo 或 monorepo 中一个分支。
- 当前两个分支都是通过叶；用户明确不要“未实现”problem。
  通过只证明已实现规则成立，不能称为全部工程合规。

配置内容、成员声明完整性、依赖版本和交付要求属于分流后的检查，
不能作为技术栈身份的提前总闸门。I/O、取消、非法调用及执行预算属于执行故障，
不是项目不合规 problem。

## monorepo 的分层方向

用户提出分为 workspace 全局配置与 packages 两大类。
工具、全局 README/AGENTS 等文档属于全局配置。

候选脉络尚待逐层确认，不能直接全量实施：

```text
monorepo
├─ workspace
│  ├─ workspace 声明与全局依赖配置
│  ├─ 开发工具与环境
│  ├─ 根 scripts 与聚合操作接口
│  ├─ 全局文档与基本结构
│  ├─ 共享检查配置
│  └─ CI 与全局任务编排
└─ packages
   ├─ 成员发现及成员关系
   └─ 各 package
      ├─ manifest / scripts
      ├─ 源码、测试及适用配置
      ├─ 依赖声明
      └─ deliverable 及类型专项
```

不要强迫成员重复根工具声明或复制共享配置。scripts 检查操作接口，
不包办 TS、测试、覆盖率等领域配置检查。基本文件结构只看该有的文件是否存在，
内容由所属领域检查，避免重复报告同一缺失根因。

## package 级 deliverable 方向

用户更倾向于每个 package 自带 deliverable.yaml，而不是全局清单。
single repo 与 monorepo 使用同一结构：

```yaml
type: npm
details: {}
```

用户明确的语义：

- 结构为 `{type:string,details?:object}`。
- 文件缺失等价于 `{type:"none"}`，表示没有任何 deliverable。
- 描述当前 package，不需要重复写 package 路径。

尚未实施；以下只是会话建议，需要继续确认具体政策：

- 文件存在但 YAML/schema 非法应报告问题，不能降级为 none。
- none 不豁免普通工程检查；不从 private、exports 或 build 猜交付意图。
- type 保持开放，未知类型的专项支持策略待定。
- monorepo 根是否也承担 package 职责、none 是否允许 details、
  多交付诉求如何表达，都尚未确认。

当前根 silvermoon.yaml 与发布器仍采用全局 deliverables。迁移时须协调
scripts/lib/deliverables.mjs、发布消费方和对应资产，避免双权威；
本次框架和协议迁移没有修改交付政策。

## Check 输出与过程

用户要求最终业务结果保持 pass / 不通过报问题，而不是检查图报告。
已明确保留整体文档和问题来源，删除 protocol、root、nodes、edges。

- 过程通过 context.log。
- graph search 的过程投影为生成树，节点只有首次发现的 parent，
  根无 parent；不保留所有来源边。
- parent 是首次发现关系，不是全父 join，不保证并发日志完成顺序。
- 不按 code/brief 全局合并独立问题。

新版 Task 取消 output space 后，文档直接返回 ContentRef；
Task SDK 按 ContentRefSchema 生成 `{data,cidPaths}`，数组文档使用通配符。
不手动编造文档 CID、outputCid 或逐下标 cidPaths。
不要恢复另一个 thread 曾建议的 check-report/v3 或图字段。

## 术语与下一步

- Task parameters 是发起任务的业务参数；根 checker 直接将它作为 target。
- Checker target 是当前节点的检查对象；context 是宿主执行能力。
- `Parameters/parameters` 替换残留 `Input/input` 是命名建议，尚未统一实施。
- 用户询问“项目应该使用哪个 Check CID 是否应属于项目”；会话建议是项目级
  固定准确 CID，而不是 package deliverable。配置格式、执行授权和升级策略未定，
  尚未实施，也不能让目标配置自动授权执行任意 Bundle。

下一会话从 monorepo 的 workspace 声明及成员发现开始，逐层讨论问题与边界。
不要立即恢复旧工具、scripts、交付等全部规则。用户要求每轮完成后 build CAR，
提供一条可复制命令试跑，再继续讨论。

## 本轮确认的 workspace 规则

- monorepo 必须提供根 pnpm-workspace.yaml；已有 monorepo 依据但缺少该文件
  时报告 problem，不退回 single repo，也不以 manifest workspaces 替代成员配置。
- 显式声明非空 packages 字符串数组，每项不得为空白；YAML 或声明结构
  非法属于 workspace 配置问题，不属于 TypeScript 身份问题。
- 成员发现遵循 pnpm 的模式语义，不强制 apps/、packages/ 或固定深度。
- 本轮先实现 workspace 声明结构检查，不展开成员模式。空匹配、缺少成员
  manifest、名称冲突和根包是否计入成员仍待讨论，不能作为已确认规则实施。
- 继续采用快速迭代：每轮完成实现与验证、构建新 CAR，提供检查本仓库的命令，
  由用户观察效果并反馈，不等待全部规则讨论完毕再交付。
