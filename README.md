# OKR Agent

基于 pnpm workspaces 和 Turborepo 的 OKR Agent monorepo。

## Check Task 作者入口

- [`@silvermoon-work/check-task-sdk`](packages/check-task-sdk/README.md)：TypeBox单一输入/问题码契约、受限检查回调、业务结果与参考文档输出。
- [`@silvermoon-work/check-task-builder`](packages/check-task-builder/README.md)：
  `check-task-builder init/build`，一次构建交付标准 Task Bundle/CAR。

两包基于已发布 Task SDK/Protocol 0.2.0-rc.1、Builder/CLI/Engine
0.2.0-rc.2 及 IPFS Store 0.1.0-rc.1，不复制运行时或编译器。先运行
`check-task-builder init text-check`，编辑逻辑、契约与
`references/`，再运行生成项目中的 `pnpm build`。

- [`@silvermoon-work/check.nodejs-toolchain`](packages/check.nodejs-toolchain/README.md)：私有 Node.js 工具链 Check 作者项目，仅交付标准 CAR/CID，不发布 npm。显式执行上下文、CAR-only 消费方式与真实平台证据边界见包文档。

## 开发

使用 Node.js `^22.15.0 || >=23.5.0` 和 pnpm 11.22+：

```sh
pnpm install
pnpm check
```

新版 Bundle 支持不可变 `imports`，Builder 的 `content` 与 Engine 的 `ipfsStore`
注入同一种调用方拥有的 `IpfsStore`。子 Task 使用
`invokeTask({ key, bundle: SpaceRef, input, timeoutMs })`，不再接受旧
`{ cid, path }`。升级后必须重建 CAR 并更新消费者引用的准确 CID；不修改历史制品或 Silvermoon 验收证据。旧 Engine 事实库不能自动迁移，消费者须显式选择新数据域。

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
- Root commands use Turborepo to respect dependency order and cache outputs.

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

| Command          | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `pnpm build`     | Build every workspace in dependency order        |
| `pnpm lint`      | Lint release scripts and every workspace         |
| `pnpm typecheck` | Type-check every workspace                       |
| `pnpm test`      | Test release guards and workspaces with coverage |
| `pnpm check`     | Run formatting, lint, types, tests, and builds   |
| `pnpm clean`     | Remove workspace outputs and Turborepo state     |

## Adding a workspace

Every direct child of `apps/` or `packages/` is discovered automatically. Give
it a unique package name and the standard scripts consumed by `turbo.json`. Keep
application packages private. Libraries opt in to the package-specific tag
release workflow below; examples remain private until deliberately configured.

## Publish one package

Publishing is opt-in. The root and example workspaces remain private. There is
no automatic batch release or automatic version bumping.

### Configure a derived repository

1. Replace the example library's name and metadata. In
   `scripts/release-packages.js`, map its unique package ID to the exact npm
   name and `packages/<directory>`. For example, `core` can map to
   `@your-scope/core`. Update workspace consumers when renaming the library.
2. Only for a library ready to publish, remove `private: true`, add
   `"files": ["dist", "README.md", "LICENSE"]`, and set
   `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }`.
   Include the library's README and license in its directory. Keep apps private.
3. Configure an `npm` GitHub environment and an npm Trusted Publisher for each
   package, using the exact owner, repository, `publish-npm.yaml` workflow, and
   `npm` environment. Do not configure an `NPM_TOKEN`.
4. Keep each library's `build` script aligned with Turborepo. Publishing builds
   the selected library and its workspace dependencies, then packs only that
   library with lifecycle hooks disabled. Put required generation in `build`,
   not in `prepack`, `prepare`, or publishing hooks.

### Release a version

Manually update the selected library's version and any affected internal
dependency versions. Commit these changes to main and wait for that exact
commit's main push CI, including **Release verification (v1)**, to succeed. Then
explicitly create and push its package-specific tag:

```sh
git tag core-v1.2.3 <verified-main-commit>
git push origin core-v1.2.3
```

The tag publishes only the mapped package. Both the tagged manifest and the
tarball must match its exact name and version; the root version is irrelevant.
Unknown package IDs, private/placeholder names, invalid versions, mismatches,
unresolved local dependencies, and already-published versions block release.
Canonical stable SemVer versions and `x.y.z-rc.n` prerelease versions are
supported (without build metadata). Stable versions use npm's `latest` tag;
prereleases use `rc`. For each target `x.y.z` version, start `n` at `0` and
increment it by one for each subsequent prerelease: `1.2.3-rc.0`, `1.2.3-rc.1`,
and so on. Use matching package-specific Git tags, for example
`core-v1.2.3-rc.0`.

The pinned `github-ci-verify` CLI requires the latest `ci.yaml` main push run
for the exact checked-out SHA and its successful versioned aggregate job and
step. Missing, pending, skipped, failed, or inaccessible evidence blocks
publication. Changing the validation contract requires updating both the CI
aggregate and the publish verifier arguments. Publishing does not rerun
`pnpm check`.

`pnpm pack` converts `workspace:*` to registry versions. Internal runtime,
optional, and peer dependency ranges must already resolve to published npm
versions. Missing dependencies must be released with their own tags first;
building dependencies never publishes them. The workflow packs once, verifies
the tarball's manifest and dependencies, runs publint on it, and publishes that
same artifact through npm OIDC.

### Validate without publishing

After the configured commit's main push CI succeeds:

```sh
gh workflow run publish-npm.yaml --ref main -f package=core
```

Manual runs only perform an npm dry run, never an actual publish or dist-tag
update. All metadata, CI, artifact, and dependency checks still apply; only the
already-published-version rejection is omitted. A dry run is not proof of a
successful real OIDC publication.

Release tags are immutable. If CI has not completed, wait and retry the failed
workflow without moving the tag. Do not retry an already-successful publication;
an existing npm version is rejected. Automatic rollback, batch publishing,
version management, and dependency publication are deliberately out of scope.

## License

MIT
