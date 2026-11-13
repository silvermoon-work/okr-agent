# 单包与 workspace npm publisher v1

这是一个有限的固定发布 profile，不是对任意发布脚本的关键词评审。适用于明确的 TypeScript
ESM npm 交付包及 GitHub
origin/main；支持根/唯一代码包和 monorepo 显式选中的一个成员。private:true 包跳过 npm 发布/交付专项检查，不要求配置此 profile；聚合根可为明确非私有成员提供发布入口。workflow 不得绕过 private 保护。多格式、JSX、自定义发布器及不能确认的配置仍准确报告证据不足。

## single-package

唯一 npm 目标直接由 manifest 和真实拓扑确定，不要求 release.config.json。没有已有映射时，唯一目标的规范 ID 为 manifest.name 去掉 scope 后的名称；必须符合小写字母/数字/连字符格式，否则需最小显式 ID/tag 映射，不猜测改写。只有 catalog 或 workspace 声明不改变根包发布职责。唯一代码包位于声明成员时使用其真实目录，不用聚合根身份/版本冒充。使用下列同一套入口/核心，不要求额外 workspace
adapter。根包 build 在根执行，成员 build 通过明确包名选择，pack 始终限定映射目录。

## workspace

存在多个 npm 目标时复用已有 `scripts/lib/release-packages.mjs` 静态
`export const releasePackages = [{ id, name, directory }, ...]` 映射。旧
`scripts/release-packages.js`
可读取，通用 scripts 规则仍独立报告旧结构；两个位置同时存在则拒绝歧义。映射不重复版本或矩阵，固定发布器核对 name/directory 与真实成员一致。每次由准确
`<id>-v<manifest.version>` tag 或已有 workflow_dispatch 的 package
input（PACKAGE_INPUT）显式选择唯一目标，不能省略、猜测或选择 all。根提供无参数 release/release-dry-run；构建使用 pnpm
--filter "<准确包名>..." run
build，可涵盖依赖，只对选中目录 pack/校验/publish 一次。其他成员不会因依赖关系自动发布。无需另一份 adapter 或复制保护核心；问题 brief 按实际职责链接本节及准确资产。

## 配置入口

从此次 output 的 assets/ 读取以下实际资源，保护已有自定义实现，不自动覆盖：

- [npm-publish.mjs](../assets/npm-publish.mjs) → `scripts/lib/npm-publish.mjs`
- [release.mjs](../assets/release.mjs) → `scripts/release.mjs`
- [release-dry-run.mjs](../assets/release-dry-run.mjs) →
  `scripts/release-dry-run.mjs`
- [npm-publish.yaml](../assets/npm-publish.yaml) →
  `.github/workflows/npm-publish.yaml`
- [npm-ci.yaml](../assets/npm-ci.yaml) → `.github/workflows/ci.yaml`

门卫完整源字节必须与实际 Bundle
resource 相同，仅允许换行归一化；两个入口与 lib 都校验，不能自由替换保障行为的模块。Check 不导入/执行目标副本。workflow 比较完整 YAML 数据语义，只在受保护 tag
push 调用 pnpm release，手动 dispatch 调用 pnpm
release-dry-run，不接受内部 Node 调用、裸 publish 或额外发布命令。只有 CI 的 compatibility 矩阵字面值可在验证其 2..8 个唯一精确稳定版本及统一消费者最低值前置后改变，其他语义须与该版本资源相同。矩阵直接读取实际
`.github/workflows/ci.yaml`，不维护复制列表。所有 package
script 名称禁止冒号，命令严格为 node scripts/<同名>.mjs 且无参数。

不新增独立发布描述。旧 release.config.json 仅作兼容读取，其矩阵必须与实际 workflow 完全一致，且不能和已有映射重复；推荐删除重复信息并复用已有映射。stable/RC 版本始终由选中包 manifest 唯一决定。根 devDependencies 明确声明公开 semver、publint 以及固定核心所用的 yaml/acorn 数据解析库；规定开发工具引用根 pnpm-workspace.yaml 默认/named
catalog，并按准确 importer、新鲜度和兼容性规则验证，非规定工具不扩展版本政策。没有目标
`.npmrc`、`.npmignore` 覆盖；`.release-artifacts/`
明确加入 gitignore。未知认证/文件选择覆盖不被假定安全。

## 有限构建配置关系

`build` 和 `lint-package` 按通用 scripts 规则对应 `node scripts/build.mjs` 与
`node scripts/lint-package.mjs`。入口实现不解释，也不假定使用 tsc。存在 tsconfig.build.json 时独立检查其配置：在自身 compilerOptions 显式声明互不嵌套的包内 rootDir/outDir；配置 JavaScript、declaration、sourceMap 和 declarationMap，不启用 noEmit/emitDeclarationOnly/inlineSourceMap。

支持 `.ts`→`.js/.d.ts` 和 `.mts`→`.mjs/.d.mts`
的配置预期关系。全部源码纳入配置，测试及 rootDir 外文件不被纳入；根 import/types 必须成对对应同一个实际源码的预期输出。files 同时选择各个 JS/声明/外部 map 以及 map 所需的真实源文件，而不只依赖 inlineSources。未知 declarationDir/rootDirs/outFile/mapRoot/sourceRoot/JSX 等配置关系不猜测。lint-package/publint 和 check 使用固定标准及既有项目配置，不要求重复 scripts.config.json，build 内部仍可自定义。

这些检查只证明所声明静态配置的预期关系，不证明入口实际使用该配置或源码已经编译通过；自定义构建内部实现不因未知而报错。Check 不运行目标编译器或测试。

## 发布器实际保护

标准程序沿用仓库已有逐包 identity、manifest/artifact、SemVer 和 registry
fail-closed 的实现方式，并将有限 profile 的完整门卫保存在单一可审查资源中：

1. 从实际 manifest/workspace、已有映射和事件唯一选择真实根包或一个声明成员；必要事实歧义即阻断。拒绝 private/占位身份、非 stable/rc、错包和 tag 版本不一致。stable 只选择 latest，RC 只选择 rc。
2. release tag 触发固定发布 CI，明确解引用 tag 的完整 commit
   SHA 并核对实际 HEAD，对 main 可达。查询同仓库已有固定 ci.yaml 的 main/push/相同完整 SHA 最新 run，不回退旧成功；核对 completed/success、run
   attempt，完整必需 job/矩阵及版本化聚合 step，再读 run 确认 attempt 未变化。没结果、运行中、PR、其他 workflow/SHA/分支、缺项、失败/取消/跳过、分页不完整或查询失败均直接阻断，不补跑 check、不派发补跑质量 CI。发布复用其成绩，不重复 pnpm
   check，所有发布特有保护仍执行。
3. 发布版本必须不存在；RC 历史对该包、该目标版本从 rc.0 连续，每次只增一。只有可信官方 JSON
   404 才当不存在，缺数据/网络错误不当成功。runtime/optional/peer 依赖的匹配发行版必须已经存在，不自动发布依赖。
4. 显式 build，选中包只 pack 一次并禁用生命周期钩子。读取该 tarball 的准确 name/version/private，验证入口/map 及 map 的包内实际源文件，执行 publint。校验前后及发布前后核对同一 tarball
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

main 更新执行固定质量 CI 的 pnpm
check，保留 PR 质量入口，全部必需 job/矩阵/聚合成功才合格。质量与发布结构固定，仅 quality
compatibility.strategy.matrix.node-version 可作有限版本参数扩展。先比较完整 workflow 结构，列明观察路径/值与期望；实际矩阵使用其他 job
ID 时是标准结构不符，不是项目没有矩阵。前置结构不符不追加派生矩阵/发布绑定问题，独立确凿缺陷继续报告。兼容性是质量 CI 的组成部分，不再另立发布前整套检查。

默认质量 job 读取根 .node-version/packageManager。先检查所有适用代码包（包括 private）的 engines.node 最低 SemVer 一致；缺失/非法或不同最低值先报环境问题，短路依赖的矩阵差异，但默认 CI 和发布保护仍独立检查。required 兼容矩阵含统一消费者最低值及一个更高、当前受支持且满足所有适用范围的官方 LTS。更低或范围外的额外条目标为 unsupported，不单独因此报 ci-mismatch 或声称所有包承诺该版本。现有 profile 的矩阵仍对全部条目执行完整开发 check：消费者最低 Node 不必支持所有现代开发工具；若工具不能运行在这些条目上，准确报告该 profile 尚不能独立证明运行兼容的 unconfirmed，不要求缩窄包 engines。完全分离消费者运行探测与开发检查仍是本 profile 的明确待扩展边界，需要先确认项目约定/脚本，不擅自加入新标准动作。聚合同时依赖默认与完整矩阵，固定的失败传播代码不能变成空壳成功。

Check 只按完整资源和声明式工作流证据确认上述已知门卫的配置与外部连接，不以通用 scripts 接口结构证明自定义入口内部执行或发布安全，也不声称当前版本未发布、RC 历史连续、线上 CI 成功或 npm 权限已登记。这些事实由实际发布时的 fail-closed 门卫重新获取。本机生产 Check 使用检查参考声明的官方来源，接受其缓存延迟并保留时间与完整性校验；不能用本 profile 或确定性测试 provider 替代真实查询。测试仅使用本地确定性数据/纯守卫，不运行远程发布或网络发布实测。
