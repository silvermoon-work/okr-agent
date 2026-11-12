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

### Node.js：默认使用受支持的 LTS

- 项目明确声明默认开发 Node，并与 CI 默认执行环境保持一致。
- 默认版本属于官方仍支持的 LTS 系列；已 EOL、尚未进入 LTS 的 Current 及 prerelease 不满足此约定。
- 依据官方发行与支持周期判断，不以某个最低版本常量或偶数 major 代替 LTS 状态。
- 允许仍受维护的旧 LTS，不强制升级到最新 LTS
  major。精确锁定版本与采用 LTS 不矛盾。
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

### 声明与实际安装结果同时合规

- major 大于等于 1 的开发工具采用限定单个 major、允许 minor/patch 跟进的 caret 声明，推荐完整写法如
  `^6.0.0`；`^6` 可按等价语义认可。
- 允许 catalog/named
  catalog 集中维护第三方版本，成员保留明确引用。内部包使用 workspace 协议，不按外部 registry 最新规则检查本地内部包。
- 检查 package.json/catalog 的声明，并追踪对应 lockfile
  importer 的 specifier 与实际解析版本：既满足声明，又是所选 major 内最新稳定版本。
- 仅有 caret 不证明已经更新；lockfile 其他成员或 snapshot 中存在最新版也不能替代本项目实际解析。
- 相关工具的 peerDependencies 与项目默认 Node 必须兼容。各自最新但相互冲突不能通过，也不自动跨 major 解冲突。
- `0.x` 的 caret 不等于固定 major，例如 `^0.34.0` 不允许升到
  `0.35.0`。具体工具采用的兼容系列政策须在实施前明确；未明确或不能证明时报告无法确认，不擅自跨 minor。

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
- 覆盖率纳入未触达文件，branches、functions、lines、statements 四项全局门限均不低于 90。更高的合法门限可以满足，不要求恰好等于 90。
- 工具声明、配置、脚本与实际范围相互连接；仅有配置文件或 thresholds 而未接入执行链路不能通过。

### npm 交付包的附加要求

以下要求适用于项目中实际承担 npm
ESM 包交付职责的包，不适用于纯应用或聚合根。当前不承诺任意 CommonJS、双格式或其他未知交付模型。

| 方面       | 约定                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 身份       | name 合法且不残留模板占位，version 符合第 5 节格式；description、keywords、engines.node 明确                                |
| 来源和许可 | repository、homepage、bugs 为有效项目地址，不残留模板身份；license 明确，README 和 LICENSE 有实质内容，不强制特定组织或 MIT |
| 公共入口   | type 为 module，根 exports 提供 ESM import 和 types，路径均在包内；保留的 main/types 与其一致                               |
| 元数据入口 | exports 显式开放本包 package.json，不能因 npm 必带该文件就推断消费者可导入                                                  |
| 构建       | 有效构建配置生成 ESM JavaScript 和类型声明，源码确实纳入；noEmit 类型检查不冒充构建                                         |
| 映射       | 生成 JS sourceMap 和 declarationMap；映射及其所需源内容按明确策略交付，不能只开启开关却排除必要文件                         |
| 文件选择   | 明确 files allowlist，覆盖公共入口、声明、映射、必要资源及文档；开发测试、缓存、秘密配置不被交付                            |
| 包校验     | publint 在适用包或共享根 devDependencies 声明并正确锁定；构建后实际执行，连接统一 check，失败不被吞掉                       |
| 打包准备   | pack/publish 配置能证明先获得经过检查的构建输出，可采用 prepack 或发布流程中的等价顺序，不依赖陈旧 dist                     |
| 发布目标   | publishConfig.access 为 public，显式公开 npm registry 发布目标且无凭据；不限制开发机安装源                                  |

项目尚在开发时可以保留 private:true 防误发；发布流程必须拒绝发布这样的包。项目配置合规不等于本次制品已经可发布，不要求为了通过检查就解除私有保护或注册 npm 名称。

不固定输出目录、构建器或辅助脚本名称。已支持的等价实现可满足；动态或未知构建语义无法静态确认时明确说明，不运行目标 build/pack/publint 来补证。

## 4. 标准 scripts：Agent 的稳定操作接口

package.json scripts 不只是 CI 实现细节，还应是 Agent 日常维护可依赖的动作接口。

| Script          | 必需语义                                          |
| --------------- | ------------------------------------------------- |
| `typecheck`     | 只检查类型，不生成编译产物                        |
| `lint`          | 只检查代码规范，不修改源码                        |
| `format:check`  | 只检查格式，不写文件                              |
| `format`        | 执行格式修正，明确属于写操作                      |
| `test`          | 单次运行测试，非 watch，失败返回非零              |
| `test:coverage` | 单次运行测试并执行覆盖率门限                      |
| `check`         | 聚合全部适用质量能力，任一失败则失败              |
| `build`         | 对有产物的代码项目必需，生成其声明的产物          |
| `lint:package`  | 对 npm 交付包必需，在构建后验证包的声明与交付形状 |

- 根提供统一 check 和适用标准动作入口；workspace 成员可由根调度器覆盖，不要求复制每条脚本，但能力归属和调用路径必须明确。
- check 可以用 test:coverage 同时覆盖测试与覆盖率职责，不要求再运行一次 test；适用 build、lint:package 也进入门禁。
- 默认非交互，不自动进入 watch，不等待确认，不吞退出码。检查动作不修复源码；门禁中的构建和报告可生成其声明产物。
- format 不得冒充 format:check；test:watch、lint:fix、clean、dev/start 按职责可选，不作为所有项目强制动作。
- 底层工具可替换，标准动作名与语义保持稳定；文档给出适用的定向测试/检查方法，不要求所有聚合器透传同一套参数。
- 普通 check 不隐式部署、发布、删除用户数据或安装/切换工具；不强制项目配置 release/deploy 脚本。

## 5. Workflow：质量 CI 与适用的发布流程

### GitHub 质量 CI

- origin 明确指向 GitHub 的项目应配置 GitHub
  Actions，覆盖 PR 与主分支 push；main 是主分支或存在需维护的 main 时也须被覆盖，不假设所有仓库默认分支都叫 main。
- 平台与分支依据明确的 Git 来源和项目事实识别，不执行目标 hooks。来源或分支无法确认时报告证据不足，不静默豁免后宣称完整合规。
- 非 GitHub 项目不强制配置 GitHub YAML，但不因此声称其他 CI 已验证。
- CI 冻结安装，并实际执行统一 check，默认工具环境与项目声明一致；不能用 continue-on-error、条件漏检或 shell 成功兜底吞掉必要失败。
- npm 库的兼容矩阵覆盖声明的最低可运行 Node 及至少一个更高受支持版本，不能拿其他 SHA 或未实际覆盖的矩阵条目冒充验证。
- workspace 可共用 CI，但必须证明根门禁覆盖所有适用成员；不要求每个包复制 workflow。

### npm 发布 workflow

只对实际 npm 交付目标检查发布流程。私有应用或纯聚合根没有发布 workflow 不构成问题；包职责或映射不明则报告无法确认，不能为了省略发布规则把交付包默认为应用。

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
- 只发布主分支可达的准确提交；发布前冻结安装并通过质量门禁，可复用成功的精确提交 CI，不能以其他提交成绩替代。
- GitHub 发布采用 npm Trusted
  Publishing：发布 job 有明确 environment、必要读取权限和 id-token:write，客户端支持 OIDC，不依赖长效 npm
  token。
- 选定包只 pack 一次，校验和发布同一 tarball。依赖必须已有匹配发行版；构建依赖不等于获准发布依赖，不意外批量发布整个 workspace。
- workflow_dispatch 只 dry-run，不真实发布、不改 dist-tag 或仓库版本；按制品真实版本选择 latest/rc，不创建临时真实发布通道。

Check 验证发布门卫的配置和连接，不执行发布流程，也不凭当前 manifest 断言 RC 历史连续、版本未发布、CI 成功或 npm 网站上的 Trusted
Publisher 已登记。线上权限和真正 tarball 正确性需要独立发布证据。

## 6. 项目结构与维护文档

### 按实际拓扑识别范围

- 单包可位于根，也可由 workspace 声明唯一成员；只有 pnpm-workspace.yaml/catalog 不等于 monorepo。
- workspace 定位包，tsconfig、lint、测试配置及 scripts 定位源码和测试；不硬编码 src、packages、apps，也不把所有嵌套 package.json 都猜作成员。
- 根负责包管理器、共享 lockfile/catalog、仓库文档、CI 和聚合门禁；代码项目负责实际源码/测试与适用构建。根本身有代码时也受同一标准约束。
- 共享 devDependencies、配置继承及 Turbo 调度均可使用，不要求成员重复配置；但“根有一份配置”不能证明所有成员已被覆盖。
- 聚合根不强制有业务源码、测试或无意义的 build；成员不能被过滤、忽略或调度遗漏。未知拓扑、损坏声明或覆盖证据不足必须报告。
- 检查根及全部声明发现的适用成员，不允许调用方传 projectScopes 缩小范围。直接检查独立目录只对该项目作结论，不无界读取根外内容或声称外层仓库合规。

### 文档与忽略规则可用

- README.md 说明用途、准备环境、安装、标准检查及适用构建/运行方法。
- CONTRIBUTING.md 说明修改、测试、验证和贡献流程。
- AGENTS.md 或清晰可发现且显式引用的等价指引，说明标准命令、定向验证、完成前门禁、目录职责、生成文件边界及需授权动作。
- 根文档可以覆盖成员；独立职责应有相应文档或链接，不逐包复制同一文本。不只看文件非空，还检查命令与 scripts 对应、必要操作有说明、根内引用可解析；不能证明的叙述准确性明确报告无法确认。
- gitignore 排除依赖目录、实际构建输出、覆盖率/缓存及秘密文件，不整体忽略必要源码、配置、lockfile 或工作流；必要配置与 lockfile 应纳入版本控制。
- 许可证按交付职责适用，npm 包明确许可及交付文档，不强制私有应用采用某一开源协议。

## 检查结论与实施边界

- 检查项目配置及连接，不执行目标模块、配置、build、test、install、pack、publish 或自动修复；只允许上述受信发行/生命周期元数据查询。
- 明确缺失、不满足和无法确认分别报告，输入非法、读取故障、取消及意外执行故障不伪装成普通项目问题或成功。
- 保留根内路径、符号链接和读取预算边界；成员或内容超出支持范围时不报告完整通过。具体来源、时间窗口、0.x 政策和可识别语法应在实施前明确并验证。
- input 是闭合对象，只接受执行机绝对 projectDirectory；旧 context、requirements、projectScopes 及其他字段明确拒绝，不兼容解包、不静默忽略。
- 新契约与规则需要重建 CAR 并更新准确 CID；当前实现、历史已验收制品不会因本文更新而自动迁移。作者包保持私有，外部发布或 pin 另行授权。
- 对外只有一个 TypeScript Project
  Check。内部可按职责分模块，但不为使用组合机制而新增 npm-package/monorepo
  Task、层级结果协议或 SDK 扩展。
