# @silvermoon-work/devtool.publish-gate

面向 Silvermoon 项目的轻量 npm 发布上下文门禁。作为开发依赖接入
`prepublishOnly`，成功退出 0，任何无法确认的条件退出非 0。真正的打包、上传、
OIDC 认证和 provenance 由标准 npm 完成。

当前候选版本为 `0.1.0-rc.0`；本仓库尚未切换到该门禁，首次发布仍使用原发布器。
Trusted Publisher 必须绑定 `.github/workflows/publish-npm.yaml` 和 `npm`
environment；配置 Trusted Publisher 不等于授权任意版本发布。

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
必须使用 npm 的目录发布和上述显式选项；首版不接受 `--force`，不支持 tarball
发布、任意发布器、批量 workspace 发布或通用策略配置。

```sh
publish-gate --help
publish-gate check --help
publish-gate --version
```

无参数只显示帮助，不访问网络。`check` 只接受 GitHub Actions 中由
`npm publish` 调用的 `prepublishOnly` 上下文；不能当作本机离线预检命令。
帮助、版本和成功摘要写 stdout；参数及门禁错误写 stderr，不输出 token。

## 首版固定约定

- 当前目录是被发布包的非重定向目录，Git 根是受信任的工作区；
  当前目录的 `deliverable.yaml` 显式声明 `type: npm`。
  不要求 pnpm workspace，根目录单包与成员包使用同一检查流程。
- 使用当前 manifest 的包名和规范 `x.y.z` / `x.y.z-rc.n`，禁止 private 包和
  placeholder 身份。`publishConfig` 只支持 `registry`、`access` 和可选 `tag`，
  且必须与发布选项一致；scope registry 不得重定向到其他 registry。
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
  且已有满足范围的 npm 版本，不自动发布依赖。最多核验 64 个依赖声明。
- API 使用超时、响应体预算和一小时的新鲜度检查。网络/权限/解析失败不被当作
  “版本不存在”；不等待或重跑 CI。

## 信任与非职责

信任准确提交已经完成的 main CI 和受控标准工具链，而不是重新验证制品。
不构建、不测试、不打包、不修改 manifest、不生成版本/tag/changelog、不发布，
也不调用旧发布器。检查完成不构成之后可复用的发布通行证。
生命周期可以被 `--ignore-scripts` 跳过；tarball 发布不会执行此目录钩子。
因此它是规范流程的门禁，不是阻止任意发布权限持有者绕过的安全沙箱。

直接 `npm publish` 不会替代当前发布流程中 pnpm 的 workspace 协议转换。
首版明确拒绝运行时/optional/peer 依赖中的 `workspace:`、`catalog:`、`file:`、
`link:`、`portal:` 和 `npm:` alias。含此类依赖的包（包括本工具包当前源码）
需要先解决标准交付转换，再迁移；
不要用这个工具声称现有 Builder 包已经能够直接 npm 发布。

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
