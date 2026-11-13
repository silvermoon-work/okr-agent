# TypeScript 项目长期维护约定

唯一公开 Check 的闭合输入为
`{"projectDirectory":"执行机绝对目录"}`。旧 context、requirements、projectScopes、额外字段及空对象均拒绝。规则是作者固定内部政策；不提供豁免或成员筛选。

## 六类检查

1. 环境：根 .node-version 精确默认开发 Node，官方发行与生命周期确认仍支持的 LTS；代码成员 engines.node 独立检查。根 packageManager 精确 pnpm 稳定版本，跟进所选 major 最新版本；重复默认选择不得冲突。
2. 工具：devDependencies、默认/named catalog 与实际 pnpm lockfile
   importer 的 specifier/version。major>=1 追同 major，0.minor 追同 minor 的 patch，0.0.patch 精确锁定；声明及已解析版本都检查。校验工具 Node 与已解析 peer 兼容；其他 snapshot 不能替代本 importer。
3. 规范与交付：strict、五项 safety、源码与测试类型感知 lint、只读格式检查、单次测试、未触达文件覆盖及四项全局门限>=90。实际 npm
   ESM 职责附加检查身份/许可/链接、exports、files、构建/映射、publint 与根门禁连接，不强迫解除 private。
4. Agent 接口：根 typecheck、lint、format:check、format、test、test:coverage、check；按已证明能力追踪成员，不能仅凭名字通过。产物与 npm 包附加 build/lint:package；检查不写源码，不吞失败。
5. 工作流：根内 Git origin/主分支事实、GitHub
   PR/main-push、checkout/冻结安装/check 顺序和根工具声明选择。npm 发布检查确定的不安全配置，未知门卫明确无法确认，不用关键词判通过。
6. 文档与结构：声明 workspace 定位全部成员，聚合根无虚构源码/build 要求。README/CONTRIBUTING/docs/agent-project.md 只检查存在/可读/非空，固定根 AGENTS.md 与[唯一标准 asset](../assets/AGENTS.md)完整比较，仅统一 CRLF/CR 到 LF。嵌套 AGENTS 不能静默忽略。gitignore 检查依赖、输出、覆盖率/缓存与秘密，且不排除必要文件。

## 支持语法与保守边界

- TypeScript
  JSONC、单个根内相对 extends、静态 include/exclude/files；严格子项不能关闭；project
  references/未知编译模式无法确认。
- Acorn 只解析数据，不解释目标代码。支持 ESLint flat
  array、已知 typescript-eslint
  TypeChecked 预设及有限 map 包装、projectService；动态覆盖/自定义 parser 不支持。Prettier 静态 JSON/YAML/ESM 配置与忽略路径；插件/overrides 不支持。Vitest 静态 defineConfig、4.x/5.x 未触达 include 语义及全局 thresholds；动态 projects/provider/分 glob 门限不支持。
- scripts 仅有限 token、&&、pnpm 脚本委托与无 filter
  Turbo；不运行 shell。hooks、动态 shell/环境、管道、成功兜底或任意 node 脚本不能证明能力。未知 build/pack/发布门卫始终无法确认。Turbo 展开成员任务时仍保留已静态识别的调用目录；字面调度器同样须在该目录或共享根声明并由准确 importer 解析，不因展开后只剩成员工具而豁免，也不以无关 importer 的依赖代替。
- Git 只读根内 .git/config 与可选 origin/HEAD，不执行 git 或 hook，不向根外跟踪 worktree
  gitdir。首版完整触发证明支持明确 main；其他主分支无法确认。非 GitHub 项目不强制 GitHub
  YAML，但不声称已验证其 CI。
- [单包 npm publisher v1](npm-publisher-v1.md)
  是完整的正向支持路径：有限 tsc 输出/映射源交付、实际 Bundle 中的已审查门卫源字节、完整声明式 workflow、准确 SHA/main-push/矩阵 CI 复用、OIDC/client、latest/rc/连续历史、单次 pack/同 tarball/dispatch
  dry-run。其他自定义门卫、复杂产物与矩阵仍明确 unconfirmed，不虚构线上或发布事实。
- peer 兼容性支持 pnpm v9：从声明工具的准确 importer 引用定位其完整 snapshot
  key，沿 dependencies/optionalDependencies 或一致的 peer 后缀定位准确 peer
  snapshot 和 packages 记录。不会拿其他 importer、共享声明或全局可匹配版本代替实际上下文；缺项、冲突、散列后缀及未知协议无法确认。Vite 自动安装为 Vitest
  peer 时不强制添加未直接使用的 devDependency；检查所选版本及其 Node 兼容性。后缀最多 8192 字符、64 个直接绑定、32 层，不做任意依赖图遍历。

发布配置已有两条窄静态证据路径：读取 `scripts/release-packages.js` 的
`export const releasePackages = [{id,name,directory}]`
纯数据，验证唯一性及真实成员身份；识别明确的
`pnpm exec github-ci-verify --sha "$(git rev-parse HEAD)" --branch ... --workflow ... --job-name ... --step-name ... --json --summary`，追到现有 CI 中准确版本化聚合 job/step、必需 check
job 与完整失败传播。动态映射、固定/其他 SHA、标识漂移、空壳聚合或未知矩阵不能支撑通过。这些局部证据仍不等于已证明整条发布链路。

## 外部事实政策

业务 input 不接收来源、时钟、provider 或离线豁免。作者代码固定闭合生产 profile
`canonical-v1`，部署者必须先在实际执行主机授权以下来源；包含这些地址的 CAR 不意味着任意设备已获准联网：

| 端点                                                                                                                | 用途与时效                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://registry.npmjs.org/<encoded-public-tool-name>`，Accept `application/vnd.npm.install-v1+json`               | 官方完整版本表，包含已解析版本与最新稳定兼容系列版本的完整 engines/peer/dist 字段；HTTP Date/Age 至多一小时，不能使用 slim 列表或全局 latest 代替系列计算                        |
| `https://nodejs.org/dist/index.json`                                                                                | 只验证精确历史发行存在及其发行时 LTS 标记；记录真实 Date/Age，允许历史索引缓存超过一小时，不把它声称为新鲜数据，不用它选择最新版本或推断当前生命周期；精确版本缺失仍 unconfirmed |
| `https://api.github.com/repos/nodejs/Release/contents/schedule.json?ref=main`，Accept `application/vnd.github+json` | 新鲜的官方当前支持周期；HTTP Date/Age 至多一小时，验证文件路径、base64、大小及 Git blob SHA，按此观察时间判断支持期限                                                            |

来源政策不读取目标 registry 或任意环境 URL，无重定向、代理、其他源或旧快照回退。官方 npm 完整 packument 的身份、版本键/manifest 一致性、modified 与全部 dist-tag 引用都检查；只从完整稳定候选计算所选系列，准确读取 current/newest
manifest。缺项、冲突或没有候选都 unconfirmed，不把网络错误当作版本落后。npmx 缓存代理的内部 SWR 时效证据不足，不是生产备选源。

历史 Node 索引中的合法 prerelease 记录可被验证和保留，不因无关的 alpha 记录拒绝整个索引；prerelease 不得冒充稳定 LTS 默认开发版本，格式损坏或不一致的历史记录仍无法确认。

当前 Windows 开发机仍受设备镜像限制：本地安装、构建工具等包操作保持 NRM 选择的 Tencent
registry，不传
`--registry`、不偷偷回退官方源，也不在该机对 canonical-v1 做现场联网验证。生产解析器只做拦截 fetch 的受控测试；生产 CAR 的实际联网证明在已授权官方 registry 的
`xiaonuo-ubuntu`
进行。其他主机须各自授权，不能以本项目授权绕过宿主策略。作者/监督者应记录同一 CAR 的实际网络结果，不将 mock/fixture 成绩冒充线上证明。

查询预算：每次请求最多 10 秒、16MiB，执行累计 128MiB/66 次请求/90 秒；每个完整 packument 最多 32768 个版本，只查询明确支持的公开工具名单，最多缓存 64 个包，仅在本次执行内复用。历史 Node 索引最多 20000 条，生命周期文件最多 256KiB/256 个系列。所有可变事实以 HTTP
Date/Age 中更老的时间为准；响应标记 stale/expired/revalidating 或过期时不能通过，失败不回退旧成功。历史索引例外只用于上述不可变事实，其真实缓存年龄单独记录，不参与当前生命周期观测时间。已知工具之外的开发依赖不外发名称，报告无法确认。只有公开工具名发送给固定端点，不发送源码、配置、秘密或任意目标 URL。问题包含声明、importer、系列、新版、来源与时间等可追溯证据。

测试的内部确定性 provider 不属于业务契约；测试 CAR 明确是确定性元数据验证制品，不是 registry 或真实发布证据。生产 CAR 不含离线豁免。

## 安全与输出

只读项目，不执行目标模块、配置、hook、build/test/install/pack/publish。根内路径，拒绝链接/junction，枚举<=16384、成员<=128、配置<=512、1MiB/文件及16MiB总量；脚本展开<=4096、深度<=32、终端<=8192。预算/未知语义是 unconfirmed，权限/意外 I/O/取消仍为执行故障。

普通 pass/nonpass 输出均链接 references/ 和 assets/；标准全文来自实际 Bundle。修复文档相对于 output.cid 指向 ../../assets/AGENTS.md，不依赖作者源码或硬编码 Check
CID。资产链接失败保留执行故障。先保护自定义文本到自由扩展，再恢复固定文件，不能自动覆盖用户工作。
