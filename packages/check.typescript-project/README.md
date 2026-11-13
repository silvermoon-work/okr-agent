# @silvermoon-work/check.typescript-project

检查 TypeScript 项目是否符合固定的长期维护约定，覆盖开发环境、工具依赖、代码检查配置、Agent 操作接口、工作流以及文档结构。支持单包和 pnpm
workspace，并对承担 npm ESM 发布职责的项目检查额外的交付配置。

本包保持 private，通过构建后的 `typescript-project.car` 交给 Task
Engine 执行。检查只读取目标项目，不运行其代码、配置模块、测试、安装或发布命令，也不会自动修改文件。

## 输入

提供执行机上的项目绝对目录：

```json
{ "projectDirectory": "D:\\Projects\\example" }
```

规则由 Check 固定，不接受 `context`、`requirements`、`projectScopes`
或其他额外字段。pnpm workspace 成员根据项目声明发现。

## 检查内容

- **环境**：默认 Node.js 版本、LTS 支持周期、成员运行时要求和 pnpm 版本。monorepo 所有适用代码包（包括 private）解析出的最低 Node 必须一致，纯聚合 manifest 不参与，完整范围可以不同；缺失/非法先各自报告，不自动提高消费者下限。
- **工具依赖**：只检查已规定的必要开发工具，单包与 monorepo 都要求其 devDependencies 引用根默认/named
  catalog；检查准确 lockfile
  importer、版本系列新鲜度及 Node.js/peer 兼容。自由扩展依赖不查询元数据或报不受支持，普通 dependencies 不受新增 catalog 规则约束。
- **规范与交付**：TypeScript 严格配置、类型感知 lint、格式检查、单次测试、覆盖率门限和适用的 npm
  ESM 产物配置。四项覆盖率门限由项目明确声明为有限的 0..100 百分比，不设统一最低值；可选 autoAttachSubprocess 只接受 boolean，不证明已启用覆盖率或映射正确。
- **Agent 接口**：所有 package scripts 必须为
  `node scripts/<同名>.mjs`（无参数），所有名称禁止冒号；与 scripts 顶层 .mjs 入口严格双向一一对应。共享模块只放
  `scripts/lib/`。typecheck、lint、format、format-check、test、test-coverage、lint-package、check 及两个发布入口使用随 CAR 交付的固定实现和必要 lib，按准确字节比较（仅归一化换行）；build 和项目扩展入口可自定义。
- **工作流**：main 更新与既有 PR 入口采用固定质量 CI，执行 pnpm
  check，全部必需 job/矩阵/聚合成功才合格；release
  tag 的固定发布 CI 只复用已有相同完整 SHA 的成功 main-push 固定质量 CI，不重复 check、不自动补跑。发布特有保护仍全部执行。
- **文档与结构**：工作区声明、必要文档、固定 Agent 约定和忽略规则。

根 `AGENTS.md`
与随 CAR 交付的[标准文档](assets/AGENTS.md)比较；项目自定义指导放在
`docs/agent-project.md`。README、CONTRIBUTING 与扩展文档仅检查存在、可读及非空，不评审关键词质量。

## 结果

结果包含 `pass` 和检查文档路径；不通过时，`problems`
列出问题码、说明及对应文档路径。问题区分明确缺失、不满足和无法确认，不把未知配置或网络失败当作通过。

前置问题会抑制依赖它的连带报告，其他成员和独立检查继续执行。检查结果中的文档及标准资产通过 Run
output 的 `references/` 和 `assets/` 读取，不依赖作者源码目录。

质量 workflow 先与 [npm-ci.yaml](assets/npm-ci.yaml)
比较固定结构，再校验唯一有限参数 jobs.compatibility.strategy.matrix.node-version。现有矩阵位于其他 job 时报告实际路径/值与标准结构差异，不误报矩阵未定义，不追加派生矩阵或发布绑定问题。固定权限、触发和失败传播不可扩展绕过。

非法输入、意外 I/O 故障和取消属于执行故障，不会转换为正常的通过或不通过结果。

## 联网与支持边界

Check 查询官方 npm 发行元数据、Node.js 历史发行索引及官方生命周期文件，以确认版本与兼容性；不会读取或修改目标项目的 registry 设置。元数据查询使用固定来源和有界预算，无镜像、旧快照或其他来源回退。

无需 scripts.config.json 或重复声明全部拓扑。固定实现从 pnpm
workspace 成员、manifest 内部依赖与脚本职责及既有工具配置推导动作，按依赖顺序构建后聚合类型、lint、覆盖率和适用包校验，串行传播失败；共享根配置无需每个成员重复入口。配置来源不等于执行根：共享 Vitest 配置仍分别在各代码成员执行，并显式传入 --root
. 和 --config。类型配置按配置文件位置解析 include，ESLint 显式 --config 的匹配范围按成员 cwd 解析。无法确定配置职责时阻断，不猜通过。标准字节及必要 lib 不可自由修改，详见[检查参考](references/check.md)。发布支持根/唯一代码包及显式选中一个 workspace 成员，共用一套严格保护核心，不要求额外 release.config.json；优先复用已有 scripts/lib/release-packages.mjs 身份/tag 映射，CI 矩阵直接读取真实 workflow。

Check 不执行目标代码：固定文件完整性与配置证明受支持的静态机制，不代表本次类型检查、覆盖率成绩、构建产物或线上发布已通过。自定义 build/扩展内部不解释，也不因未知实现报错。brief 包含目标路径、配置项及观察值；通用修复文档仍从 output 读取。开发 Node 必须精确匹配官方索引中最高 SemVer 的稳定、已标 LTS 且当前 schedule 仍支持的发行版；接受 registry、Node 索引和 schedule 官方端点的缓存延迟，不另设缓存年龄上限，按本次响应中的版本事实判定。Date/Age 与缓存状态保留为证据；请求失败或数据不完整、冲突仍无法确认，不回退旧成功。

完整规则、支持语法、网络端点与预算见[检查参考](references/check.md)；npm 发布配置的支持范围见[单包与 workspace npm publisher v1](references/npm-publisher-v1.md)。
