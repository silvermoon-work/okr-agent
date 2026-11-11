# OKR Agent

基于 pnpm workspaces 和 Turborepo 的 OKR Agent monorepo。

## 开发

使用 Node.js 22.13+ 和 pnpm 11.22+：

```sh
pnpm install
pnpm check
```

可执行项目放在 `apps/`，共享库放在
`packages/`。当前保留 preset 示例，用于验证工作区依赖、类型检查、测试和构建链路。

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
`git-lineage update`
合并上游更新。以下保留 preset 的工作区与发布说明；发布功能尚未启用。

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

The example app depends on `@workspace/core` through `workspace:*`. Replace both
examples as soon as the real workspace shape is known; they exist to keep
dependency ordering, type resolution, tests, and builds continuously verified.

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
pnpm --filter @workspace/example-app add some-package
pnpm --filter @workspace/core add --save-dev some-dev-tool
```

Run a command for one workspace:

```sh
pnpm --filter @workspace/core test
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
Canonical stable and prerelease SemVer versions are supported (without build
metadata); stable versions use npm's `latest` tag and prereleases use `next`.

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
