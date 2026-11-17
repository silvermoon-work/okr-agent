# OKR Agent

基于 pnpm workspaces 和 Turborepo 的 OKR Agent monorepo。

## 开发工具

[`@silvermoon-work/devtool.publish-gate`](packages/devtool.publish-gate/README.md)
是只读的 npm `prepublishOnly` 发布上下文门禁，检查准确提交的 CI、Git/tag、
交付声明和 registry 状态，不接管构建、打包和发布。根包固定消费已发布的 rc.1，
不是 workspace 链接。workflow 通过门禁选择单个目标、构建依赖，再使用标准
`pnpm publish` 调用成员的 `prepublishOnly`；旧发布器副本已移除。
源码已迁移到包内声明与完整名称 tag，不会自动替换根依赖。
rc.1 不支持新协议。本次先以 rc.1、临时保留的根清单和旧 tag 发布 rc.3；
再固定消费 rc.3、移除旧配置，以新协议发布 rc.4。
每次都须确认准确版本和 SHA，并取得对应 main-push CI 成绩。
组织内开发工具包使用 `@silvermoon-work/devtool.<name>` 命名。

## Check Task 作者入口

- [`@silvermoon-work/check-task-sdk`](packages/check-task-sdk/README.md)：TypeBox 输入/问题码契约、命名 Checker 与有界并发检查图、v2 结果及来源文档。
- [`@silvermoon-work/check-task-builder`](packages/check-task-builder/README.md)：
  `check-task-builder init/build`，一次构建交付标准 Task Bundle/CAR。

历史发布基于 Task SDK/Protocol 0.2.0 RC；本工作树对接 Protocol/Engine
`0.2.1-rc.1`、Builder/Builder CLI `0.2.1-rc.0`、Node-only SDK `0.2.0` 与 IPFS
Store/Payload `0.1.0`。不复制运行时或编译器，不自动升级历史 npm/CAR。先运行
`check-task-builder init text-check`，编辑逻辑、契约与
`references/`，再运行生成项目中的 `pnpm build`。

当前源码迁移为 `runCheck(contract,{registry,root})` 和 `check-report/v2`；
Bundle 适配仅支持调用方拥有的执行端口，原始 Worker invokeTask 不提供单次
取消或 output envelope，不能冒充该端口。历史已发布 npm/CAR 不自动升级，
新候选需重建并以准确 tarball/CID 验证，详见 SDK 迁移说明。

- [`@silvermoon-work/check.nodejs-toolchain`](packages/check.nodejs-toolchain/README.md)：私有 Node.js 工具链 Check 作者项目，仅交付标准 CAR/CID，不发布 npm。显式执行上下文、CAR-only 消费方式与真实平台证据边界见包文档。

## 开发

开发环境使用根 `.node-version` 和 `packageManager` 中的精确版本；
各包消费者 Node 范围仍由各自 `engines.node` 声明：

```sh
pnpm install
pnpm check
```

新版 Bundle 支持不可变 `imports`，Builder 的 `content` 与 Engine 的 `ipfsStore`
注入同一种调用方拥有的 `IpfsStore`。当前公共子调用使用
`invokeTask({ key, bundle: "<CID>", path?, parameters, timeoutMs })`；
新构建的 Node/browser 入口均为 ESM `main.mjs`，旧 Node `worker.cjs`
仍由上游加载。
Engine snapshot 现在直接暴露 `result` payload，不再套 `output.result`。
升级后必须重建 CAR 并更新消费者引用的准确 CID；不修改历史制品或 Silvermoon 验收证据。旧 Engine 事实库不能自动迁移，消费者须显式选择新数据域。

### ipfsaw RC.0 发布

`@silvermoon-work/ipfsaw@0.1.0-rc.0` 已通过
[Trusted Publishing](https://github.com/silvermoon-work/okr-agent/actions/runs/43904944151)
发布到 npm `rc`；`latest` 仍为 `0.0.0`。准确发布提交
`14b58fb2af6a8c3ba537bf9b4909519ffd0c0a40` 的
[Node 22.15 / 24.11 CI](https://github.com/silvermoon-work/okr-agent/actions/runs/43903302978)
及发布门卫已通过，provenance 记录 `.github/workflows/publish-npm.yaml`。
独立临时目录仅从 registry 安装该精确版本，`--version`、`--help` 与
`registry list` 正常；无 scope 的 `ipfsaw` alias 本轮未发布。

该包首个发布失败于 `ENEEDAUTH`：项目发布 workflow 曾被改名为
`npm-publish.yaml`，与 npm 侧按 `publish-npm.yaml` 配置的 Trusted Publisher
不匹配；manifest 门卫、构建、打包与 publint 均通过，只有真实 tag push 才暴露。
现已恢复 `publish-npm.yaml` 并同步 Check 标准资产与全部引用。

### RC.1 发布与 Ubuntu 验证

`@silvermoon-work/check-task-sdk@0.1.0-rc.1` 与
`@silvermoon-work/check-task-builder@0.1.0-rc.1` 已分别通过
[SDK Trusted Publishing](https://github.com/silvermoon-work/okr-agent/actions/runs/43217303510)
和
[Builder Trusted Publishing](https://github.com/silvermoon-work/okr-agent/actions/runs/43217911987)
发布到 npm `rc`；`latest` 仍为 `0.0.0`，历史 `next` 不变。准确发布提交
`366d0faeccf77e7b2e23952d4f6466abd6942432` 的
[Node 22.15 / 24.11 CI](https://github.com/silvermoon-work/okr-agent/actions/runs/43216988465)
及发布门卫已通过。

独立 Ubuntu（Node
24.16.0）仅从 registry 安装上述精确版本及匹配上游包，无 workspace 链接或本地 tarball 替代。实际完成初始化、类型检查、构建，并通过同一父 CAR 的
`SpaceRef`
子调用验证通过、不通过及执行故障；共 6 个父子 Run 均已回收，输出参考文档可读。同时核验导入子根 CID 保持不变、删除原始子项目和内容缓存后仍能离线再打包、缺 sidecar 明确失败、`--no-car`
不修改既有 CAR，以及 Engine 关闭不关闭调用方的
`IpfsStore`。验证仅使用独立临时目录，结束后已清理；未修改远端全局工具或 registry。

可执行项目放在 `apps/`，共享库放在
`packages/`。当前保留 preset 示例，用于验证工作区依赖、类型检查、测试和构建链路。所有工作区包（包括私有根包）统一使用
`@silvermoon-work/*` 命名，内部依赖使用
`workspace:*`，共享第三方依赖版本集中在 pnpm catalog。

### Check Bundle 定义工作台（本地 mock）

[`@silvermoon-work/check-bundle-viewer`](packages/check-bundle-viewer/README.md)
提供版本化声明式 Spec 校验与可嵌入 React 的折叠脉络 / 契约详情。
私有宿主含当前 TypeScript Check 的真实身份分流子图，以及更丰富的项目定义 mock。
桌面为紧凑单行脉络树与独立滚动详情；移动端使用模态导航侧栏。
说明支持安全 Markdown，Parameters 从 Schema 的直接字段生成列表，
Problems 使用表格，Parents 从 children 逐边反向推导。
定义图采用 DAG：允许共享引用，禁止循环。

```sh
pnpm --filter @silvermoon-work/check-bundle-viewer build
pnpm --filter @silvermoon-work/check-bundle-web dev
```

访问
<http://127.0.0.1:4173/>，Ctrl+C 停止。只展示定义、不执行 checker 或说明表达式；
Schema 合法不等于语义前置条件成立。无需发布、后端或远程部署。

### 本地文件持续预览与 Browser Task（ipfsaw RC.2）

`0.1.0-rc.2` 发布候选新增标准 browser Task 路径：

```powershell
pnpm exec turbo run build --filter=@silvermoon-work/ipfsaw
node packages\ipfsaw\dist\bin.js run --car packages\ipfsaw\dist\check-task.car --document packages\ipfsaw\dist\check-task.json --no-open
```

使用前按 [ipfsaw 文档](packages/ipfsaw/README.md#标准-browser-taskrc2)
选择受控内容配置和 app 目录。`--cid` 可选择同一准确 Bundle；
HTTP
listening 不表示 Task 已启动。浏览器调用显式 ESM 默认导出，返回后应用继续存活；
保存内容会替换页面、重置应用/router 状态。原根位置参数、registry 和旧 renderer
ABI 保留独立，
已发布 `0.1.0-rc.0` / `0.1.0-rc.1` 不会因此获得新 `run` 命令。

[`@silvermoon-work/ipfsaw`](packages/ipfsaw/README.md) 提供通用 YAML/JSON
文件入口、Schema→不可变 renderer CID registry、共享 Task IPFS Store 与隔离
浏览器宿主。Check viewer 提供真正自包含的首个 browser renderer，
旧无 `$schema` 的直接 React 使用保持兼容；CLI 文档使用
`$schema: urn:ipfsaw:check-bundle:1`。受控本地 CAR 首次运行与命令见包文档；
旧路径不执行 Check / Task；新路径只执行启动 browser Task，不执行 Check checker。
不改原 4173 mock 宿主，也不代表 npm alias 已发布。

## Silvermoon

项目已接入 Silvermoon v2，默认内容语言为简体中文（`zh-CN`），主分支为
`silvermoon-work/okr-agent` 的 `main`。

使用设备级安装的 Silvermoon CLI 和个人 skill，不添加项目依赖：

```sh
silvermoon whats-next --audience agent --language zh-CN
silvermoon check --worktree --audience agent --language zh-CN
```

按报告的下一步操作推进；只有明确需要创建新想法时才运行
`silvermoon create-idea --audience agent --language zh-CN`。

## Preset 来源

本项目派生自
[`shazhou-ww/preset-pnpm-monorepo`](https://github.com/shazhou-ww/preset-pnpm-monorepo)
的 `main`，保留完整历史及 `.git-lineage.yaml`。工作区干净时可运行
`git-lineage update` 合并上游更新。以下保留 preset 的工作区与发布说明；Check
Task 两包使用单包 RC 发布流程，版本从 `0.1.0-rc.0` 开始，后续递增
`.1`、`.2`，使用 npm `rc` dist-tag，不更新 `latest`。

## pnpm monorepo baseline

A neutral TypeScript monorepo baseline built with pnpm workspaces and Turborepo.
It provides dependency topology, caching, shared quality tooling, and examples
without choosing a product shape such as CLI, web app, service, or publishable
package.

## Derive a repository

```sh
git-lineage derive \
  https://github.com/shazhou-ww/preset-pnpm-monorepo.git \
  my-workspace \
  --branch main
cd my-workspace
pnpm install
pnpm check
```

The upstream preset derives from
[`preset-typescript-base`](https://github.com/shazhou-ww/preset-typescript-base).
Its own `.git-lineage.yaml` records that immediate parent. This preset documents
its own capabilities and does not enumerate descendants.

## Structure

```text
apps/
  example/       executable project example
packages/
  core/          reusable library example
pnpm-workspace.yaml
turbo.json
```

The example app depends on `@silvermoon-work/core` through `workspace:*`.
Replace both examples as soon as the real workspace shape is known; they exist
to keep dependency ordering, type resolution, tests, and builds continuously
verified.

## Workspace conventions

- Executable and deployable projects belong in `apps/`.
- Reusable code belongs in `packages/`.
- Shared third-party versions belong in the pnpm catalog in
  `pnpm-workspace.yaml`.
- Internal dependencies use `workspace:*`.
- Each workspace owns its build, lint, test, and typecheck scripts.
- Turbo discovers members and dependency order from pnpm workspace manifests for
  build, types, tests and coverage. Simple member commands call tools directly;
  the root runs ESLint and Prettier once across the repository.
- Prefer standard tool commands and short fail-fast chains over custom wrappers.
  SDK and ipfsaw builds clean stale output with
  `rimraf dist && tsc --project tsconfig.build.json`. The web host uses the Vite
  CLI, including standard config discovery, and keeps development on
  `127.0.0.1:4173` with strict port selection. Custom scripts remain for builds
  with artifact-generation logic and integration harnesses. Publishing uses a
  pinned registry gate and standard pnpm lifecycle commands.

Add a dependency from the repository root:

```sh
pnpm --filter @silvermoon-work/example-app add some-package
pnpm --filter @silvermoon-work/core add --save-dev some-dev-tool
```

Run a command for one workspace:

```sh
pnpm --filter @silvermoon-work/core test
```

## Commands

### CI 身份与扩展

质量 workflow 保留稳定的保护身份，不把标准 YAML 当全量相等白名单。
无关通知 job、workflow 名称、metadata、无害步骤可扩展；稳定质量/矩阵/聚合身份、
完整 main push 与 PR 覆盖、根工具选择、冻结安装 → check 与失败传播不可绕过。
每个标准 job 显式指定 1..360 整数分钟 timeout；质量及兼容矩阵使用一个 pnpm store
cache，
本项目选择 action-setup@v6 的 cache:true，命中缓存仍执行冻结安装和 check。
并发按 workflow/event/PR 分组并取消同 PR 过期运行，main 以 run_id 隔离，
避免 cancel:false 仍替换同组 pending 主干验证。
详情见
[Check 历史标准中的谓词说明](packages/check.typescript-project/src-legacy/references/npm-publisher-v1.md#ci-与事实边界)。
当前发布门禁信任准确提交已经完成的 main CI，只读取矩阵和运行结果，
不重新证明 workflow 全文的全部语义。

`toolchain-native.yaml` 现在独立自动覆盖 main push、所有 PR 并支持手动执行，
在 Ubuntu/Windows 冻结安装后 build → native-test → smoke；无路径过滤以覆盖源码、
内部依赖、根锁文件、工具配置与 workflow 自身。

| Command              | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `pnpm build`         | Build every workspace in dependency order                        |
| `pnpm lint`          | Lint root config, maintenance scripts and all workspaces         |
| `pnpm typecheck`     | Type-check root configuration and every workspace                |
| `pnpm test`          | Run workspace package tests once                                 |
| `pnpm test-coverage` | Run workspace package coverage                                   |
| `pnpm format-check`  | Check formatting without modifying files                         |
| `pnpm lint-package`  | Build and run declared member package checks with publint        |
| `pnpm check`         | Ordered, fail-fast format/build/types/lint/coverage/package gate |
| `pnpm clean`         | Remove root and direct apps/packages outputs and Turbo state     |

`pnpm test` and `pnpm test-coverage` aggregate only workspace package tests; the
root has no independent test suite. The user-approved removal of the root
engineering and synthetic legacy-release regressions also removes their
automated graph/cache/cleanup and legacy-validator coverage; those regressions
were not migrated into another package. Existing package tests remain unchanged.
Coverage still includes untested source and enforces 90% for each of branches,
functions, lines and statements. Tests use the shared Vitest configuration with
each member's explicit working root. `pnpm lint-package` directly runs Turbo's
member `lint-package` tasks after their builds. Only npm delivery members
currently declare that script (`publint`); daily checks do not cross-check
package-local `deliverable.yaml`. The installed publish gate separately
validates delivery intent and publication context. Publint remains a CI quality
check; publication does not repeat exact-tarball validation.

For dependency-aware targeted work:

```sh
pnpm exec turbo run test --filter=@silvermoon-work/check-task-builder
```

Direct member commands (for example `pnpm --filter @silvermoon-work/core test`)
run only that member's tool; build dependencies first if needed. Build and
coverage outputs are cached; native/smoke/dev/demo actions are not. Root `check`
directly chains its pnpm commands with `&&`, preserving order and stopping on
the first failure.

`clean` uses rimraf's quoted `--glob` patterns for `dist`, `coverage` and
`.turbo` at the root and under direct `apps/*` and `packages/*` children,
including children without a package manifest. It does not recursively match
nested outputs or target dependency directories, stores or other worktrees
outside this layout. Output directory links are removed, leaving their targets
intact; there is no preflight rejection or validation of redirected
parent/member directories. Use it only with a trusted workspace layout.
Publishing remains outside Turbo.

本轮只简化消费仓库工程配置，不同步改写 TypeScript Check 标准资产。
直接命令及发布门禁与标准 `AGENTS.md` /
Check 中旧固定入口、发布器要求的冲突，记录于
[项目说明](docs/agent-project.md#engineering-simplification-and-check-policy-boundary)，
留待用户讨论；本轮工程验证不代表 Check Idea 已验收。

## Adding a workspace

Every direct child of `apps/` or `packages/` is discovered automatically. Give
it a unique package name and the standard scripts consumed by `turbo.json`. Keep
application packages private. Libraries opt in to the package-specific tag
release workflow below; examples remain private until deliberately configured.

## Publish one package

Publishing is opt-in. The root and example workspaces remain private. There is
no automatic batch release or automatic version bumping.

Each delivery package owns a `deliverable.yaml` containing its `type`; for
example [the SDK declaration](packages/check-task-sdk/deliverable.yaml).
Single-package repositories place it beside the root `package.json`; workspace
members declare it in their own directories, without inheritance. Only `npm`
declarations are publisher/publint candidates. The current npm deliveries are
`check-task-sdk`, `check-task-builder`, `ipfsaw` and `devtool-publish-gate`;
preset core stays private and is not registered. `task-bundle` classifies the
existing private Check authors' local Bundle/CAR deliverables without defining
IPFS/Pinboard distribution. Open types and migration rules are documented in
[explicit deliverables](packages/check.typescript-project/src-legacy/references/deliverables.md).
Cloudflare intent does not certify platform configuration or deployment.

### Configure a derived repository

1. Replace the deliberately selected library's name and metadata. Register its
   delivery in its own `deliverable.yaml` with `type: npm`; the directory is
   implicit and name/version are read from its manifest. No `path` or
   `packageId` is configured. Remove root `silvermoon.yaml`; do not copy
   historical example mappings or keep an independent
   `release-packages`/`release.config.json` target list. Update workspace
   consumers when renaming the library.
2. Only for a library ready to publish, remove `private: true`, add
   `"files": ["dist", "src", "README.md", "LICENSE"]`, and set
   `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }`.
   Include the library's README and license in its directory. Keep apps private.
3. Configure an `npm` GitHub environment and an npm Trusted Publisher for each
   package, using the exact owner, repository, `publish-npm.yaml` workflow, and
   `npm` environment. Do not configure an `NPM_TOKEN`.
4. Keep each library's `build` script aligned with Turborepo. Add
   `"prepublishOnly": "publish-gate check"` to each npm delivery member. The
   workflow requires this hook, builds the selected library and its workspace
   dependencies, then runs standard `pnpm publish` for that directory. Put
   required generation in `build`, not in publishing hooks.
5. Pin the gate's exact published version as a root development dependency. Do
   not use a workspace link to its candidate source. The tool's own publication
   is checked by the previously published version.

### Release a version

Bootstrap transition: the current workflow deliberately still uses `*-v*` and
the root `silvermoon.yaml` for the installed rc.1 gate only. Release rc.3 with
`devtool-publish-gate-v0.1.0-rc.3` after exact-SHA authorization and main-push
CI. Then pin published rc.3, remove that legacy declaration, switch the workflow
filter to `**@*`, and release rc.4 with the new protocol below. The candidate
gate does not accept or fall back to the legacy declaration. Do not use the new
tag examples until that second-stage commit is active.

Manually update the selected library's version and any affected internal
dependency versions. Commit these changes to main and wait for that exact
commit's main push CI, including **Release verification (v1)**, to succeed. Then
explicitly create and push its package-specific tag:

```sh
git tag @acme/library@1.2.3 <verified-main-commit>
git push origin @acme/library@1.2.3
```

The tag publishes only the mapped package. The tag and source manifest must
match the exact package identity/version; the root version is irrelevant.
Unknown package names, private/placeholder names, invalid versions, mismatches,
unresolved local dependencies, and already-published versions block release.
Canonical stable SemVer versions and `x.y.z-rc.n` prerelease versions are
supported (without build metadata). Stable versions use npm's `latest` tag;
prereleases use `rc`. For each target `x.y.z` version, start `n` at `0` and
increment it by one for each subsequent prerelease: `1.2.3-rc.0`, `1.2.3-rc.1`,
and so on. Use matching package-specific Git tags, for example
`@acme/library@1.2.3-rc.0` for the explicitly declared package `@acme/library`.
Unscoped packages use `library@1.2.3`. The workflow uses `tags: ["**@*"]` so
scoped package names containing `/` also trigger it. Historical `-v` tags are
not renamed or reused; this is an intentional release-interface change.

The pinned `@silvermoon-work/devtool.publish-gate` requires the latest `ci.yaml`
main push run for the exact full checked-out SHA, every required default/matrix
job, and the successful versioned aggregate job and step. Missing, pending,
skipped, failed or inaccessible evidence blocks publication. The hook neither
reruns CI nor builds, packs or publishes anything.

The workflow keeps its Trusted Publisher filename and `npm` environment. It
selects one target with `publish-gate target --json`, builds its dependency
closure, and supplies explicit `PNPM_CONFIG_REGISTRY`, `ACCESS`, `TAG`,
`PROVENANCE` and `DRY_RUN` settings to `pnpm publish --no-git-checks`. The gate
replaces pnpm's default branch restriction with exact event/tag/SHA, clean-tree,
main-ancestry and CI checks. Do not override these environment options with
conflicting command-line flags.

Native pnpm handles workspace/catalog manifest conversion and npm OIDC upload.
The gate resolves this repository's default `catalog:` and `workspace:*`
declarations read-only and requires matching runtime, optional and peer
dependency versions to exist on npm. Missing dependencies must be released
separately; building never publishes them. Named catalogs, other workspace
ranges and local-path/alias protocols are unsupported by the current gate.

This model trusts verified source and the controlled standard toolchain, not the
final tarball's bytes. There is no custom pack-once/fingerprint verifier.
Lifecycle hooks can be bypassed; publishing authorization remains a GitHub
environment/Trusted Publisher responsibility. The old fixed publisher, its
wrappers and root-only dependencies have been removed. Historical Check assets
still use the fixed-publisher profile and may report this intentional policy
conflict; their delivery declaration/tag contract has been migrated separately.

### Validate without publishing

After the configured commit's main push CI succeeds:

```sh
gh workflow run publish-npm.yaml --ref main -f package=@acme/library
```

Manual runs only perform a pnpm dry run, never an actual publish or dist-tag
update. All metadata, exact-commit CI, unpublished-version, channel, RC-history
and dependency checks still apply. Use an unpublished candidate version; an
already-published version must fail even in dry-run mode. A dry run is not proof
of a successful real OIDC publication.

Release tags are immutable. If CI has not completed, wait and retry the failed
workflow without moving the tag. Do not retry an already-successful publication;
an existing npm version is rejected. Automatic rollback, batch publishing,
version management, and dependency publication are deliberately out of scope.

## License

MIT
