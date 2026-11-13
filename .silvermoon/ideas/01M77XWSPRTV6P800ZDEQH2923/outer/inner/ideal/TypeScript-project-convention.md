# TypeScript Project Convention

面向 Agent 长期维护的 Node.js
TypeScript 项目约定。它描述一个项目应当如何配置、验证和持续维护，不要求项目继承特定 preset，也不要求逐字复制模板。

对外统一为 `@silvermoon-work/check.typescript-project`，输入只有：

```json
{
  "projectDirectory": "D:\\Projects\\example"
}
```

标准由 Check 固定；单包、pnpm
workspace 和 npm 交付是内部识别的适用分支，不另设 monorepo 或 npm-package
Check，不允许输入筛选成员或调整合格线。

## 1. 环境配置

### 声明位置与作用范围

开发工具链的推荐版本与包的运行兼容范围是两件事，不能用 engines.node 推断开发者应选择哪个版本。

| 声明        | 单包仓库                                                   | pnpm workspace / monorepo                                                |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| 开发 Node   | 仓库根 .node-version 声明推荐的精确开发版本                | workspace 根 .node-version 统一声明默认开发版本                          |
| 开发 pnpm   | 根 package.json 的 packageManager 精确锁定                 | workspace 根 package.json 的 packageManager 统一锁定，管理整个工作区安装 |
| 运行兼容性  | 该包 package.json 的 engines.node 描述运行或消费者兼容范围 | 各包在自身 package.json 中声明适用的 engines.node；根声明不能替代成员    |
| CI 工具选择 | 读取根版本声明，另外执行必要兼容矩阵                       | 读取 workspace 根统一声明，另外按成员兼容范围安排矩阵                    |

- 开发版本不是最低兼容版本：开发环境始终使用最新 LTS，包的运行兼容范围可以更宽，但必须包含所选开发 Node。消费者最低 Node 不必运行所有现代开发工具；兼容矩阵不能反过来替代默认开发声明。
- 根默认 Node 必须能运行所有在该环境中维护的成员及其开发工具；不能只验证根 package.json。
- 同一 monorepo 的所有适用代码包必须声明一致的最低受支持 Node 版本，包括 private 代码包；纯聚合根不作为独立运行包比较。Check 根据各包 engines.node 的有效 SemVer 范围解析最低版本并比较，不要求范围文本或完整范围相同。缺失或无法解析分别报告，不以默认值代替。最低版本不一致时列出相关 package.json 路径、原始范围和解析结果，不自动选择最高下限、缩窄包兼容承诺或修改声明。开发环境仍独立使用最新 LTS，最低运行兼容验证不要求执行全部现代开发工具。
- 成员不自行选择不同的默认 pnpm 或开发 Node。重复版本声明必须与根一致，不能静默覆盖；已知冲突报告不满足，无法确定有效选择时报告无法确认。
- 只有一个 workspace 成员或只使用 catalog 时也按实际根/成员职责判断，不根据包数量切换政策。
- .node-version 是默认开发 Node 的规范入口，CI 应读取它而不是另外硬编码一个可能漂移的版本。其他已支持的等价声明需证明选择一致。
- 不假定所有管理器自动读取 .node-version：Unix
  nvm 通常使用 .nvmrc，nvm-windows 也不能假定自动加载。若同时提供 .nvmrc、Volta 等受支持声明，语义须与根推荐版本一致，并明确使用方式。

### Node.js：开发环境使用最新 LTS，运行兼容范围独立

- 项目明确声明默认开发 Node，并与 CI 默认执行环境保持一致。
- 默认版本属于官方仍支持的 LTS 系列；已 EOL、尚未进入 LTS 的 Current 及 prerelease 不满足此约定。
- 依据官方发行与支持周期判断，不以某个最低版本常量或偶数 major 代替 LTS 状态。
- 开发环境永远跟进最新 LTS，不再以“仍维护的旧 LTS”替代最新要求；仍保留 .node-version 的精确版本声明。
- 最新 LTS 采用官方索引中最高 SemVer 的稳定、发行记录已标 LTS，且当前官方 schedule 仍处于支持期的发行版；根 .node-version 必须精确匹配。索引和 schedule 均须满足既有一小时新鲜度，取消仅证明历史存在的陈旧索引例外。来源失败、过期或冲突明确报告无法确认，不回退旧版、不按偶数 major 或常量猜测。成员最低运行版本按上述 monorepo 一致性规则比较，不强制完整 engines 范围相同。
- npm 库的消费者 engines 范围和兼容测试可以更广，不能把它们误当默认开发环境，也不因开发默认 LTS 就禁止库支持其他兼容版本。

### pnpm：精确锁定，持续跟进同 major

- packageManager 声明精确的 pnpm 稳定版本，可包含受支持的完整性后缀；不能使用范围、latest 或 prerelease 代替锁定。
- 在项目所选 major 内使用最新稳定 minor.patch。出现同 major 更新时应更新项目并复验；不要求自动跨 major。
- 提交 lockfile，CI 使用相同包管理器声明并执行 frozen lockfile 安装。
- 全局 latest 不代表某个历史 major 的最新版本；不能因为更高 major 存在就认定旧 major 已 EOL。
- 版本更新与 Node 兼容性冲突时明确报告，不偷偷改为较旧版本后声称最新。

这些要求检查项目配置与外部发行事实，不执行宿主 node/pnpm 探测。实际机器工具、nvm 管理和 Node/npm 配对仍属于工具链检查，不在此次统一项目 Check 中修改。

## 2. 开发依赖与 lockfile

### 工具职责明确

- 类型检查、lint、format、测试及覆盖率都有明确工具承载，在负责该能力的项目或共享根 devDependencies 中声明。
- 有构建产物才要求构建工具；tsc 可以同时承担类型检查和构建，不强制额外 bundler。
- 解析器、插件和 coverage
  provider 等直接使用的工具也明确声明，不依赖传递依赖偶然可解析。
- 首批检测路径以 TypeScript、ESLint/typescript-eslint、Prettier、Vitest 为基础。规则表达所需能力，不要求整份模板配置相同。
- Biome 可同时提供 lint 和 format，但不能仅据此认定其类型感知能力等价；其他工具需经过能力对照和回归后再声明支持。无法识别的配置报告无法确认，不猜测不合规或通过。
- 运行依赖和库 peerDependencies 按实际职责保留，不把所有依赖搬入 devDependencies。
- 开发依赖定向检查只覆盖 Check 已明确规定的必要开发工具。项目自由扩展的其他 devDependencies 不检查版本政策、不查询公开元数据，也不因不受支持而报告无法确认；必要工具相关的 peer、coverage 等能力证据仍须独立证明。

### 声明与实际安装结果同时合规

- major 大于等于 1 的开发工具采用限定单个 major、允许 minor/patch 跟进的 caret 声明，推荐完整写法如
  `^6.0.0`；`^6` 可按等价语义认可。
- 所有受检查的外部开发工具，无论单包还是 monorepo，都必须在项目根 pnpm-workspace.yaml 的默认 catalog 或 named
  catalog 集中声明版本，由负责该能力的成员或共享根 devDependencies 按实际 catalog 引用使用，不要求各成员重复声明。普通 dependencies 和未规定检查的 devDependencies 不受此新增 catalog 规则约束。内部包继续使用 workspace 协议，不按外部 registry 最新规则检查本地内部包。
- 检查 package.json/catalog 的声明，并追踪对应 lockfile
  importer 的 specifier 与实际解析版本：既满足声明，又是所选 major 内最新稳定版本。
- 仅有 caret 不证明已经更新；lockfile 其他成员或 snapshot 中存在最新版也不能替代本项目实际解析。
- 相关工具的 peerDependencies 与项目默认 Node 必须兼容。各自最新但相互冲突不能通过，也不自动跨 major 解冲突。
- 依赖兼容系列遵循 SemVer：major >=1 固定 major，跟进稳定 minor.patch；`0.minor.patch`
  且 minor >0 固定 minor，仅跟进稳定 patch，例如 `^0.34.0` 不要求升到
  `0.35.0`。`0.0.patch` 精确锁定，不主动要求升级到可能 breaking 的新 patch。

### 版本新鲜度的依据

固定的是“同 major 保持最新稳定”等长期规则，不是发版时的一组版本快照。同一项目、同一 Check
CID 随上游发版从通过变为不通过，是正常维护信号。

- 只查询公开或获授权的发行元数据及 Node 生命周期事实，不下载/执行包、不发送项目源码或秘密，也不根据不可信项目 URL 任意外连。
- 来源政策及宿主授权独立于业务输入，不能通过 input 提供“最新版本”、时钟或离线豁免。不把本开发机镜像偏好强加给其他设备或 CI。
- 查询须有有限预算与缓存新鲜度窗口，具体来源和窗口在实施前明确。已知缺项、镜像延迟、来源冲突或过期缓存不能支撑通过。
- 网络/认证失败、超时、数据不完整或无候选时明确表达无法确认，不伪造默认版本、不误报为确定落后，也不回退旧快照判通过。取消和意外执行故障保持原语义。
- 结果应能追溯项目声明、实际解析、major、观察到的最新稳定版本、来源及观测时间；证据可放在输出资源中，不泄漏秘密。

## 3. 项目规范与交付配置

### 所有适用代码遵守同一质量线

- TypeScript 声明明确，strict 生效，并启用 noUncheckedIndexedAccess、exactOptionalPropertyTypes、noImplicitOverride、noImplicitReturns、noFallthroughCasesInSwitch。
- 全部适用源码和测试纳入类型检查与类型感知 lint，不能靠忽略代码或覆盖关闭规则获得通过。
- 格式策略明确，覆盖源码、测试及适用配置文件；检查和修复分离。
- 测试发现范围明确，默认单次执行；没有测试不能被配置为成功。
- 覆盖率纳入未触达文件，branches、functions、lines、statements 四项全局门限由项目明确声明，均为有限的 0..100 百分比。Check 不规定统一最低数值；验证门限声明有效、覆盖范围完整、固定覆盖率入口及门禁连接，不把配置检查当作实际成绩证明。项目自行决定并维护数值，不能将本次项目采用的临时门限写成所有项目的标准。
- 工具声明、配置、脚本与实际范围应相互连接。Check 独立检查工具和静态配置，并仅按第 4 节验证 scripts 接口结构；配置或 thresholds 存在不等于已证明实际执行链路与覆盖率成绩，执行效果须另行验证。

### npm 交付包的附加要求

以下要求适用于项目中实际承担 npm
ESM 包交付职责且 private 不为 true 的包，不适用于 private:true 包、纯应用或聚合根。private:true 完全跳过 npm 发布/交付专项检查，不因 main/types/exports、publishConfig、包校验入口或显式映射报告发布职责无法确认，也不要求补齐 npm 交付配置；通用类型、lint、测试、覆盖率及适用构建仍检查。当前不承诺任意 CommonJS、双格式或其他未知交付模型。

| 方面       | 约定                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份       | name 合法且不残留模板占位，version 符合第 5 节格式；description、keywords、engines.node 明确                                                      |
| 来源和许可 | repository、homepage、bugs 为有效项目地址，不残留模板身份；license 明确，README 和 LICENSE 存在、可读、非空，自由正文不评审，不强制特定组织或 MIT |
| 公共入口   | type 为 module，根 exports 提供 ESM import 和 types，路径均在包内；保留的 main/types 与其一致                                                     |
| 元数据入口 | exports 显式开放本包 package.json，不能因 npm 必带该文件就推断消费者可导入                                                                        |
| 构建       | 有效构建配置生成 ESM JavaScript 和类型声明，源码确实纳入；noEmit 类型检查不冒充构建                                                               |
| 映射       | 生成 JS sourceMap 和 declarationMap；映射及其所需源内容按明确策略交付，不能只开启开关却排除必要文件                                               |
| 文件选择   | 明确 files allowlist，覆盖公共入口、声明、映射、必要资源及文档；开发测试、缓存、秘密配置不被交付                                                  |
| 包校验     | publint 在适用包或共享根 devDependencies 声明并正确锁定；构建后实际执行，连接统一 check，失败不被吞掉                                             |
| 打包准备   | 发布链路显式 build 后只 pack 一次并校验同一制品，不依赖陈旧 dist 或隐式生命周期重建；本地 pack 可有 prepack 辅助，但不能替代发布链路              |
| 发布目标   | publishConfig.access 为 public，显式公开 npm registry 发布目标且无凭据；不限制开发机安装源                                                        |

项目尚在开发时可以保留 private:true 防误发；发布流程必须拒绝发布这样的包。monorepo 根与非发布成员保持 private:true，交付包按第 5 节逐包开放。项目配置合规不等于本次制品已经可发布，不要求为了通过检查就解除私有保护或注册 npm 名称。

不固定输出目录或构建器；命令入口名称按第 4 节映射，共享模块放 scripts/lib/。Check 不解释构建入口内部实现，不因未知构建器报告无法确认；独立检查已声明的静态构建配置和交付路径，不将配置预期输出声称为已生成的产物，不运行目标 build/pack/publint 来补证。未知的独立交付配置或发布保护仍按各自证据报告。

## 4. 标准 scripts：Agent 的稳定操作接口

package.json scripts 不只是 CI 实现细节，还应是 Agent 日常维护可依赖的动作接口。

所有 package.json script 名称一律禁止冒号，命令值必须严格为
`node scripts/<同名>.mjs`，不允许参数、shell 或别名映射。例如 `format-check`
对应 `node scripts/format-check.mjs`，`check` 对应
`node scripts/check.mjs`。该规则覆盖标准、可选、生命周期和扩展命令，而不只是改名三个标准动作。

各 package 的 scripts 顶层所有入口与自身 package.json
scripts 严格双向一一对应，入口均为 .mjs，路径不得越过项目/包边界。共享模块统一放 scripts/lib/（例如 scripts/lib/commands.mjs），不作为命令入口，也不要求对应 package
script。可选动作与生命周期动作遵守同一结构约束。

typecheck、lint、format、format-check、test、test-coverage、lint-package、check，以及 release、release-dry-run 使用随 CAR/output 交付的唯一固定入口和必要 lib 模块，Check 按完整准确内容比较，仅归一化换行。不能只固定一行 wrapper 却自由替换保障行为的 lib。build 为主要自定义例外，项目扩展命令亦可自由实现，但仍遵守同名入口结构；不解释或执行其内部代码，不因未知构建器报错。

不要求根 scripts.config.json，不把全部 projects、dependsOn、actions 再抄到新配置。固定实现从 pnpm-workspace.yaml 的真实成员、package.json 的内部依赖/scripts 职责及既有工具配置推导拓扑和动作；按依赖顺序构建后聚合类型、lint、coverage、补充测试和适用包校验，任一子进程失败即失败。共享根调度不要求机械复制成员入口，未知拓扑/职责准确报告证据不足，不猜通过。build 与普通扩展脚本内部仍自由；补充动作依据既有 manifest 的命名职责连接，不能改标准字节绕过。工具声明/根 catalog、独立静态工具配置和明确发布保护继续独立检查。无法可靠推导的包 ID/tag 映射可保留专门声明式发布配置，这不是全量脚本拓扑。

对一个包/一个 script 按声明与名称、调用形式、文件存在、固定正文、必要共享模块的真实依赖链前置短路；前置失败不追加必然失败的预期文件/lib 缺失，不为补证读取未引用文件。多个有效标准入口共享 lib 时，缺失/不符只报一次并附影响范围，不因此放行。其他脚本、成员与独立规则继续；brief 包含路径、字段、观察值与期望。

固定文件完整性与声明式配置证明支持范围内的静态机制，不等于项目本次实际类型检查、覆盖率成绩、构建制品或线上发布已通过；自定义 build 与扩展的内部安全不由固定标准机制冒充证明。不得执行目标脚本推断，不虚构终端命令或能力证据。

| Script            | 必需语义                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `typecheck`       | 只检查类型，不生成编译产物                                            |
| `lint`            | 只检查代码规范，不修改源码                                            |
| `format-check`    | 只检查格式，不写文件                                                  |
| `format`          | 执行格式修正，明确属于写操作                                          |
| `test`            | 单次运行测试，非 watch，失败返回非零                                  |
| `test-coverage`   | 单次运行测试并执行覆盖率门限                                          |
| `check`           | 聚合全部适用质量能力，任一失败则失败                                  |
| `build`           | 对有产物的代码项目必需，生成其声明的产物                              |
| `lint-package`    | 对 npm 交付包必需，在构建后验证包的声明与交付形状                     |
| `release`         | 固定发布实现，仅在受保护的准确 tag push 路径发布                      |
| `release-dry-run` | 固定发布实现，仅 workflow_dispatch，按实际版本选择 channel 并 dry-run |

- 根提供统一 check 和适用标准动作入口；workspace 成员可由根调度器覆盖，不要求复制每条脚本，但能力归属和调用路径必须明确。
- check 可以用 test-coverage 同时覆盖测试与覆盖率职责，不要求再运行一次 test；适用 build、lint-package 也进入门禁。
- 默认非交互，不自动进入 watch，不等待确认，不吞退出码。检查动作不修复源码；门禁中的构建和报告可生成其声明产物。
- format 不得冒充 format-check；test-watch、lint-fix、clean、dev/start 按职责可选，不作为所有项目强制动作，所有名称禁止冒号。
- 底层工具可替换，标准动作名与语义保持稳定；文档给出适用的定向测试/检查方法，不要求所有聚合器透传同一套参数。
- 普通 check 不隐式部署、发布、删除用户数据或安装/切换工具；不强制项目配置 release/deploy 脚本。
- npm 发布是明确的固定实现职责，不接受自定义门卫的自由修改后判合规。CI 只通过 pnpm
  release 或 pnpm
  release-dry-run 调用两个独立顶层入口，共用 scripts/lib 中的一套严格发布保护核心；包身份/版本、真实成员及 CI 矩阵优先从 manifest、workspace 和实际 workflow 读取，不要求独立 release.config.json 或重复矩阵。单目标可唯一确定则无需额外描述，多目标沿已有明确发布映射与 CI
  input/tag 每次显式选择唯一目标；必要 ID/tag 关系无法推导时保留最小显式信息，不猜测、不新增第二份映射。优先复用 scripts/lib/release-packages.mjs，旧位置可读但 scripts 结构仍独立检查。private 包不要求发布入口。固定发布支持单根/唯一代码包及 monorepo 显式选择唯一成员两种适配；对一个目标只交付适用实现，不要求无关 adapter。Check 根据真实拓扑和根/成员职责选择正确问题及对应修复参考/准确资产，仅有 pnpm-workspace.yaml/catalog 或单成员声明不等于多代码包。未知配置精确 unconfirmed，不以新 profile 名称冒充未经验证能力，也不误将聚合根为非 private 成员发布视作私有豁免。

## 5. Workflow：质量 CI 与适用的发布流程

### GitHub 质量 CI

- origin 明确指向 GitHub 的项目应配置 GitHub
  Actions，覆盖 PR 与主分支 push；main 是主分支或存在需维护的 main 时也须被覆盖，不假设所有仓库默认分支都叫 main。
- 平台与分支依据明确的 Git 来源和项目事实识别，不执行目标 hooks。来源或分支无法确认时报告证据不足，不静默豁免后宣称完整合规。
- 非 GitHub 项目不强制配置 GitHub YAML，但不因此声称其他 CI 已验证。
- CI 冻结安装，并实际执行统一 check，默认工具环境与项目声明一致；不能用 continue-on-error、条件漏检或 shell 成功兜底吞掉必要失败。
- main 更新执行固定质量 CI 的 pnpm
  check，全部必需 job、矩阵和聚合成功才合格；保留既有 PR 质量入口，PR 成绩不作为发布依据。
- 质量与发布采用固定 workflow 结构，只有明确列出的有限参数可扩展，不能绕过固定权限、触发或失败传播。本版质量 workflow 仅允许 jobs.compatibility.strategy.matrix.node-version 的 2..8 个唯一精确稳定版本参数；job
  ID 与聚合绑定固定。
- 先比较标准 workflow 结构，再解释标准路径下的矩阵。不同 job
  ID 上已有真实矩阵时报告标准结构差异，列明实际路径/值与期望结构，不报告“矩阵能力不存在”。结构前置不符短路派生矩阵与发布绑定问题；其他成员与独立确凿配置缺陷保留。
- npm 库的兼容矩阵在统一最低值前置通过后，必须覆盖该消费者最低 Node 及至少一个更高、当前受支持且满足全部适用范围的官方 LTS（required）。更低或范围外的额外条目标为 unsupported，不代表所有包承诺该版本，不单独因此报告矩阵不满足。不能拿其他 SHA 或未实际覆盖的矩阵条目冒充验证。
- workspace 可共用 CI，根门禁应覆盖所有适用成员，不要求每个包复制 workflow。Check 校验固定标准实现、按实际声明推导的成员拓扑、CI 根 pnpm
  check 调用及工作流失败传播设置；不把这些静态证据声称为某次执行已经成功，也不解释自定义 build/扩展内部。

### npm 发布 workflow

只对 private 不为 true 的实际 npm 交付目标检查发布流程。private:true 包或纯聚合根没有发布 workflow 不构成问题；非私有包职责或映射不明则报告无法确认，不能为了省略发布规则把交付包默认为应用。发布流程不得允许发布 private 包；有明确允许证据时报告发布保护问题，映射包含 private 包本身不等于允许发布。

| 类型              | 唯一允许的版本格式                              | 唯一发布 channel |
| ----------------- | ----------------------------------------------- | ---------------- |
| 稳定版            | `x.y.z`，规范 SemVer，无多余前导零              | `latest`         |
| Release Candidate | `x.y.z-rc.n`，n 从 0 开始连续递增，无多余前导零 | `rc`             |

- 不采用 next、beta、canary 或其他真实发布 channel，不允许其他预发布后缀或 build
  metadata。历史 registry
  tag 不代表当前流程仍向其发布，不因遗留标签存在直接失败。
- 发布命令显式选择 channel，RC 不得因省略 tag 被发到 latest。
- 版本标签、目标包 manifest、最终 tarball 的 name/version 完全匹配，RC 后缀不丢失。单包与多包标签前缀可以不同，但映射必须唯一，不用聚合根版本冒充成员版本。
- 每个目标 x.y.z 的 RC 从 .0 开始，后续为该包该目标版本上一个已发布 RC 的下一个整数；不混用其他包或其他目标版本的计数。
- 拒绝占位身份、private 包及已存在版本；registry/历史查询只有明确可信的不存在才允许继续，网络、认证失败或历史不完整必须阻断。
- 只发布主分支可达的准确提交；发布前必须复用已有成功的精确提交 main push
  CI，按下节验证，不能用发布流程另跑全套检查代替缺失的合格结果。
- GitHub 发布采用 npm Trusted
  Publishing：发布 job 有明确 environment、必要读取权限和 id-token:write，客户端支持 OIDC，不依赖长效 npm
  token。
- 选定包只 pack 一次，校验和发布同一 tarball。依赖必须已有匹配发行版；构建依赖不等于获准发布依赖，不意外批量发布整个 workspace。
- workflow_dispatch 只 dry-run，不真实发布、不改 dist-tag 或仓库版本；按制品真实版本选择 latest/rc，不创建临时真实发布通道。

Check 按独立证据验证明确的发布保护配置和已支持门卫，不以通用 scripts 结构通过证明自定义入口内部与发布门卫的关系或发布安全。不执行发布流程，也不凭当前 manifest 断言 RC 历史连续、版本未发布、CI 成功或 npm 网站上的 Trusted
Publisher 已登记。线上权限和真正 tarball 正确性需要独立发布证据。

### Monorepo：逐包开放，逐包发布

- workspace 根、应用、示例及其他非发布成员保持 private:true。成为公共包是显式逐包操作，不能通过批量删除 private 开放整个工作区。
- 选定包准备就绪时，单独解除其 private 保护并加入明确发布映射；映射关联唯一包标识、实际 package
  name 和目录，避免仅凭路径或聚合根版本猜测身份。
- 每次发布只选一个包、一个版本、一个准确提交，标签必须唯一定位该包。一次发布成功不授权后续包自动发布。
- 构建可以覆盖选中包及其依赖，但只 pack、校验和发布选中的包；不递归发布所有 workspace，也不因依赖关系自动发布其他包。
- 内部 runtime/peer 依赖的匹配版本须已在 npm 可解析。缺失依赖先作为独立包发布，再发布依赖它的包；不把 workspace 协议重写成功当作线上依赖已存在。
- private:true 包完全跳过 npm 发布/交付专项检查；映射中保留 private 包本身不是允许发布的证据。有明确证据证明流程允许 private 包发布、错选包或隐式批量发布则不满足。非私有包的发布意图与职责无法确认时明确报告，不靠强制解除保护获得通过。
- 单包仓库同样需要包身份、准确版本与提交保护，但无需为单个目标机械引入多包映射机制。

### 发布复用已有准确提交 CI

- 发布门卫查询该仓库已有的 CI 结果，要求事件为主分支 main 的 push、完整 head
  SHA 与待发布提交完全一致，所有必需 job、矩阵及版本化聚合检查均成功。
- 本版固定可信链绑定 main/push、.github/workflows/ci.yaml 及其固定必需检查；其他主分支或 workflow 不猜测等价、不作为发布依据。
- main 最近一次成功、PR/pull_request
  CI、不同 SHA、尚在运行、取消、跳过或失败的必需检查都不能代替准确提交的合格结果。
- release tag 触发固定发布 CI；tag 解引用的完整 commit
  SHA 必须 main 可达，并且已有相同完整 SHA 的成功 main-push 固定质量 CI。没有结果、运行中、失败/取消/跳过、不完整、查询失败均直接阻断；不补跑 check、不触发补跑质量 workflow，不接受 PR、其他 workflow/分支/SHA 的成绩。
- 质量 CI 负责该提交的完整工程检查。发布 workflow 不重复运行全套质量 CI，但仍执行依赖安装与必要构建，以及发布特有验证：标签/映射、name/version、已有版本、依赖可用性、最终 tarball 身份和包校验。
- 发布门卫使用的 workflow、job、step 或等价必需检查标识应明确且与 CI 定义一致。更改聚合检查版本时同步 verifier，不能拿一个空壳成功 job 冒充质量证明。
- 选中包及依赖构建完成后仅 pack 一次，禁用打包生命周期钩子以避免暗中重建；检查并发布同一 tarball。需要的生成步骤应在显式 build 中完成，不能在校验后通过 prepack/prepare 再改变制品。

## 6. 项目结构与维护文档

### 按实际拓扑识别范围

- 单包可位于根，也可由 workspace 声明唯一成员；只有 pnpm-workspace.yaml/catalog 不等于 monorepo。
- workspace 定位包，tsconfig、lint、测试配置及 scripts 定位源码和测试；不硬编码 src、packages、apps，也不把所有嵌套 package.json 都猜作成员。
- 根负责包管理器、共享 lockfile/catalog、仓库文档、CI 和聚合门禁；代码项目负责实际源码/测试与适用构建。根本身有代码时也受同一标准约束。
- 共享 devDependencies、配置继承及 Turbo 调度均可使用，不要求成员重复配置；但“根有一份配置”不能证明所有成员已被覆盖。
- 配置来源与执行根分离，单包与 monorepo 按真实代码职责采用不同作用域策略，共享同一规则与通用校验。共享 Vitest 配置仍在各代码成员 cwd 显式传 --root
  . 和 --config，include 及 coverage 按成员 root 解释，不按配置 owner 去重一次。TypeScript 的 include/extends 保持配置来源相对语义；ESLint 显式配置的 glob 按实际 cwd 解释。只有明确受支持且验证成员覆盖的多项目配置才整体调度，未知 projects/workspace/root 不猜测。problem 提供成员、配置路径、实际 root、include/exclude 和未匹配文件证据；共享根因合并列成员，独立差异保留。
- 固定 workflow 结构与适用包统一最低值前置通过后检查最低运行矩阵，不因发布映射前置失败抑制独立最低版本缺口。缺失/非法 engines 或最低值不一致先报对应环境问题，不追加依赖该前置的矩阵差异；独立默认 CI 与发布保护仍检。结构不符不追加派生矩阵/发布绑定未知。裸 publish 等独立确凿问题保留。兼容性属于统一质量门禁/固定可信链，不另立发布前整套检查，也不要求最低消费者 Node 能运行全部最新开发工具；现有完整开发 check 不能独立证明消费者 runtime 时准确说明支持边界，分离产物 probe 与开发 check 若需要新项目约定/脚本须先确认，不擅自新增标准动作或缩窄 engines 冒充修复。固定发布核心的全部严格门卫保持不变。
- 聚合根不强制有业务源码、测试或无意义的 build；成员不能被过滤、忽略或调度遗漏。未知拓扑、损坏声明或覆盖证据不足必须报告。
- 检查根及全部声明发现的适用成员，不允许调用方传 projectScopes 缩小范围。直接检查独立目录只对该项目作结论，不无界读取根外内容或声称外层仓库合规。

### 文档只有固定与自由两类

| 类别     | 约定                                                               | 检查方式                                                                 |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 固定文档 | 整份内容由标准指定，不包含项目自定义部分；通过固定路径引用自由扩展 | 与本 Check 中唯一标准 asset 的完整内容比较                               |
| 自由文档 | 内容由项目维护；即使包含一些统一说明，也仍然是自由文档             | 仅检查明确要求的存在、可读、非空、路径及引用，不审正文质量或假定语义完整 |

- 不采用“固定区块 + 自由正文”的混合文档，不以关键词或标题命中替代固定文档的完整比较。
- 根 `AGENTS.md`
  为固定文档，包含统一维护操作约定和项目扩展入口；项目专有目录职责、业务约束和特殊操作放在其引用的自由文档中，不能追加到固定文件。
- README.md、CONTRIBUTING.md 为自由文档。它们用于说明项目与贡献流程，但本 Check 不通过关键词、模型评审或执行命令来声称其内容正确充分；检查通过不意味着自由正文已经过质量评审。
- 固定 AGENTS.md 引用的自由扩展需存在且路径有效，Check 不评审其正文，也不能声称已证明其中没有矛盾。规范要求扩展只补充、不覆盖统一规则；scripts、CI、发布保护仍通过实际配置独立验证。
- 首版只有一份固定 AGENTS.md，其中包含统一发布操作，不另建 Release
  Skill。项目专有包映射和命令放在被引用的自由扩展文档中，不能替代实际发布门卫验证。
- 固定目标为根 AGENTS.md，自由扩展统一引用 docs/agent-project.md。完整固定正文随 Check
  assets 交付，不按项目插入名字、路径或版本变量。
- 根固定入口与文档可统一服务 workspace 成员，不逐包复制；不得额外发现一个已修改的成员入口就默默忽略其与根约定的冲突，支持边界须明确。
- gitignore 排除依赖目录、实际构建输出、覆盖率/缓存及秘密文件，不整体忽略必要源码、配置、lockfile 或工作流；必要配置与 lockfile 应纳入版本控制。
- 许可证按交付职责适用，npm 包明确许可及交付文档，不强制私有应用采用某一开源协议。

### 标准 assets 与修复指引随 output 交付

- 固定文档的完整标准内容保存在 Check 作者包的 assets 中，并作为资源随 Bundle 交付；比较逻辑和修复指引使用同一份 asset，不在代码、problem 正文或模板中再维护副本。
- 标准文本为有效 UTF-8/LF；比较时仅统一 CRLF/CR 为 LF，不 trim、不忽略额外正文、不做模糊匹配。其他有意义的字符差异，包括末尾换行，均按标准内容判断。
- 文档缺失与内容不匹配分别定位；读取权限/意外 I/O 故障仍是执行故障。Check 只报告，不自动覆盖文档。
- 在普通业务结果之外，将本次标准 assets 链接到 Run output 的
  `assets/`，参考文档继续位于
  `references/`；输出中必须是真实可解析的资源链接，而不是只在 JSON 中放一个 CID 字符串。
- 例如 `references/problems/document-mismatch.md` 使用
  `[标准 AGENTS.md](../../assets/AGENTS.md)`
  指向此次输出中的准确修复内容，消费者以 `output.cid` 为根解析。无需编码 Check
  CID 或提前知道最终 output CID，也不在 problem 中复制标准全文。
- problem 明确指出要修复的目标项目路径、标准 asset 的相对路径及读取/写入方法。Agent 应先保护现有自定义内容，将其移到自由扩展文件后再恢复固定文件；引用目标及修复步骤不能建议丢弃用户工作。
- 通过、不通过两类正常输出均提供对应标准资产，以便独立读取；资产链接失败不得返回成功形状的 Check 结果。消费者不需要作者源码或访问另一份移动的模板。
- SDK 若需支持资产输出，仅补齐明确声明的标准资源链接能力，保持 code/brief/documentation 结果语义；不为此暴露完整可写 TaskContext、引入父子结果协议或链接任意作者源码。

## 检查结论与实施边界

- 检查项目配置及连接，不执行目标模块、配置、build、test、install、pack、publish 或自动修复；只允许上述受信发行/生命周期元数据查询。
- 明确缺失、不满足和无法确认分别报告，输入非法、读取故障、取消及意外执行故障不伪装成普通项目问题或成功。
- 保留根内路径、符号链接和读取预算边界；成员或内容超出支持范围时不报告完整通过。具体来源、时间窗口、0.x 政策和可识别语法应在实施前明确并验证。
- input 是闭合对象，只接受执行机绝对 projectDirectory；旧 context、requirements、projectScopes 及其他字段明确拒绝，不兼容解包、不静默忽略。
- 新契约与规则需要重建 CAR 并更新准确 CID；当前实现、历史已验收制品不会因本文更新而自动迁移。作者包保持私有，外部发布或 pin 另行授权。
- 对外只有一个 TypeScript Project
  Check。内部可按职责分模块，不新增 npm-package/monorepo
  Task 或层级结果协议；必要的 SDK 改动仅限上述标准 assets 输出交付，不借机扩大能力。

### 首版实施约束

- 固定文档只包括根 AGENTS.md，实际标准在作者 assets 中，根内自由扩展为 docs/agent-project.md。成员 AGENTS.md 若存在且可能覆盖根规则，首版保守报告范围无法确认，不静默忽略或假设无冲突。
- 外部事实查询缓存至多 1 小时，每个请求至多 10 秒并限制响应大小；确切只读端点记录于实施证据。来源失败、冲突或新鲜度/完整性不能证明时报告 unconfirmed，不以过时缓存放行。
- 首版仅识别能够静态证明的配置与明确发布门卫接口，未知自定义脚本必须 unconfirmed，不能因包含保护关键词就判合规。可以明确未支持的语法范围，但不减少六类应查领域。

这些约束不增加 Project Check 的业务 input，也不代表未经验证的能力已经实现。
