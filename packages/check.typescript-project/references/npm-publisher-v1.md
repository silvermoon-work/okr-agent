# 已支持的单包 npm publisher v1

这是一个窄而完整的正向支持 profile，不是对任意发布脚本的关键词评审。适用于根只有一个 TypeScript
ESM npm 交付包、GitHub
origin/main 明确的项目；workspace、多格式、JSX、自定义发布器等仍可报告无法确认。

## 配置入口

从此次 output 的 assets/ 读取以下实际资源，保护已有自定义实现，不自动覆盖：

- [npm-publish.mjs](../assets/npm-publish.mjs) →
  `.github/scripts/npm-publish.mjs`
- [npm-publish.yaml](../assets/npm-publish.yaml) →
  `.github/workflows/npm-publish.yaml`
- [npm-ci.yaml](../assets/npm-ci.yaml) → `.github/workflows/ci.yaml`

门卫完整源字节必须与实际 Bundle
resource 相同，仅允许换行归一化；Check 比较 SHA256，不导入/执行目标副本。workflow 比较完整 YAML 数据语义，不接受额外命令/动作或任意同名 helper。只有 CI 的 compatibility 矩阵字面值可按下面 JSON 声明改变，其他语义须与该版本资源相同。

根 `release.config.json` 是闭合纯数据：

```json
{
  "schemaVersion": 1,
  "package": {
    "id": "library",
    "name": "@acme/library",
    "directory": "."
  },
  "ci": {
    "nodeVersions": ["22.15.0", "24.11.0"]
  }
}
```

配置真实包名，不复制占位身份；stable/RC 版本仍由该包 manifest 唯一决定。根 devDependencies 明确声明公开 semver、publint 及质量工具，按统一 caret/catalog/importer 新鲜度和兼容性规则验证。没有目标
`.npmrc`、`.npmignore` 覆盖；`.release-artifacts/`
明确加入 gitignore。未知认证/文件选择覆盖不被假定安全。

## 有限 tsc 输出证明

`build` 是单个 `tsc -p <config>` 或
`tsc --project <config>`，不能用 CLI 覆盖或重复配置选择。构建配置在自身 compilerOptions 显式声明互不嵌套的包内 rootDir/outDir；生成 JavaScript、declaration、sourceMap 和 declarationMap，不启用 noEmit/emitDeclarationOnly/inlineSourceMap。

支持 `.ts`→`.js/.d.ts` 和
`.mts`→`.mjs/.d.mts`。全部源码纳入构建，测试及 rootDir 外文件不被编译；根 import/types 必须成对对应同一个实际源码的输出。files 同时交付各个 JS/声明/外部 map 以及 map 所需的真实源文件，而不只依赖 inlineSources。未知 declarationDir/rootDirs/outFile/mapRoot/sourceRoot/JSX 等关系不猜测。构建与构建后的 lint:package/publint 连接根 check。

这证明成功执行标准 tsc 时的输出关系，不声称源码已经编译通过；Check 不运行目标编译器或测试。

## 发布器实际保护

标准程序沿用仓库已有逐包 identity、manifest/artifact、SemVer 和 registry
fail-closed 的实现方式，并将有限 profile 的完整门卫保存在单一可审查资源中：

1. 闭合配置唯一选择根包；拒绝 private/占位身份、非 stable/rc、错包和 tag 版本不一致。stable 只选择 latest，RC 只选择 rc。
2. 真实 GitHub 发布环境中检查实际 HEAD 完整 SHA 对 main 可达。查询同仓库已有 ci.yaml 的 main/push/准确 SHA 最新 run，不回退旧成功；核对 completed/success、run
   attempt，完整必需 job/矩阵及版本化聚合 step，再读 run 确认 attempt 未变化。PR、其他 SHA/分支、缺项、失败/取消/跳过、分页不完整或查询失败均阻断，不在发布中重跑完整质量 CI。
3. 发布版本必须不存在；RC 历史对该包、该目标版本从 rc.0 连续，每次只增一。只有可信官方 JSON
   404 才当不存在，缺数据/网络错误不当成功。runtime/optional/peer 依赖的匹配发行版必须已经存在，不自动发布依赖。
4. 显式 build，选中根包只 pack 一次并禁用生命周期钩子。读取该 tarball 的准确 name/version/private，验证入口/map 及 map 的包内实际源文件，执行 publint。校验前后及发布前后核对同一 tarball
   SHA256，发布该准确文件并禁用发布钩子，不递归发布。
5. 已知 workflow 使用 npm@11.21.0；门卫再次要求 npm>=11.5.1、GitHub
   OIDC 能力，拒绝 npm 长效 token。job 明确 npm environment、contents/actions
   read 与 id-token:write。npm 网站上的 Trusted
   Publisher 登记和线上权限仍需独立验证。
6. workflow_dispatch 只接受明确 package
   ID，按真实 manifest 选 latest/rc，以同一 tarball 执行 --dry-run；不发布、不改 dist-tag/版本。只有显式 push 的准确 tag 才走发布分支。

远程发布器只在 GitHub Actions 主入口实际运行，其 canonical npm/GitHub
API 端点属于该明确远程发布职责；Check 在本机仅比较资源字节，绝不执行此程序。作者测试只导入作者资源的纯守卫函数并传入确定性数据，不执行 CLI 或发包。

## CI 与事实边界

默认质量 job 读取根 .node-version/packageManager；独立兼容矩阵含 engines.node 的真实最低版本及一个更高、当前受支持的官方 LTS。各条目须满足运行范围；本 profile 在各矩阵执行完整 check，工具的 Node 要求也须兼容这些条目。聚合同时依赖默认与完整矩阵，固定的失败传播代码不能变成空壳成功。

Check 证明这些门卫确实配置并连接，不声称当前版本未发布、RC 历史连续、线上 CI 成功或 npm 权限已登记。这些事实由实际发布时的 fail-closed 门卫重新获取。本机生产 Check 的包元数据来源始终为明确捕获的 Tencent 策略，无官方回退；不能证明镜像与上游完整同步时仍是 unconfirmed，不能用本 profile 或测试 provider 豁免。
