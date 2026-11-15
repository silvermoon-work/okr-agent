# Implementation

实现与作者侧验证已完成；以下映射先于代码修改记录。
这不是生命周期批准，也不表示父会话负责的独立消费者 Deployment 验收已完成。
依据[构想与检测树规划](./ideal/Idea.md)展开，不扩展现有规则范围。
Cloudflare 交付专项延后；本阶段不迁移、不扩展该专项，既有行为保留。

用户已明确授权主会话自主负责全部门禁审批，无需再次询问；这是审阅责任的委托，
不是豁免质量门限。主会话复核了 SDK、两包的局部前置、共享根因和直接调用点，
并要求修正最初仅传 selector 的偏差；最终 checker 接收完整 `{ type, selector }`，
类型、测试、作者调用及文档已一致，源码与既有 Cloudflare 专项保持范围边界。

## Steps

### I-S01: 确认职责映射与局部前置

对照两个 Check 的实际入口、规则、输出归因与回归，细化 package/deliverable
分支及多工具关系的局部前置；先确认通用项目、非 Cloudflare 交付、共享配置与
根因归并方式，保留混合项目的既有平台兼容边界后再改代码。

现有规则映射：

- `inspect.ts` 的范围扫描、workspace 发现与 manifest 解析拆为目录、拓扑、
  成员前置；现有全局 return 不再阻断独立根文档与已确认成员。
- `Scripts.validate`、固定 scriptProfile、packageManager/lockfile、TS strict/
  include、ESLint preset/projectService、Vitest 发现/非 watch/coverage、Prettier
  与质量/native CI 保留原分析器，按成员、配置或根职责注册。配置失败只剪去
  依赖字段证明；共享配置报告仍按原因归并并列出成员与实际执行 root。
- `convention.ts` 的 Node 官方新鲜事实/最低版本、pnpm/catalog/lock/peer、
  文档/Agent/gitignore、固定 gate、npm 元数据/emit/allowlist/发布工作流/
  私有包发布证据按根、成员、交付声明与 npm 职责分开。显式声明保留开放类型；
  task-bundle 不新增专项，Cloudflare 原调用与混合项目静态配置解释不变。
- 工具链 `locate/run --version` 是每个工具的共享、Run 内前置事实；
  minimumVersion 是叶检查。pairing、逐工具 management、active registry、
  nrm 注册项各自声明必要工具前置；缺工具归并一次，不阻断其他关系。
  现有原生配置优先级、nrm 身份保护、命令预算和回收实现原样复用。
- SDK 不包含任何上述领域规则、缓存策略或多工具调度；只负责类型注册、
  selector/result 校验与有序串行 DFS。I/O/协议/取消/清理故障不转成业务成功。

### I-S02: 迭代 SDK 的 TargetChecker 内核

提供类型安全的目标/成功子项/非空问题结果、类型注册、根参数与串行 DFS
编排，保留受限 Check 上下文和公开输出协议，增加针对性行为测试与作者文档。

### I-S03: 迁移两个 Check 的实际入口

让 `check.typescript-project` 与 `check.nodejs-toolchain` 使用新内核承担
通用项目、非 Cloudflare 交付与工具链的目标展开和剪枝，复用现有解析/探测
帮助函数；同步直接调用点、测试及相关文档。Cloudflare 专项保持既有实现，
不以关闭旧检查代替本阶段范围收窄。

## Acceptance criteria

### I-AC01: SDK 编排语义可验证

类型检查和行为测试证明根参数推导、成功叶节点、有序 DFS、失败必有问题、
剪枝未调用子 checker、兄弟继续、未知类型/异常/取消故障传播；不引入第二套运行时。

### I-AC02: 两包迁移保留规则并改善阻断结构

实际入口/调用记录证明不是旧流程的外层包装；既有回归与新局部阻断测试
覆盖规划中的单包、非 Cloudflare 交付、成员/共享配置失败和工具关系；
混合 workspace 不把 Cloudflare 交付误分派为 npm，相关通用检查与旧行为保留。
公开输入、问题码及文档/资产协议保留；任何必要的诊断顺序/归并变化均说明原因。
本阶段不要求 Cloudflare 专项迁移或新增平台功能测试，也不将其声称为已完成。

### I-AC03: 交付构建与质量门禁通过

SDK 与两个 Check 的适用 build、typecheck、lint、格式、测试/覆盖率及
SDK package lint 通过，根 `pnpm check` 通过；不得弱化已有门禁。
两个作者包生成可校验的新 CAR，记录准确 CID，不改写历史制品。

## 实现证据

### 实际职责与局部剪枝（I-S01、I-S03、I-AC02）

- `inspect.ts` 已按类型注册目录、拓扑、manifest 故障、成员脚本前置/脚本、
  TS、ESLint、Vitest 配置、测试字段、覆盖率、格式、CI 与维护职责；
  不是旧 inspect 的 `$root` 包装。`convention.ts` 同样注册 Node 选择/LTS、
  运行范围、pnpm、独立依赖声明、catalog/lock 前置、成员解析/peer、根文档/
  gate、交付声明/发现、npm 元数据/build、publisher/release/compatibility。
- 不可信拓扑仍执行根文档与可读取的默认 Node 选择检查；一个成员 manifest
  缺失/非法不阻断其他成员。不可用成员不参与配置导入发现或交付映射派生，
  npm 兄弟继续，原 scope 根因不再被重复误报为路径未登记。
- 成员脚本上下文是共享 profile 与成员 scripts 各自显式取得的前置；
  自定义 shell/hooks 只阻断依赖它的脚本证明，成员配置及其他成员继续。
  lock/config 无法解析不抑制独立的依赖声明、文档、Node 或 TS 发现。
- 共享配置按原因归并，保留受影响成员和实际 root；Vitest 结构不可信时不展开
  字段/coverage，测试发现或 watch 叶失败不自动阻断可确认 coverage。
- Node 工具事实与 Windows nvm 安装观察均仅在本 Run 复用；关系节点显式
  取得必要工具后才展开 rule 叶。版本过低是叶失败，不阻断可执行 pairing/
  registry。Unix nvm 按受检工具范围核验 provenance，不依赖 node 兄弟排序。
- 新测试记录 `Scripts.validate`、配置读取、locate/run/npmLocation 调用：
  缺失/非法成员的 TS/ESLint/Vitest 配置及其 scripts 未被调用，兄弟仍检查；
  缺工具时关系探测未调用，registry/nrm 兄弟及低版本之后的约束继续。
- 诊断数组按新目标职责的串行 DFS 次序形成，旧跨领域先后可调整；共享配置先
  归并再报告。原输入、问题码、missing/mismatch/unconfirmed 归因、文档/资产
  协议及现有 CAR/Engine 回归保留。新增独立发现不再被旧全局 return 隐藏。
- `src\cloudflare.ts`、`worker-module.ts`、标准 assets、固定 publisher 核心、
  Node/消费者最低版本、catalog、release version 与历史制品未修改。
  Cloudflare 旧调用和混合项目通用配置兼容保留；未新增或声称新平台专项覆盖。

### SDK 编排证据（I-S02、I-AC01）

新增 `createTargetCheckers` 与 `Target`、`TargetResult`、`TargetProblem`、
`TargetCheckerRegistry`、`TargetChecker`、`RootTargetChecker`；TypeBox 对象 selector
注册推导 `$root` 原参数和各类型 selector。每个 checker 接收完整
`{ type, selector }`，映射注册表将 type 字面量与 selector 类型关联；
编排器调用 `checker(target)`，作者通过 `{ selector }` 解构继续使用原规则。
SDK 只执行校验与有序串行 DFS，不包含作者规则、
通用 DAG、去重、缓存或并行调度。成功空子项为叶，失败必须非空 problems，
只剪本分支；未知类型/非法 input/result、取消、异常、报告器/协议/清理故障
继续抛出，不转成正常 CheckResult。旧受限回调及 output 链接协议未改。

SDK 定向 25 用例证明完整 target/type 与原 selector 交付、参数推导、
DFS/叶/根失败、剪枝与兄弟继续、重复运行状态隔离及未知类型/非法结果/
异常/取消；既有 14 回调用例继续通过。

### 准确质量成绩（I-AC03）

开发环境始终为显式 PATH 中的 Node `v26.13.1` 与 pnpm `11.28.12`；
每次 PowerShell 检查均先设置该 PATH 并核对 `node --version`。
没有安装、升级依赖或更改 registry/全局工具。

| 检查 | 成绩 |
| --- | --- |
| SDK 定向 `pnpm --filter @silvermoon-work/check-task-sdk exec vitest run --root . --config ..\..\vitest.config.ts test\targets.test.ts test\check.test.ts` | 25 个 target 用例 + 14 个既有回调用例全部通过 |
| TS 定向 `pnpm --filter @silvermoon-work/check.typescript-project exec vitest run --root . --config ..\..\vitest.config.ts test\inspect.test.ts` | 最终 107 通过；另以同 runner 合并 inspect-unit、convention、deliverables、publisher-profile、script-profile selectors 通过 |
| 工具链定向 `pnpm --filter @silvermoon-work/check.nodejs-toolchain exec vitest run --root . --config ..\..\vitest.config.ts test\inspect.test.ts` | 58 通过，4 个既有显式 native 场景默认跳过 |
| SDK / 两个作者包的 build、typecheck、typed lint、覆盖率；SDK package lint | 通过，固定格式检查/源码范围/四门限未弱化 |
| 根 `pnpm check` | **2026-11-15 10:32 完整 target API 修正后最终通过，退出码 0**；format-check → 依赖有序 build → types → lint → coverage → test-release → publint → check-scripts 完整通过 |
| `silvermoon check --worktree --audience agent --language zh-CN` / `git diff --check` | 通过，退出码 0；accepted ideal 仍为 `b952be5344a543fb52f8f695e16160e891ef0279`，events sequence 仍为 4，未提交/批准实现或 Deployment |

最终根门禁的全包成绩（statements / branches / functions / lines）：

- SDK：39 测试通过；98.91 / 98.75 / 100 / 98.86%。
- TS 作者：611 测试通过；94.06 / 90.48 / 99.01 / 95.03%。
- 工具链作者：116 测试通过、4 个既有 native 场景默认跳过；
  96.69 / 93.97 / 100 / 97.72%。
- root release 回归 13 通过；其他 workspace 和 Builder 也通过根门禁。
  全局四项均 >=90%，包含未改源码。完整日志为 `dist\target-checker-root-check.log`。

早期工具链覆盖率曾为 branches 89.33%，门禁明确失败；补充实际 Unix
provenance/局部关系与 Run 隔离行为测试后达到上述成绩，未降低门限或删测试。
开发中的类型/lint/顺序和 scope 回归失败均修复后重新验证。

## 当前本地交付身份（非发布）

以下路径均相对于本 worktree
`D:\Code\okr-agent.worktrees\target-checker-implementation-dfs`。

| 类型 | 准确路径 | CID / 字节数 |
| --- | --- | --- |
| **生产 TS CAR**，真实官方元数据适配器 | `packages\check.typescript-project\dist\typescript-project.car` | `bafybeifmac4srult3w6hunlixc2afhrdbdrvpdgmn6tdmybegab7hogbba`；704654 |
| **生产工具链 CAR**，授权原生探测适配器 | `packages\check.nodejs-toolchain\dist\nodejs-toolchain.car` | `bafybeihg3hca453wf4ukcx6ulqw76qzxdlyfuaij37tsrckxjnrdyrnu6i`；311544 |
| **仅确定性元数据验证 TS CAR**，`check.fixture.build.yaml` / `test\worker.ts` | `packages\check.typescript-project\dist\verification\bundle.car` | `bafybeidqbbwbfczams6roqphvrsa6jowrwikxbxl2txtwvcxssao5wzsde`；705665 |

生产 CAR 的 Builder 输出根 CID 与实际 CAR Reader 身份已核对；最终 build
由根 check 执行。确定性 CAR 不是生产元数据证明，也不替代生产 CAR。
作者侧 CAR/公开 Engine 回归验证通过/不通过、7 个非法输入拒绝、执行故障、
取消及回收；output 中文 references 和标准 assets 可读取且字节一致。
Node 生产 CAR 在受控工具目录的 Engine 回归通过，并核验配置不变与子进程回收；
受控工具不是新增原生跨平台支持证明。

父会话可直接使用实际测试保留的目录，无需 import 作者私有帮助函数：

- 通用通过：`packages\check.typescript-project\dist\verification\good`
- npm 通过：`packages\check.typescript-project\dist\verification\npm`
- 不通过：`packages\check.typescript-project\dist\verification\bad`
- 成员剪枝：`packages\check.typescript-project\dist\verification\member-pruning`
  （bad manifest + 可检查 good 成员 + 根 README 叶失败）
- 对应作者侧 Engine 报告：
  `packages\check.typescript-project\dist\verification\engine-fixture-report.json`

这些受控 fixture 的确定性通过/不通过成绩与验证 CAR 配套；生产 CAR 仍采用
真实新鲜元数据，不把 mock 成绩描述成生产版本合规或父会话独立消费验收。
保留的 Cloudflare fixture 只是既有回归，不是本轮专项迁移证据。

SDK 构建目录为 `packages\check-task-sdk\dist`，含 targets JS/types 及两种 maps。
本地未发布验证 tarball：
`dist\silvermoon-work-check-task-sdk-0.1.0-rc.1.tgz`，
SHA-256 `8903dc5030f978b48181a62165e3eb738c5f98e8938c02f39bedd97b20d129ff`。
核对 packed manifest 的 identity/version/engines 与新模块、maps 均存在；
包名/版本/消费者最低值没有变更，不表示 registry 既有 rc.1 已包含新 API。
pnpm 11 不接受旧 `pack --ignore-scripts` 参数，已显式改用命令级
`--config.ignore-scripts=true`。完整 target API 修正后重新执行
`pnpm --config.ignore-scripts=true --filter @silvermoon-work/check-task-sdk pack --pack-destination dist`，
直接生成根 dist 中的新 tarball；核对 packed index/targets declarations 导出完整
target 参数的 TargetChecker/RootTargetChecker。SDK/Builder publint 通过。

### 父会话复查后的 API 修正

父会话指出早期实现只向 checker 传 selector，与接受的模型不一致；
现已修正 SDK 的映射注册表及 `checker(target)` 调用，暴露完整 target 的
`TargetChecker` 和 `$root` 别名。两个作者包的所有注册函数及直接前置调用、
SDK 测试和作者文档同步更新；规则主体、TypeBox selector 校验、同步结果便利、
串行 DFS 与故障/输出语义均保持。新增聚焦测试核验 type、selector 原对象以及
注册类型的字面量绑定；修正后 SDK 定向 39、TS 合并定向 199、工具链合并定向
59（4 个既有 native 场景默认跳过）全部通过，随后完整根门禁通过。
本节表格和所有 CAR/tarball 身份均为该修正后的实际重建结果，先前候选身份已替换。

没有未解决的作者实现/质量门禁问题；生产发布、远程上传/部署、原生额外验证
以及父会话独立消费者验收仍未执行。未修改 events、ideal、Deployment，
未批准生命周期门、commit、push、恢复 stash 或 staging；D-* 留待父会话。
