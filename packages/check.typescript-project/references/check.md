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
  Turbo；不运行 shell。hooks、动态 shell/环境、管道、成功兜底或任意 node 脚本不能证明能力。未知 build/pack/发布门卫始终无法确认。
- Git 只读根内 .git/config 与可选 origin/HEAD，不执行 git 或 hook，不向根外跟踪 worktree
  gitdir。首版完整触发证明支持明确 main；其他主分支无法确认。非 GitHub 项目不强制 GitHub
  YAML，但不声称已验证其 CI。
- [单包 npm publisher v1](npm-publisher-v1.md)
  是完整的正向支持路径：有限 tsc 输出/映射源交付、实际 Bundle 中的已审查门卫源字节、完整声明式 workflow、准确 SHA/main-push/矩阵 CI 复用、OIDC/client、latest/rc/连续历史、单次 pack/同 tarball/dispatch
  dry-run。其他自定义门卫、复杂产物与矩阵仍明确 unconfirmed，不虚构线上或发布事实。

发布配置已有两条窄静态证据路径：读取 `scripts/release-packages.js` 的
`export const releasePackages = [{id,name,directory}]`
纯数据，验证唯一性及真实成员身份；识别明确的
`pnpm exec github-ci-verify --sha "$(git rev-parse HEAD)" --branch ... --workflow ... --job-name ... --step-name ... --json --summary`，追到现有 CI 中准确版本化聚合 job/step、必需 check
job 与完整失败传播。动态映射、固定/其他 SHA、标识漂移、空壳聚合或未知矩阵不能支撑通过。这些局部证据仍不等于已证明整条发布链路。

## 外部事实政策

业务 input 不接收来源、时钟、provider 或离线豁免。本 CAR 的生产包元数据策略在作者代码明确捕获为
`https://mirrors.cloud.tencent.com/npm/<encoded-public-tool-name>`，使用 install-v1
Accept，无 canonical
npm 或其他源回退、不读取目标 registry/任意环境 URL。Node 事实仍只读
`https://nodejs.org/dist/index.json` 与
`https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`。

镜像 HTTP
Date/Age 新鲜、JSON 包名与版本字段完整，仍不证明已经与上游同步。因此当前镜像观察明确标为 authoritative=false；无法证明系列最新时报告 unconfirmed，而不是把镜像缺项当最新版事实。不会偷偷改用官方 npm。其他设备需要不同授权来源时必须明确重新作者化来源策略/CAR，不能通过业务 input 或隐形环境覆盖改写本次来源政策。

请求禁止重定向，每次最多 10 秒、16MiB；每次执行最多 64 个公开包并只在该次执行内缓存，不保留跨执行/模块无界缓存。响应 Date/Age 与每项观察时间必须不超过一小时。没有可信完整候选、缺项、错误/超时或陈旧证据均无法确认，无旧快照成功回退。已知工具之外的开发依赖首版不外发名称，报告无法确认。只有名称发送给固定公开源，不发送源码、配置、秘密或任意目标 URL。问题包含声明、importer、系列、新版、来源与时间等可追溯证据。

测试的内部确定性 provider 不属于业务契约；测试 CAR 明确是确定性元数据验证制品，不是 registry 或真实发布证据。生产 CAR 不含离线豁免。

## 安全与输出

只读项目，不执行目标模块、配置、hook、build/test/install/pack/publish。根内路径，拒绝链接/junction，枚举<=16384、成员<=128、配置<=512、1MiB/文件及16MiB总量；脚本展开<=4096、深度<=32、终端<=8192。预算/未知语义是 unconfirmed，权限/意外 I/O/取消仍为执行故障。

普通 pass/nonpass 输出均链接 references/ 和 assets/；标准全文来自实际 Bundle。修复文档相对于 output.cid 指向 ../../assets/AGENTS.md，不依赖作者源码或硬编码 Check
CID。资产链接失败保留执行故障。先保护自定义文本到自由扩展，再恢复固定文件，不能自动覆盖用户工作。
