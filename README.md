# OKR Agent

基于 pnpm workspaces 和 Turborepo 的 OKR Agent monorepo。

## 开发工具

[`@silvermoon-work/devtool.publish-gate`](packages/devtool.publish-gate/README.md)
是只读的 npm `prepublishOnly` 发布上下文门禁，检查准确提交的 CI、Git/tag、
交付声明和 registry 状态，不接管构建、打包和发布。根包固定消费已发布的 `0.1.0`，
不是 workspace 链接。workflow 通过门禁选择单个目标、构建依赖，再使用标准
`pnpm publish` 调用成员的 `prepublishOnly`；旧发布器副本已移除。
rc.3 已通过旧框架和固定的 rc.1 门禁发布；现已移除根清单和旧 tag 过滤，
统一采用包内声明与完整名称 tag。rc.4 仅递增版本、更新接入说明，
运行时代码与 rc.3 相同，已验证安装 rc.3 门禁的真实发布流程。
`0.1.0` 正式版沿用相同运行时代码，由固定的 rc.3 门禁检查后发布到 `latest`。
每次发版都须核验并记录准确版本和 SHA，并取得对应 main-push CI 成绩。
已前置授权“完成后发新 RC”的任务可直接发布该任务范围内的包，无需二次确认；
正式版须取得针对准确包、版本和提交的明确确认，RC 授权不涵盖正式版。
组织内开发工具包使用 `@silvermoon-work/devtool.<name>` 命名。

`devtool.publish-gate@0.2.0-rc.0` 的重复 `--workflow` 参数已在 IPAB 五包真实
发布中验证：同一准确 SHA 的日常 CI 与完整 Release validation 必须全部成功。
`0.2.0` 正式候选保持 RC 运行时不变，等待准确 main SHA 的 CI 和正式发布授权；
本仓库仍固定消费已发布的 `0.1.0`，不使用同仓候选自验。详情见
[包说明与消费证据](packages/devtool.publish-gate/README.md#rc-的真实消费证据)。

## Check Task 作者入口

- [`@silvermoon-work/check-task-sdk`](packages/check-task-sdk/README.md)：TypeBox 输入契约、有序 Checkpoints、Rule 定义与类型化成功输出、按检查点聚合的参考文档。
- [`@silvermoon-work/check-task-builder`](packages/check-task-builder/README.md)：
  `check-task-builder init/build`，一次构建交付标准 Task Bundle/CAR。

历史发布基于 Task SDK/Protocol 0.2.0 RC；本工作树对接
Protocol `0.2.1-rc.1`、Engine `0.2.2-rc.0`、Builder/Builder CLI
`0.2.1-rc.0`、Node-only SDK `0.2.0` 与 IPFS Store/Payload
`0.1.0`。不复制运行时或编译器，不自动升级历史 npm/CAR。先运行
`check-task-builder init text-check`，编辑逻辑、契约与
`references/`，再运行生成项目中的 `pnpm build`。

当前源码使用 `runCheck(contract,{checkpoints})`，检查点按顺序执行，
失败即停止；前置成功输出只在本次执行内经 `context.outputOf()` 共享。
问题报告规则码、brief 和 checkpoint，文档通过 references 聚合，不在每个问题内重复。
历史图 API 仅保留在显式 legacy 入口供归档回归使用。历史已发布 npm/CAR 不自动升级，
新候选须重建并验证准确 CID，详见 SDK 迁移说明。

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
提供版本化声明式 Spec v1 校验与可嵌入 React 的有序检查点列表 / 规则详情。
私有宿主含当前 TypeScript Check 的真实检查点，以及更丰富的项目定义 mock。
定义为 Check Task → Checkpoint → Rule，不再维护根节点、父子边或 DAG。
侧栏可拖动调宽、长标题单行省略；
按钮保留完整可访问名称与 title，选中后详情显示完整标题。
详情独立滚动，移动端使用模态导航侧栏。
说明支持安全 Markdown，Parameters 从 Schema 的直接字段生成列表，
Rules 使用 code / description 表格；只展示定义，不执行检查点。

```sh
pnpm --filter @silvermoon-work/check-bundle-viewer build
pnpm --filter @silvermoon-work/check-bundle-web dev
```

访问
<http://127.0.0.1:4173/>，Ctrl+C 停止。只展示定义、不执行 checker 或说明表达式；
Schema 合法不等于语义前置条件成立。无需发布、后端或远程部署。

### 本地文件持续预览与 Browser Task（ipfsaw RC.2）

新的公共
[`@silvermoon-work/content-bundle`](packages/content-bundle/README.md)
以 UnixFS 目录根 CID 打开不可变数据快照，使用 `.bundle.yaml` 描述入口，
以 DAG-CBOR Schema CID 校验入口和 content refs，并提供只读文件流。
当前 `0.1.0-rc.0` 已登记为 npm 发布候选，等待准确 main 提交的成功 CI 和 Trusted
Publishing；未改变下述 ipfsaw CLI 或 Renderer ABI。

`0.1.0-rc.2` 发布候选新增标准 browser Task 路径：

```powershell
pnpm exec turbo run build --filter=@silvermoon-work/ipfsaw
node packages\ipfsaw\dist\bin.js view packages\ipfsaw\dist\check-task.car packages\ipfsaw\dist\check-task.json --no-open
```

使用前按 [ipfsaw 文档](packages/ipfsaw/README.md#标准-browser-taskrc2)
选择受控内容配置和 app 目录。第一个位置参数也可指定同一准确 Bundle 的 CID 或 Viewer 别名；
HTTP
listening 不表示 Task 已启动。浏览器调用显式 ESM 默认导出，返回后应用继续存活；
保存内容会替换页面、重置应用内存状态；Check viewer 通过 URL
fragment 恢复所选节点，
并支持浏览器前进／后退。当前源码移除根文件入口、`run` 和 `$schema` 自动匹配，
统一用 `view <cid|car-path|alias> <document>` 与 `alias add/list/remove`；
已发布 `0.1.0-rc.0` / `0.1.0-rc.1` 不会因此获得新命令。
本地预览 URL 不含访问凭据，可复制到本机其他浏览器直接打开；
仍限制 loopback Host/Origin、同源文档/RPC 与隔离 iframe。
正常显示时没有常驻宿主栏，Check viewer 填满窗口。
关闭最后一个预览页面后，CLI 在 3 秒重连窗口结束时回收服务并退出；刷新和多标签不会立即误退出。

[`@silvermoon-work/ipfsaw`](packages/ipfsaw/README.md) 提供通用 YAML/JSON/JSONL
文件查看、Viewer 别名、共享 Task IPFS Store 与隔离
浏览器宿主。Check viewer 提供真正自包含的首个 browser renderer，
旧无 `$schema` 的直接 React 使用保持兼容；CLI 不再根据文档 `$schema`
选择 Viewer，
显式选择兼容现有 Renderer 和标准 browser Task，JSONL 按 `{records:[...]}` 传入。
受控本地 CAR 首次运行与命令见包文档；
Renderer 路径不执行 Check / Task；标准 Task 路径只执行启动 browser
Task，不执行 Check checker。
不改原 4173 mock 宿主，也不代表 npm alias 已发布。

## Silvermoon

新版候选 [`@silvermoon-work/silvermoon`](packages/silvermoon/README.md)
提供基于 Task Engine / Checker 的 CLI；私有
[`@silvermoon-work/check.silvermoon`](packages/check.silvermoon/README.md)
分别交付设备就绪、项目就绪、Idea 推进与提交合法性四个独立的 Check Task/CAR。
`create-idea`
在写入前与 `check-project`
共用[项目就绪检查](docs/silvermoon-project-check.yaml)，
复用 Idea Task 的前四个检查点，并独立检查有效 pre-commit hook 会以失败阻断方式
运行 `silvermoon check-changes --staged --audience agent`；检查不自动安装或执行
hook，配置须保留原逻辑并尊重 `core.hooksPath`。`check-setup`
独立执行[设备就绪检查](docs/silvermoon-setup-check.yaml)，不要求 Git 项目。
`check-idea <idea>` 必须指定 Idea。
`check-changes --staged` 走提交检查，可用于 commit hook，不要求工作区洁净、
upstream 就绪或 Idea 完成。新 Idea 仅位于 `.silvermoon/i`，包含
events.jsonl 和 requirements、research-scope、technical-spec、test-scope、
test-spec、implementation、deployment 七个平级文件夹，无 idea.json。
详见[Events 契约](docs/silvermoon-events.md)。
继续 review 使用[最新 Idea Check 设计 Spec](docs/silvermoon-idea-check-design.yaml)；
[生成的运行时 Spec](docs/silvermoon-single-checker.yaml)与原设计候选保持各自原语义。
最新 Events review 将标准化前提与 checkpoint 推进分开：
推进关口统一 submit → accept，以实际 owning 文件夹的 Git TREE
ID 和单个直接前置文件夹 TREE ID
measure，版本改变时自然退化，不写 rollback。项目级 checkpointAcceptance
默认将 test-spec 和 implementation 委托 Agent，其余关口要求用户共识；
accept.authority 区分 user/delegate，模式收紧不把旧自验误当用户接受。
推进对象统一为 requirements、research-scope、technical-spec、test-scope、
test-spec、implementation、deployment；用户实际体验验收归入 deployment 的 accept，
不再另设 user-acceptance。历史事件与材料保持原语义，不自动迁移。
新模型取消事件 id/version 及独立 signOff/verify 分支，按 object + revision +
upstream
接受内容；相同材料及依赖的提交幂等。构建包含准确可信自包含 JSON
Schema 的离线资源，
另以 eventSchemaCid 固定数据契约，按 RFC 8785 → SHA-256 → CIDv1 生成身份；
Checker 执行身份单独记录，不混同于事件格式。
created-first 先读取最小有界身份，再按 eventSchemaCid 校验整个日志，包括 created；
未知 Schema 明确失败，不 fallback。不构造 material/upstream 复合树或递归依赖树。
Check 只判断事件状态、当前版本/直接前置、权限、历史/协议、标准化和同步，
不判断测试、CI、报告真实性、用例完整性、受测代码或声明 commit/path 绑定。
实现支持材料记录增删改 TEST CASES 和提交 commit，Agent 接受前验证包含该 commit
的本地测试或 CI 通过；部署由 Agent 自验实际结果后用户 hands-on 明确接受。
这些是真实 Agent 责任而非机器谓词；Spec.md 是提示，不是强制模板。
旧 idea.json/checkCid/id/version 数据保持只读原语义，可读可检查，
导航要求显式迁移，本轮不迁移、不新增旧事件或以旧协议推进。
旧版 `.silvermoon/ideas` 已从工作树移除，文档与验收记录仅保留在 Git 历史中，
不迁移、不补 CID，也不自动满足新标准。
候选构建和验证不会替换当前全局旧 CLI 或个人 skill；正式发布、安装及
试用分别遵守各自授权，不能把本地候选视为已发布版本。

项目已接入 Silvermoon paired，默认内容语言为简体中文（`zh-CN`），主分支为
`silvermoon-work/okr-agent` 的 `main`。

使用设备级安装的 Silvermoon CLI 和个人 skill，不添加项目依赖：

```sh
silvermoon check-setup --audience agent
silvermoon check-project --audience agent
silvermoon list-ideas --json
silvermoon check-idea <idea> --audience agent
silvermoon check-changes --worktree --audience agent
```

按报告的下一步操作推进；只有明确需要创建新想法时才运行
`silvermoon create-idea --audience agent --language zh-CN`，创建前会检查设备与仓库前提。
新版提供
`check-setup`、`check-project`、`create-idea`、`check-idea`、`check-changes`、
`get-reference <cid>` 与
`list-ideas`；事件直接编辑文件后检查，不再提供事件写入命令。
`check-changes` 默认检查工作区，提交前使用 `--staged` 检查实际索引。
可读 Check 输出通过时仅显示 `pass`，不通过时列出失败 Rule、所属 Checkpoint
及对应文档中的规则含义与修复指引，不附带 Task 内部参数 Schema；
`--json` 和 `get-reference` 保留完整文档。

Silvermoon 的默认 `test` / `test-coverage` / `pnpm check` 不创建真实 Git
仓库、不执行 Git、子 CLI 或真实 Engine worker。默认测试以准备好的快照／命令输出
和宿主边界 mock 验证真实协议、历史与检查规则，仍包含全部源码并维持四项 90%
coverage 门禁。原有真实仓库回归保留为显式、非缓存且限时的 `native-test`，
不进入默认 CI；详见[测试隔离](packages/silvermoon/README.md#test-isolation)。

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
- The viewer runs TypeScript compilation before its artifact-generation script
  in a fail-fast command chain. Toolchain `native-test` calls Vitest directly
  with a member configuration that reuses the shared test settings and enables
  installed-tool tests. Neither action needs a root pnpm subprocess wrapper.

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
currently declare that script (`publint --strict`, so warnings fail the check);
daily checks do not cross-check package-local `deliverable.yaml`. The installed
publish gate separately validates delivery intent and publication context.
Publint remains a CI quality check; publication does not repeat exact-tarball
validation.

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
`check-task-sdk`, `check-task-builder`, `ipfsaw`, `content-bundle` and
`devtool-publish-gate`; preset core stays private and is not registered.
`task-bundle` classifies the existing private Check authors' local Bundle/CAR
deliverables without defining IPFS/Pinboard distribution. Open types and
migration rules are documented in
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

Authorization is channel-specific: an advance instruction to publish a new RC
after a task authorizes selecting and recording that package's next valid RC
version and exact eligible commit, without a second confirmation. It does not
authorize unrelated packages or dependency releases. Stable releases require
explicit user confirmation of the exact package, stable version and commit; RC
permission does not authorize publishing to `latest`. Do not repeat an already
supplied confirmation for the same stable package/version/commit. All release
checks below still apply to both channels. See
[project release guidance](docs/agent-project.md#publishing).

The bootstrap transition published rc.3 through the installed rc.1 gate. The
root now pins published `0.1.0`, the legacy root declaration is removed, and the
workflow uses `**@*` tags. The rc.4 validation release keeps rc.3 runtime source
unchanged and used the installed rc.3 gate, not its own candidate code.

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
