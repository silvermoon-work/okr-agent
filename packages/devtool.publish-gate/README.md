# @silvermoon-work/devtool.publish-gate

面向 Silvermoon 项目的轻量 npm 发布上下文门禁。作为开发依赖接入
`prepublishOnly`，成功退出 0，任何无法确认的条件退出非 0。真正的打包、上传、
OIDC 认证和 provenance 由标准 npm / pnpm 完成。

`0.1.0-rc.3` 已通过旧框架、已安装的 rc.1 门禁和 Trusted Publishing 发布。
本仓库根包固定依赖已发布的 rc.3，而不是同仓候选源码。
源码与当前 workflow 均采用包内声明与完整名称 tag。
所有 npm 成员仍通过 `prepublishOnly` 调用已发布的根开发依赖。
Trusted Publisher 必须绑定 `.github/workflows/publish-npm.yaml` 和 `npm`
environment；配置 Trusted Publisher 不等于授权任意版本发布。

**两阶段发布衔接**：rc.3 已发布，tag 为
`devtool-publish-gate-v0.1.0-rc.3`。根依赖及 lockfile 现固定到 rc.3，
根 `silvermoon.yaml` 已移除，workflow 启用 `**@*` 过滤。
本次 rc.4 仅递增版本、更新接入说明，运行时代码与 rc.3 相同，
由已安装的 rc.3 检查发布，tag 为
`@silvermoon-work/devtool.publish-gate@0.1.0-rc.4`。
每阶段都需准确提交的 main-push CI 成功，并另行确认版本和 SHA 后才推 tag；
不绕过生命周期，不以同仓候选源码替代固定的已发布门禁。

## 接入方式

首次发布后，在消费仓库根包的 devDependencies 中固定已发布的准确版本。
不要在本工具包自己的依赖中添加自己，也不要让发布自动使用同仓尚未发布的候选实现。

在**实际发布包**的目录（单包仓库即根目录）创建 `deliverable.yaml`：

```yaml
type: npm
```

包名和版本从同目录的 `package.json` 读取，不配置 `path` 或 `packageId`，
不继承父目录声明，也不再读取根 `silvermoon.yaml`
交付清单；旧清单存在时明确拒绝。
monorepo 每个交付包各自声明，私有聚合根无需声明。

将以下生命周期脚本添加到**实际发布包**，不是仅添加到私有聚合根包：

```json
{
  "scripts": {
    "prepublishOnly": "publish-gate check"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

GitHub Actions 安装固定依赖并完成必要构建后，进入选中包目录，显式执行：

```sh
# RC
npm publish --registry=https://registry.npmjs.org/ --access=public --tag=rc --provenance

# 正式版
npm publish --registry=https://registry.npmjs.org/ --access=public --tag=latest --provenance

# workflow_dispatch 只允许此类 dry-run
npm publish --dry-run --registry=https://registry.npmjs.org/ --access=public --tag=rc --provenance
```

这些 registry 参数仅用于受控 CI 发布，不改变开发机的 registry 配置。
使用 npm 时必须采用目录发布和上述显式选项；不接受 `--force`，不支持 tarball
发布、任意发布器、批量 workspace 发布或通用策略配置。

```sh
publish-gate --help
publish-gate check --help
publish-gate --version
```

### Native pnpm

pnpm 不把命令行发布选项自动导出给生命周期。受支持的 workflow 通过标准环境配置
传递选项，不能再用冲突的命令行选项覆盖它们：

```sh
export PNPM_CONFIG_REGISTRY=https://registry.npmjs.org/
export PNPM_CONFIG_ACCESS=public
export PNPM_CONFIG_TAG=rc
export PNPM_CONFIG_PROVENANCE=true
export PNPM_CONFIG_DRY_RUN=true
pnpm --dir packages/devtool.publish-gate publish --no-git-checks
```

真实 tag 发布将 `PNPM_CONFIG_DRY_RUN` 设为
`false`。这里关闭 pnpm 默认的分支检查，
由门禁执行更明确的准确 SHA、main 祖先关系和 CI 证据检查，不放宽这些保护。
门禁识别 pnpm 的生命周期 user agent，读取 `PNPM_CONFIG_*`；npm 仍读取
`npm_config_*`。仅支持受控 workflow 的这些入口，不从父进程重建任意命令行，
也不声称能够拦截绕过或篡改约定的发布者。

native pnpm 模式支持当前仓库的默认 `catalog:` 和 `workspace:*`：
前者读取根 `pnpm-workspace.yaml` 的 catalog；后者通过只读
`pnpm list --recursive --depth -1 --json` 获取唯一成员的准确版本。
随后验证 registry 中已有匹配版本。实际 manifest 转换、打包和发布均由 pnpm 执行；
门禁不运行 `pack`。named catalogs、其他 workspace 范围和本地路径协议暂不支持，
缺失或歧义声明会明确失败。

### Workflow 目标选择

```sh
publish-gate target --json
```

单包从 Git 根的 `deliverable.yaml` 选择；有 `pnpm-workspace.yaml` 时使用
`pnpm list --recursive --include-workspace-root --depth -1 --json`
枚举真实成员，
逐包读取 `deliverable.yaml`，不递归扫描任意目录或继承声明。
以完整 `name@version` tag / `PACKAGE_INPUT` 选择恰好一个 npm 包，
输出 `directory`、`name`、`version` 和 `channel`，完整 npm 名称不得重复。
无 `--json` 时输出人类可读摘要。此命令只用于 workflow 编排，**不批准发布**，
不检查 CI、不访问 registry；真正的门禁仍在选中包的 `prepublishOnly` 中执行。
支持 `publish-gate target --help`。

无参数只显示帮助，不访问网络。`check` 只接受 GitHub Actions 中由标准
`npm publish` / `pnpm publish` 调用的 `prepublishOnly`
上下文；不能当作本机离线预检命令。
帮助、版本和成功摘要写 stdout；参数及门禁错误写 stderr，不输出 token。

## 首版固定约定

- 当前目录是被发布包的非重定向目录，Git 根是受信任的工作区；
  当前目录的 `deliverable.yaml` 显式声明 `type: npm`。
  不要求 pnpm workspace，根目录单包与成员包使用同一检查流程。
- 使用当前 manifest 的包名和规范 `x.y.z` / `x.y.z-rc.n`，禁止 private 包和
  placeholder 身份。`publishConfig` 只支持 `registry`、`access` 和可选 `tag`，
  且必须与入口约定中的发布选项一致；scope registry 不得重定向到其他 registry。
- 工作区无 tracked 修改和 untracked 文件；忽略的构建输出不做字节验证。
  检出 HEAD 等于 `GITHUB_SHA`，且属于本地
  `refs/remotes/origin/main` 的历史。workflow 必须完整获取历史与 main 引用，
  不在门禁中 fetch、切分支或修复工作区。
- 发布 workflow 的身份必须是当前仓库的 `publish-npm.yaml`。
  tag push 使用 `<完整 npm 包名>@<version>`，例如
  `@silvermoon-work/widget@0.1.0-rc.0`，tag 解引用后等于当前 SHA；
  手动 dispatch 必须 `--dry-run` 且 `PACKAGE_INPUT` 等于选中包的完整 npm 包名。
  发布 workflow 的 tag 过滤需覆盖 scope 中的 `/`，例如 `tags: ["**@*"]`。
- GitHub API 上该准确 SHA 最新的 `ci.yaml` main push run 必须成功，
  `Quality default`、兼容矩阵中每个 `Node.js <version>`、
  `Release verification (v1)` 和其中的
  `Confirm required checks succeeded` 步骤都必须唯一且成功。
  CI 矩阵从已检出 `ci.yaml` 的 `jobs.compatibility.strategy.matrix.node-version`
  读取，支持 2..8 个唯一的准确稳定 Node 版本；不重新解释 CI 全文或执行 YAML。
  缺失、分页不完整、进行中、失败、skipped 或验证期间启动 rerun 均拒绝。
- 需要 `GITHUB_TOKEN` 的 Actions 读取能力和 OIDC 环境变量；
  拒绝 `NPM_TOKEN` / `NODE_AUTH_TOKEN`。environment 审批和 Trusted Publisher
  的实际授权由 GitHub/npm 强制，不由环境变量存在性证明。
- npm registry 必须确认目标版本不存在；RC 历史对同一目标版本从 `rc.0`
  连续递增。依赖、optional 依赖、peer 依赖必须使用 SemVer registry 范围，
  且已有满足范围的 npm 版本；native pnpm 模式先解析上述受支持协议。
  不自动发布依赖，最多核验 64 个依赖声明。
- API 使用超时、响应体预算和一小时的新鲜度检查。网络/权限/解析失败不被当作
  “版本不存在”；不等待或重跑 CI。

## 信任与非职责

信任准确提交已经完成的 main CI 和受控标准工具链，而不是重新验证制品。
不构建、不测试、不打包、不修改 manifest、不生成版本/tag/changelog、不发布，
也不调用旧发布器。检查完成不构成之后可复用的发布通行证。
生命周期可以被 `--ignore-scripts` 跳过；tarball 发布不会执行此目录钩子。
因此它是规范流程的门禁，不是阻止任意发布权限持有者绕过的安全沙箱。

直接 `npm publish` 不会替代 pnpm 的 workspace/catalog 协议转换。
npm 模式仍明确拒绝这些协议；两种模式都拒绝 `file:`、`link:`、`portal:` 和
`npm:` alias。含 workspace/catalog 依赖的本仓库成员应使用上述 native pnpm 入口，
不能声称它们已经能够直接 npm 发布。

同仓开发工具包是允许的。首次用旧发布器发布本工具包；之后根包固定依赖已发布
版本，工具包自己的后续发版也由已发布版本检查。新候选不自动替换稳定门禁。

## 开发

```sh
pnpm --filter @silvermoon-work/devtool.publish-gate build
pnpm --filter @silvermoon-work/devtool.publish-gate typecheck
pnpm --filter @silvermoon-work/devtool.publish-gate test-coverage
pnpm --filter @silvermoon-work/devtool.publish-gate lint-package
```

测试使用隔离文件夹、受控 Git/npm 配置读取和模拟 GitHub/registry 响应，
不需要个人 token、真实 registry 或发布权限。共享覆盖率配置包含未测试源码，
并执行 branches/functions/lines/statements 四项 90% 门限。
