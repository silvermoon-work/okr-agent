# Agent 长期维护的 Node.js TypeScript 项目共性

本文是 [Idea.md](./Idea.md) 的 supporting document，具体化
[Requirements.md](./Requirements.md) 的六类标准。输入只有
`{projectDirectory}`；以下规则由 Check 固定，不变成调用方开关。

## P-01: 统一拓扑与责任归属

- 先识别项目根、实际代码项目、workspace 声明成员及配置覆盖关系，再检查标准；不先用“单包/monorepo”标签决定不同合格线。
- 单包可直接位于根，也可由 workspace 声明唯一成员；pnpm-workspace.yaml 仅用于 catalog 时不据此推断多个包。
- workspace 描述包的位置，源码及测试位置由 tsconfig、工具配置和脚本有效目标共同确定，不硬编码 src、packages、apps，也不递归将所有 package.json 猜成成员。
- 根负责 package
  manager、共享 lockfile/catalog、仓库文档、CI 及聚合门禁；承担代码职责的根和成员负责实际源码/测试的类型、lint、格式、测试与适用构建。
- 允许根共享 devDependencies、工具配置及 Turbo 调度，不强制每个成员重复安装或复制配置；但必须证明这些能力覆盖每个适用成员。
- 聚合根不强制拥有业务源码、测试或无意义的 build；成员不能因根存在一个工具或脚本就被推断满足。
- 配置继承、过滤、忽略规则和调度必须可静态确认；未知拓扑、遗漏成员或不能证明覆盖时不通过或明确无法确认，不允许输入额外路径绕过。

## P-02: 环境配置

- 项目必须声明可复现的 pnpm 精确版本，并跟进所选 major 内最新稳定 minor.patch；冻结 lockfile，CI 使用同一声明，不强制跨 major。
- 项目默认开发 Node 选择属于仍受官方支持的 LTS；依据官方生命周期，而不是固定 Node 版本或偶数 major。声明方式可等价，但必须能确认默认选择及与 CI 默认运行环境的一致性。
- 已 EOL
  LTS、Current 或 prerelease 不满足默认开发环境政策；不要求自动迁移到最新 LTS
  major。
- 项目声明/CI 默认环境与真实机器当前安装状态不同，本 Check 不执行 node/pnpm 来探测宿主；实际安装状态属于工具链 Check。
- 库的消费者 engines 范围可以更广，兼容测试可覆盖其他支持目标；它们不能代替默认 LTS 的声明，也不能被误判为默认开发选择。

## P-03: 开发依赖声明与实际解析

- 类型检查、lint、format、测试及覆盖率必须有明确工具承载，工具声明在实际负责该能力的项目或共享根 devDependencies。
- 有构建产物才要求构建能力及其工具，tsc 可以同时承担类型检查和构建；不强制额外 bundler。应用运行依赖和库 runtime/peer 依赖不被一律搬入 devDependencies。
- 初期认可路径为 TypeScript、ESLint/typescript-eslint、Prettier、Vitest 及声明的 coverage
  provider；相关解析器/插件也须显式声明且兼容，不能凭传递依赖偶然可解析。
- 大于等于 1 的工具版本采用限定单个 major、允许同 major 更新的 caret 声明，推荐完整写法如
  `^6.0.0`；`^6` 可按等价语义认可，不能将范围当成已使用最新的证据。
- catalog/named
  catalog 可集中声明版本，成员保留明确 catalog 引用；内部 workspace 依赖按工作区协议处理，不拿外部 registry 最新规则检查本地内部包。
- 对每个相关 importer 追踪 declaration/specifier 到 lockfile 实际解析，核验版本满足声明且达到该 major 最新稳定 minor.patch。另一 importer 或 snapshot 中存在最新版不能替代目标实际使用版本。
- 配套工具要验证 peerDependencies 及项目默认 Node 兼容性；“各自最新”不等于组合可用。冲突明确报告，不能偷偷选择旧兼容版本后宣称最新。
- `0.x` caret 不等于固定 major（例如 `^0.34.0` 不允许升至
  `0.35.0`）。不得机械当成大于等于 1 的规则；具体所选工具遇到该情况需在实施前明确兼容系列政策，未定或不能证明时报告无法确认，不擅自跨 minor。
- 版本新鲜度依据
  [维护不变量](./Maintenance-invariants.md)，只观察元数据与项目文件，不运行 install/update 或修改 lockfile。

## P-04: 项目规范

- 严格类型检查及五项安全选项覆盖全部适用源码和测试；类型感知 lint 生效，不能靠关闭规则或忽略所有文件通过。
- 格式策略明确且实际纳入源码、测试和适用配置文件；检查与自动修复分离。
- 测试有确定发现范围，默认单次运行，不能以没有测试为成功；覆盖率纳入未触达文件，branches/functions/lines/statements 四项全局最低线均为 90。
- 基本能力与配置之间必须真实连接，检测的是配置质量，不是项目的类型成绩或测试通过状态；不能执行目标配置代码来补证。
- 不强制某份完整 ESLint 规则文本；等价实现需明确能力对照。Biome 的 lint+format 一体化不自动证明与 typescript-eslint 类型感知规则等价，支持前需专门验证。

## P-05: 面向 Agent 的标准 scripts

标准不仅检查终端能力存在，还规定稳定动作名称及语义：

| Script          | 必需语义                                                     |
| --------------- | ------------------------------------------------------------ |
| `typecheck`     | 只检查类型、不生成编译产物                                   |
| `lint`          | 只检查规范、不修复源码                                       |
| `format:check`  | 只检查格式、不写源码                                         |
| `format`        | 明确执行格式修正，属于写操作                                 |
| `test`          | 单次测试、非 watch、失败返回非零                             |
| `test:coverage` | 单次测试并执行覆盖率门限                                     |
| `check`         | 所有适用质量能力的统一聚合验收入口，任一失败必须失败         |
| `build`         | 对有产物的代码项目必需，生成声明的产物；聚合根可调度成员构建 |

- 根需有统一 check 和适用标准动作入口；成员可由根调度器/共享配置覆盖，无需复制每条脚本，但对应能力及可调用路径必须明确。
- check 可以用 test:coverage 同时满足 test 与 coverage，不要求重复跑 test；可构建项目的 build 及 npm 层 lint:package 按适用职责纳入门禁。
- 默认非交互，不自动进入 watch，不依赖确认输入，不吞退出码；check/typecheck/lint/format:check 不自动修复或格式化源码，允许必要报告和声明构建产物。
- format 不得接入只读格式校验位置冒充 format:check；test:watch、lint:fix、clean、dev/start 可以按职责提供，但不作为所有项目强制动作。
- 工具实现与入口名字分离：底层可以替换，但标准 Agent 命令保持稳定。不要求所有聚合器透传同一套参数；文档须说明至少适用的定向测试/检查调用方法。
- 部署/发布/清理不能被普通 check 隐式触发；不强制 release/deploy 脚本，不把检测工具的自动下载/安装作为项目门禁正常副作用。

## P-06: Workflow

- 明确 origin 指向 GitHub 的项目必须提供 GitHub Actions
  CI，覆盖 PR 与主分支 push；main 是主分支或存在需维护的 main 时必须被相应检查覆盖。
- 用受支持的 Git 来源及项目声明判定平台和分支，不强制读取或执行目标 Git
  hooks，不凭目录名或 repository URL 单项猜测完整来源。
- 若 origin/主分支无法确认，明确来源证据不足，不静默跳过 CI 后声称完整合规。明确非 GitHub 项目不强制 GitHub 文件，但也不据此宣称已验证其他 CI 提供商。
- 冻结安装与统一 check 实际连接，运行工具版本与项目声明一致，不允许 continue-on-error、条件漏检或 shell 成功兜底吞掉必要失败。
- 质量 CI 属于 TypeScript 基础标准；npm 发布 workflow 的具体要求属于
  [npm 项目标准](./Npm-package-standard.md)。私有应用或纯聚合根不因没有 npm 发布而失败。
- 多包仓库可用共享 CI 和发布工作流，不要求每个成员复制 workflow；必须证明实际任务覆盖和目标包映射。

## P-07: 项目文档与忽略规则

- 根 README.md 说明用途、准备环境、安装、标准检查与适用构建/运行方法；CONTRIBUTING.md 说明修改、测试、验证和贡献流程。
- 根提供 AGENTS.md 或清晰可发现并被显式引用的等价 Agent 指引：标准命令、定向验证、完成前门禁、目录职责、生成文件边界及需授权动作。
- 共享根文档可以覆盖成员；成员有独立职责时应有相应文档或明确链接，不要求逐包复制同一文本。
- gitignore 排除 node_modules、构建输出、覆盖率/缓存与适用秘密文件；不能把必要源码、配置、lockfile 或应提交的工作流整体忽略。输出目录依据实际构建配置判断，不固定 dist。
- 许可证按项目交付职责适用，npm 包的 license/交付文档由 npm 标准进一步约束；不强制所有私有内部项目采用某一开源协议。
- 不只检查文档存在或非空；需验证声明命令与实际 scripts 能对应、根内引用可解析及必要操作类别有明确说明。无法静态确认叙述准确性时报告无法确认，不把启发式匹配当完整语义证明。
