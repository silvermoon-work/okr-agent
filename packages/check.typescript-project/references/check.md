# TypeScript 项目长期维护约定

唯一公开 Check 的闭合输入为
`{"projectDirectory":"执行机绝对目录"}`。旧 context、requirements、projectScopes、额外字段及空对象均拒绝。规则是作者固定内部政策；不提供豁免或成员筛选。

## 六类检查

1. 环境：根 .node-version 必须精确匹配官方索引中最高 SemVer 的稳定、发行标 LTS 且当前官方 schedule 仍在支持期的发行版；不按偶数 major 或固定版本猜测。索引与 schedule 接受官方端点的缓存延迟，不设固定缓存年龄上限，按本次响应的完整事实及当前时间判定；请求失败、时间无效或数据冲突均 environment-unconfirmed，不回退旧成功。同 major 旧 patch 或仍维护的旧 LTS 都不满足最新要求。各代码成员 engines.node 独立检查并包含开发环境；monorepo 所有适用代码包（包括 private 包）的最低受支持 Node 必须一致，比较解析出的最低版本，不要求完整范围或文本相同，纯聚合根不参与。差异证据包含 manifest 路径、原始范围和最低版本，不自动缩窄兼容承诺。消费者最低环境不必运行所有现代开发工具。根 packageManager 精确 pnpm 稳定版本，跟进所选 major 最新版本；重复默认选择不得冲突。
2. 工具：只检查已规定的必要开发工具；单包与 monorepo 均要求其 devDependencies 引用根 pnpm-workspace.yaml 的默认/named
   catalog，保留共享根声明与内部 workspace 协议。普通 dependencies 和自由扩展的其他 devDependencies 不受此 catalog/版本政策约束，后者不查询元数据、不报不受支持依赖。检查实际 pnpm
   lockfile
   importer 的 specifier/version。major>=1 追同 major，0.minor 追同 minor 的 patch，0.0.patch 精确锁定；声明及已解析版本都检查。校验工具 Node 与已解析 peer 兼容；其他 snapshot 不能替代本 importer。
3. 规范与交付：独立检查 strict、五项 safety、源码与测试类型感知 lint、格式配置和忽略范围、测试发现、未触达文件 coverage.include；四项全局覆盖率门限须明确声明为有限的 0..100 百分比，数值由项目决定，不设统一最低值；显式 watch/passWithNoTests 不得放宽。实际 npm
   ESM 职责附加检查身份/许可/链接、exports、files、已声明的构建/映射配置及 build/lint-package 接口。private:true 完全跳过 npm 发布/交付专项检查，不因入口或显式映射报告发布职责无法确认；通用质量及适用构建配置仍检查，不强迫解除 private。
4. Agent 接口：根 typecheck、lint、format-check、format、test、test-coverage、check 仍必需；成员按职责提供动作，不要求机械复制根接口。所有 package
   scripts（含可选动作与生命周期动作）名称均禁止冒号，只允许无参数的
   `node scripts/<同名>.mjs`。scripts 顶层文件与 package
   scripts 严格双向一一对应，仅允许 .mjs；共享模块放 scripts/lib/，不作为命令入口，不要求 package
   script。
5. 工作流：根内 Git origin/主分支事实、GitHub
   main-push 与保留的 PR 入口采用固定质量 workflow，执行 pnpm
   check，全部必需 job/矩阵/聚合成功才合格。[共享显式谓词](npm-publisher-v1.md#ci-与事实边界)定义触发覆盖、稳定发布身份、工具/冻结安装/失败传播、缓存、可选定的有效 timeout 与安全并发；模板不是全量相等白名单。无关字段、job 与无害步骤可以扩展；无法证明的动态语义只对适用谓词报告准确 unconfirmed。谓词不符短路派生矩阵/发布绑定问题。统一最低值未通过先报环境问题并短路依赖矩阵差异；独立默认 CI/发布保护仍检。required 为统一消费者最低值及一个更高、当前受支持且满足适用范围的官方 LTS；范围外额外条目标 unsupported，不单独因此报 ci-mismatch。完整矩阵仍运行开发 check，工具不兼容保留 unconfirmed，不擅自引入 probe。声明 native-test 与 smoke 的成员还要求独立自动 main/PR 及手动 Ubuntu/Windows 工作流。
6. 文档与结构：声明 workspace 定位全部成员，聚合根无虚构源码/build 要求。README/CONTRIBUTING/docs/agent-project.md 只检查存在/可读/非空，固定根 AGENTS.md 与[唯一标准 asset](../assets/AGENTS.md)完整比较，仅统一 CRLF/CR 到 LF。嵌套 AGENTS 不能静默忽略。gitignore 检查依赖、输出、覆盖率/缓存与秘密，且不排除必要文件。

固定质量和发布 workflow 当前使用
`actions/checkout@v7`、`actions/setup-node@v7`、
`pnpm/action-setup@v6`，其 Action runtime 为 Node 24，不改变项目 `.node-version`
或消费者 engines.node。Action 版本由标准资产维护，仍按完整 workflow 结构比较；旧 v4 配置报告不匹配，不能通过改动权限、触发器或省略验证来迁移。更新版本时同步固定发布核心的 CI 结构校验、重建 CAR，再用新版 Check 验证和迁移项目。setup-node 未声明 registry-url，不生成 npm
token 配置；根 packageManager 使用 pnpm，自动 npm 缓存不适用，显式 pnpm 缓存及 frozen 安装保持原有语义。

## 支持语法与保守边界

- TypeScript
  JSONC、单个根内相对 extends、静态 include/exclude/files；严格子项不能关闭；project
  references 不作为执行证据；未知编译配置仍无法确认。类型配置从各代码项目 tsconfig.json 读取，不通过脚本参数推断配置选择。
- Acorn 只解析数据，不解释目标代码。支持 ESLint flat
  array、已知 typescript-eslint
  TypeChecked 预设及有限 map 包装、projectService；动态覆盖/自定义 parser 不支持。Prettier 静态 JSON/YAML/ESM 配置与忽略路径；插件/overrides 不支持。Vitest 静态 defineConfig、4.x/5.x 未触达 include 语义及全局 thresholds；可选 coverage.autoAttachSubprocess 支持 boolean
  true/false，不强制启用、不作为启用覆盖率或映射正确的证据；未知字段和非 boolean 仍无法确认。动态 projects/provider/分 glob 门限不支持。
- 格式检查覆盖源码、测试和维护者配置；生成的 pnpm-lock.yaml 不强制交给 Prettier 格式化，但仍要求纳入版本控制且不被 gitignore 排除。忽略必要格式目标时报告准确路径，不重复追加同根因的总括失败。
- typecheck、lint、format、format-check、test、test-coverage、lint-package、check 的入口及 scripts/lib/commands.mjs 必须与对应 output
  assets 准确一致，仅允许 LF 归一化。release/release-dry-run 及其固定 lib 同样检查。build 与扩展入口内部自由，不解释或执行，不因未知构建器报错。固定 lib 不能自由替换，不能靠相同 wrapper 名称获得通过。
- 固定工具参数保证 typecheck --noEmit，lint 不传 --fix，format
  --write 与 format-check --check 分离，Vitest
  run/--watch=false/--passWithNoTests=false，test-coverage 显式 --coverage.enabled=true，lint-package 调用 publint。check 先格式检查、按依赖顺序 build，再类型/lint/coverage/显式附加测试/包校验/显式扩展检查，子进程首次失败即失败。仍不代表一次实际执行已经成功，自定义 build/扩展不属于内部安全证明。
- 工具声明与静态配置独立检查，不伪造终端命令或能力证据来获得通过。根据代码职责要求已规定的工具；根格式职责要求 Prettier，存在 turbo.json 时要求 Turbo，npm 包校验职责要求 publint，静态 Vitest
  provider 决定 coverage
  provider 声明。ESLint/Vitest/Prettier 使用各项目常规配置位置；范围和工具选项保留在工具配置，不在拓扑中注入自由参数。发现 tsconfig.build.json 时检查其 emit、ESM、映射及源码/exports 的配置预期关系；没有该配置的自定义构建不因实现未知报错，也不宣称其产物已被证明。通配子路径、未知 exports 条件及 CJS 仍无法确认。
- Git 只读根内 .git/config 与可选 origin/HEAD，不执行 git 或 hook，不向根外跟踪 worktree
  gitdir。首版完整触发证明支持明确 main；其他主分支无法确认。非 GitHub 项目不强制 GitHub
  YAML，但不声称已验证其 CI。
- [单包与 workspace npm publisher v1](npm-publisher-v1.md)
  是已知发布 profile 的正向支持路径：有限构建配置的预期输出/映射源交付、实际 Bundle 中的已审查门卫源字节、完整声明式 workflow、准确 SHA/main-push/矩阵 CI 复用、OIDC/client、latest/rc/连续历史、单次 pack/同 tarball/dispatch
  dry-run。非标准文件准确报告缺失/不匹配；不以自定义发布脚本关键词获得通过。按实际根/成员职责选择单包或 workspace 适配，同一核心只交付一份，不要求无关 adapter；仅有 catalog/workspace 文件不构成多包依据。消费者运行矩阵与开发检查的完全分离仍是既有 profile 的范围限制，不要求人为缩窄包 engines。
- peer 兼容性支持 pnpm v9：从声明工具的准确 importer 引用定位其完整 snapshot
  key，沿 dependencies/optionalDependencies 或一致的 peer 后缀定位准确 peer
  snapshot 和 packages 记录。不会拿其他 importer、共享声明或全局可匹配版本代替实际上下文；缺项、冲突、散列后缀及未知协议无法确认。Vite 自动安装为 Vitest
  peer 时不强制添加未直接使用的 devDependency；检查所选版本及其 Node 兼容性。后缀最多 8192 字符、64 个直接绑定、32 层，不做任意依赖图遍历。

发布优先读取真实 manifest、workspace、workflow，不要求 release.config.json 或复制矩阵。单目标可唯一推导则无需额外描述；多目标复用已有 scripts/lib/release-packages.mjs 静态 ID/name/directory 映射（旧位置可读但脚本结构独立检查），由既有 CI
package
input/PACKAGE_INPUT 或准确 tag 每次唯一选择，不批量发布。未知或冲突的映射 fail-closed，不以任意 JavaScript 或自定义 verifier 代替证明。固定 release/release-dry-run 顶层入口共用 scripts/lib/npm-publish.mjs；CI 仅通过 pnpm
release/pnpm
release-dry-run 调用，禁止裸 publish 和直接 Node 发布内部文件。release
tag 解引用的完整 commit
SHA 必须 main 可达，且已有相同完整 SHA 的成功 main/push 固定 ci.yaml（所有必需 job/矩阵/聚合成功）；没结果、运行中、失败/取消/跳过、不完整、查询失败均直接阻断，不补跑 check 或派发补跑，不接受 PR、其他 workflow/分支/SHA 成绩。发布复用质量 CI、不重复 pnpm
check；兼容性属于质量门禁，不另立发布前整套检查。固定资源仍验证 RC 连续历史、private、版本不存在、内部依赖在线事实、OIDC、单次禁钩子 pack、同 tarball 校验/发布及 dispatch 只 dry-run。它们不证明线上权限或本次发布事实。

## 固定动作的拓扑推导

不要求 scripts.config.json，不重抄 projects/actions/dependsOn。固定命令用 pnpm 的只读成员枚举读取 pnpm-workspace.yaml 的真实成员，读取 package.json 的 dependencies/devDependencies/optionalDependencies/peerDependencies 推导内部依赖并检查循环；build 只调度实际声明的脚本。catalog-only 项目仍按单包处理。

按实际代码职责区分单包与 monorepo，不以 catalog-only 或单个成员声明推断多代码包。配置发现和执行根分离：每个代码项目分别从项目向根查找配置，在自身 cwd 执行。Vitest 显式 --root
. --config
<相对配置路径>，测试和 coverage 的 include/exclude 按成员 root 解释；ESLint 显式 --config 后 glob 按 cwd 解释且仅传本成员文件；tsc 显式 --project 指向实际配置，include/extends 保持 TypeScript 的配置来源相对语义，不擅自重定位。当前不支持 Vitest
projects/workspace/root，多项目配置报告 unconfirmed，不因为根有配置就推断整体调度。共享配置不去重成员根，不要求重复成员入口；静态规则核对同一范围并提供成员/配置/root/include/未匹配文件证据，共享根因聚合但保留独立配置差异。缺少职责证据不猜通过。包校验只针对非 private 且明确承担 npm 交付职责的项目。按 manifest 中 test-*
/
check-* 命名识别相应补充动作（排除固定标准动作），普通扩展仍可自由实现，不另要求新拓扑文件。自定义 build/扩展不解释内部，只传播其失败。

多成员项目的无源码聚合根不加入逐项目构建计划，避免先执行根 Turbo 聚合 build、再对同一批成员重复构建；有代码职责的根和单包自身 build 仍保留。根
`pnpm build`
可继续作为手动聚合入口。发布 workflow 先通过 pnpm/action-setup 准备 pnpm，再由 setup-node 初始化 pnpm 缓存，不依赖 runner 预装包管理器。

唯一标准资产的嵌套副本只有在正文完整一致、位于所属项目 assets/AGENTS.md，且 check.build.yaml 明确将 assets/** 交付到 resources/assets/ 时才识别为 Bundle 数据。不对其他嵌套入口或已修改副本作此豁免，它们仍无法确认。

映射身份使用全部声明成员核对，不因成员仍 private 就误报不存在或 name 不匹配；映射包含 private 包本身不表示允许发布。对 private 包只在有明确允许发布的证据时报告发布保护问题；目前可识别 workflow 在同一静态工作目录显式
`npm/pnpm pkg delete private` 或 `pkg set private=false`
后直接真实 publish 的绕过，不将任意自定义脚本视为已证明安全。固定发布 channel 从实际 manifest 决定，不接受自定义门卫取代；dry-run 同样遵守 latest/rc 规则。private 包不强加 npm 发布专项入口；自愿声明标准发布命令仍遵守通用固定入口/必要 lib 完整性，不因此推定 npm 交付职责。聚合根为明确的非私有成员提供发布入口时按该成员职责核对完整发布核心，不重复报告其 lib。

## 外部事实政策

业务 input 不接收来源、时钟、provider 或离线豁免。作者代码固定闭合生产 profile
`canonical-v1`，部署者必须先在实际执行主机授权以下来源；包含这些地址的 CAR 不意味着任意设备已获准联网：

| 端点                                                                                                                | 用途与时效                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://registry.npmjs.org/<encoded-public-tool-name>`，Accept `application/vnd.npm.install-v1+json`               | 官方完整版本表，包含已解析版本与最新稳定兼容系列版本的完整 engines/peer/dist 字段；接受 registry 缓存延迟，不能使用 slim 列表或全局 latest 代替系列计算 |
| `https://nodejs.org/dist/index.json`                                                                                | 官方完整发行索引，接受其缓存延迟，验证精确发行存在，并按稳定版本、LTS 标记和当前 schedule 支持期选择最高 SemVer；格式损坏或冲突仍无法确认               |
| `https://api.github.com/repos/nodejs/Release/contents/schedule.json?ref=main`，Accept `application/vnd.github+json` | 官方支持周期，接受其缓存延迟，验证文件路径、base64、大小及 Git blob SHA，按当前时间判断支持期限                                                         |

来源政策不读取目标 registry 或任意环境 URL，无重定向、代理、其他源或旧快照回退。官方 npm 完整 packument 的身份、版本键/manifest 一致性、modified 与全部 dist-tag 引用都检查；只从完整稳定候选计算所选系列，准确读取 current/newest
manifest。缺项、冲突或没有候选都 unconfirmed，不把网络错误当作版本落后。npmx 等其他来源不属于固定生产来源。

历史 Node 索引中的合法 prerelease 记录可被验证和保留，不因无关的 alpha 记录拒绝整个索引；prerelease 不得冒充稳定 LTS 默认开发版本，格式损坏或不一致的历史记录仍无法确认。

查询预算：每次请求最多 10 秒、16MiB，执行累计 128MiB/66 次请求/90 秒；每个完整 packument 最多 32768 个版本，只查询明确支持的公开工具名单，最多缓存 64 个包，仅在本次执行内复用。历史 Node 索引最多 20000 条，生命周期文件最多 256KiB/256 个系列。接受固定来源本次 HTTP 响应的缓存延迟，不发送强制重新验证的 Cache-Control 请求头，不因缓存年龄或 stale/expired/revalidating 状态单独拒绝。Date 必须可解析且不得异常超前，Age 必须为有效的非负整数；来源身份、响应完整性和数据一致性要求不变。观察时间仍记录 HTTP
Date/Age 中更老的时间，Node 组合观察时间取索引与 schedule 两者较旧的时间；缓存状态及索引缓存年龄仅作为遥测，LTS 支持期限按当前时间判断。请求失败仍不回退旧成功，重复发行版本、LTS 标记/支持期冲突不能支撑旧版回退。已知工具之外的自由开发依赖不外发名称，也不因未知而报告；已规定工具的必要 peer 未获支持时仍定位该 peer 的证据缺口。只有公开工具名发送给固定端点，不发送源码、配置、秘密或任意目标 URL。问题包含声明、importer、系列、新版、来源与时间等可追溯证据。

测试的内部确定性 provider 不属于业务契约；测试 CAR 明确是确定性元数据验证制品，不是 registry 或真实发布证据。生产 CAR 不含离线豁免。

## 安全与输出

只读项目，不执行目标模块、配置、hook、build/test/install/pack/publish。根内路径，拒绝链接/junction，枚举<=16384、成员<=128、配置<=512、1MiB/文件及16MiB总量。不再有脚本展开器。预算/未知配置是 unconfirmed；自定义 build/扩展内部未知不是问题，固定标准不匹配则报告明确差异。权限/意外 I/O/取消仍为执行故障。

普通 pass/nonpass 输出均链接 references/ 和 assets/；标准全文来自实际 Bundle。修复文档相对于 output.cid 指向 ../../assets/AGENTS.md，不依赖作者源码或硬编码 Check
CID。资产链接失败保留执行故障。先保护自定义文本到自由扩展，再恢复固定文件，不能自动覆盖用户工作。按真实依赖抑制连带报告：对每个 script 按声明/名称、调用形式、文件存在、固定正文、必要共享模块依次检查，前置失败不继续读取未引用的预期文件或必然失败的 lib；多个有效入口共用 lib 时只报一次并附影响范围，不因此放行。成员测试配置无法确认或不满足时，不追加依赖该配置的覆盖率配置判定；其他成员、脚本与独立领域继续检查。CI 先比较固定结构，结构前置不符短路派生矩阵/发布绑定，独立确凿缺陷仍保留；不因标准路径未声明而否认其他 job 上真实矩阵的存在。CI 只确认静态机制，不声称实际质量成绩或线上发布已通过。problem 继续使用 code/brief/documentation 契约，brief 提供 manifest/配置路径、字段、观察值与期望。
