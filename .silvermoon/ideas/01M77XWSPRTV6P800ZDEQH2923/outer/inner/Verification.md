# 统一 TypeScript Project Check 实施证据

## 暂停检查点（2026-11-13）

关机前已格式化本轮源码并尝试 pnpm check：格式、release lint 与 11 项 release
tests 通过；完整命令在 TypeScript Check
lint 失败（convention.ts 两处多余 optional
chain，metadata 相关测试若干 RequestInfo 字符串转换类型规则）。后续任务因 Turbo 失败中断，最新测试/真实 CAR 尚不能据此宣称通过。本次保留全部源文件与回归用例供续修，不为了检查点改规则或跳过门禁。

用户要求结束今天工作、全部同步 origin/main 后关机。本次提交仅保存未完成候选，不提交或批准实现/部署门限，不标记 completed。

父代理第二轮复核发现生产元数据路径被固定为 authoritative=false，会令所有生产新鲜度判断无法通过，已要求改为完整版本时间线及选定版本 manifest 的有界 npmx 查询。subagent 在该轮因工具发布错误失败，留下尚未完整复核的 metadata.ts、测试和调用点变更。下文 Tencent 来源与最后 CAR/CID 是上一轮的历史验证，不代表这些最新源码已构建或通过。

继续时须先验证最新元数据实现的来源、分页完整性、版本/peer 信息和缓存新鲜度，再完整运行测试、构建真实生产 CAR 及独立消费。未通过时继续返工，不能用确定性 fixture
CAR 证明生产元数据可用。固定文档及 SDK assets 输出的已完成代码一并保留。

## 契约与资源

- 仅一个公开 Check
  `@silvermoon-work/check.typescript-project`，作者包 private；单包/workspace/npm 是内部分支，无新 Task/组合协议。
- 闭合输入只有绝对 projectDirectory，旧 context/requirements/projectScopes/空对象由真实 Engine 拒绝；没有来源、时钟、provider 或跳过输入。
- 根固定 AGENTS.md 唯一来源为 Bundle
  `resources/assets/AGENTS.md`，只归一化换行、完整比较，不 trim。README/CONTRIBUTING/docs/agent-project.md 只检查规定的可读非空/路径，不评审自由正文。现有自定义内容先保护到自由扩展。
- 已审查 npm publisher 源码与两份 workflow 也来自实际 Bundle
  assets；Check 只读并比较目标字节/完整 YAML 数据，不执行目标脚本。未借 import.meta.url 读取作者文件。
- `{assets:true}`
  在正常 pass/nonpass 输出链接真实标准资产，链接故障保持执行异常；从 output.cid 实际解析 references/problems/document-mismatch.md 的 ../../assets/AGENTS.md，及全部四项资产字节。

## 六类支持矩阵

| 领域          | 已验证的静态证据                                                                                                                                                                                                                               | 不声称的能力                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 环境          | 根 .node-version 精确推荐版本、官方 LTS/支持周期；成员 engines 与默认版本兼容、重复声明冲突；精确 pnpm 同 major 规则                                                                                                                           | 不探测/安装宿主工具；事实缺失/陈旧/未获授权不通过                                                                |
| 开发依赖      | devDependencies/共享根/catalog/named catalog、目标 importer specifier/实际版本、SemVer 系列新鲜度、已解析工具 Node/peer 兼容；其他 snapshot 不能替代 importer                                                                                  | Tencent 镜像 HTTP 新鲜不等于上游完整同步；新鲜度/完整性无可信证明仍 unconfirmed，不外发未知私有工具名称          |
| 规范与交付    | strict/五项 safety、源码与测试类型感知 lint、只读格式、Vitest 单次/未触达文件/四项>=90；有限 tsc rootDir/outDir→实际源码成对 .js/.d.ts/maps 及真实源交付，files、publint、门禁顺序                                                             | 不运行目标编译/测试，不声称实际代码成绩；复杂构建器/JSX/CJS/subpath/映射覆盖仍 unconfirmed                       |
| Agent scripts | 根七项稳定动作和全部适用成员；format 与 format:check 分离；适用 build/lint:package；失败传播、未知终端或修改动作不作为安全 check                                                                                                               | 不解释任意目标 node 脚本、hooks 或过滤调度；聚合根不强制虚构源码/build；private:false/main 单独不被断言为 npm 库 |
| 工作流与发布  | GitHub/main 事实与 PR/push 同 job 的 checkout/根声明/冻结安装/check；新增完整正向单包 publisher v1、默认/最低与更高 LTS 矩阵、版本化聚合、准确 SHA/main-push CI 复用、OIDC/client/连续 RC/单次 pack/同 tarball/dispatch dry-run 的实际标准门卫 | 未识别的发布器与复杂 workflow 仍不放行；配置证明不等于线上 CI/RC/权限/名称所有权已成立，不真实发布               |
| 结构与文档    | 全部声明成员、未知嵌套 manifest/AGENTS、完整固定文档、自由扩展可读非空、gitignore 秘密/依赖/输出及必要文件保护                                                                                                                                 | 不向根外跟踪 gitdir，不评审自由文档，不猜测复杂 ignore                                                           |

## 已支持的 npm 正向路径

详细消费契约见
[npm-publisher-v1.md](../../../../../packages/check.typescript-project/references/npm-publisher-v1.md)。

- 一份闭合 release.config.json 唯一映射根包；支持单个 tsc
  -p/--project、包内独立 rootDir/outDir、.ts/.mts 的 JS/声明/外部 map、map 所需实际源文件交付，拒绝只发 dist 而丢失 declarationMap 所需源。
- `.github/scripts/npm-publish.mjs` 完整源 SHA256 与该次 Bundle
  asset 相同；两份 workflow 的完整 YAML 语义匹配受检标准，仅兼容矩阵精确 Node 字面值可按配置变化。不信任任意同名 helper 或关键词。
- 标准程序沿用仓库原 release helper 的身份、manifest/artifact、SemVer、registry
  fail-closed 方式，并补齐连续 RC/完整历史、精确提交 CI 双读/attempt/完整 job+矩阵聚合、显式 OIDC
  client 和同 tarball 指纹保护。其真实实现可由父代理直接审查，而不是依赖未知外部发布器包名。
- 作者纯守卫测试覆盖错包/private/tag/RC 后缀、RC
  .0/递增/缺历史/已存在/不连续、PR/其他 SHA/分支/失败/跳过/缺矩阵/空聚合；目标副本从未导入或运行。
- 正向配置与源码/入口/映射源交付、OIDC
  client 版本、门卫源字节、CI 空壳/矩阵最低版本等 mutation 证明：一个 npm 包能够完整通过，不再是所有 npm 包无条件 unconfirmed。
- 标准发布器只在真实 GitHub Actions 主入口运行；其中 canonical npm/GitHub
  API 端点属于该明确远程发布职责。当前设备只检查资源字节，作者测试只调用确定性纯函数，未执行该 CLI、真实发布或 canonical 研究请求。

## 当前元数据策略

作者代码捕获当前设备已授权的
`https://mirrors.cloud.tencent.com/npm/<encoded-public-tool-name>`，install-v1
Accept，无 canonical/npm 其他源回退、无任意环境或业务 URL。Node 事实仍只读
`https://nodejs.org/dist/index.json` 与
`https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`。

每请求最多 10 秒/16MiB、不重定向；每次执行最多 64 个公开包、只执行内缓存、Date/Age/observedAt 不超过一小时。镜像响应标记 authoritative=false：HTTP 时间/版本字段完整仍不能证明同步完整性，不据镜像缺项判最新，无法确认就是 unconfirmed。无源码/秘密外发、安装/升级或陈旧成功回退。内部测试 provider 显式声明假定事实，仅验证行为，不是线上发行证据。

## 历史失败与恢复（保留，不作为当前证明）

上一轮 canonical
npm 直接读取不符合当前设备来源限制，父代理据此退回；已改为上述 Tencent 策略，不再重复该读取。原始失败报告保存于
`packages/check.typescript-project/dist/verification/engine-production-report-historical-direct.json`，未将其观测当成当前可信最新依据。

- 历史生产 CID
  `bafybeid3rxpdu3gcobbwglbakorn77abmixnjfcy4slci3odis4vafo6em`，458683
  bytes；历史确定性 CID
  `bafybeieudqyy7jf6dbauapkssbbemfpviqosyr6ezjnyqa7hxd4coheumi`，459355 bytes。
- 历史 canonical 观察 pnpm 11.28.11（2026-11-12T16:00:59Z）；Node 官方 CDN
  Age 超过一小时、TypeScript
  10s 超时明确 unconfirmed。更早发现完整响应超出原 8MiB，核实约 8.78MB 后限额改为有限 16MiB。这些只是历史来源/失败事实，绝不复用成当前通过。
- 上一轮 66 tests、24/24 Turbo tasks 通过；pnpm
  check 当时因父代理 SDK 测试格式失败。父代理随后格式化并确认完整 pnpm check
  24/24 通过，但本轮修改仍须重新验证。
- `pnpm exec turbo`
  曾注入相对/空 PATH 而触发既有工具链保护；改用相同本地 Turbo 直接入口消除测试环境差异，无修改全局 PATH 或工具链源码。准确确认的中断 staging/fixture 及
  `.check-task-builder-cd0ec1cc-b738-43f5-a97a-28b286f75c8f.car`
  已清理，不清理未知数据。
- 本机 nrm 不可发现，但有效 pnpm
  registry 为 Tencent；之前必要 semver/@types/semver 恢复使用该源，无官方安装回退。本轮无新增依赖安装。

## 本轮复验

- 2026-11-13 00:43（UTC+8）：定向 `lint`、`typecheck`、`test`
  均通过；9 个文件、79 tests。根 `pnpm check` 返回 0，包含格式、release lint/11
  tests、24/24 Turbo lint/typecheck/test/build。
- 生产 CAR：`packages/check.typescript-project/dist/typescript-project.car`，492793
  bytes，CID `bafybeidewl6omaocyaokahqmywbawtdbnrrmgtrm7iqr2wzwgojcfbydti`。
- 确定性 CAR：`packages/check.typescript-project/dist/verification/bundle.car`，493562
  bytes，CID
  `bafybeieazrdq7qh6dlqrwlpiiyivw42dabini6xamfhbr23xshuahfasxa`。`TYPESCRIPT_CHECK_PERSIST_EVIDENCE=1`
  下运行
  `pnpm --filter @silvermoon-work/check.typescript-project exec vitest run --root . --config ..\..\vitest.config.ts test\car.test.ts`，持久化普通 good/bad 与完整 npm 正向 fixture、engine-fixture-report.json。真实 Engine 结果为 pass=true/false/true，四类旧输入 rejected、缺目录 fault=failed、cancel=true、reclaimed=true；AGENTS、publisher 程序及两份 workflow 资产字节均精确读取。
- 00:44（UTC+8）执行
  `node packages\check.typescript-project\scripts\smoke.mjs packages\check.typescript-project\dist\typescript-project.car packages\check.typescript-project\dist\verification\good packages\check.typescript-project\dist\verification\bad packages\check.typescript-project\dist\verification\npm`，当前生产报告为同目录 engine-production-report.json。真实路径只请求 Tencent 包元数据：pnpm（16:44:06Z）、typescript（16:44:08Z）均明确 authoritative=false/无法确认完整同步/无官方回退；Node 官方 CDN 仍陈旧，环境与矩阵事实 unconfirmed。
- 生产 CAR 对完整 npm fixture 没有 `delivery-*` 或 `release-*`
  问题，证明新生产 Bundle 实际识别了完整有限交付及真实标准门卫，并非以确定性 CAR 替代生产检查。生产总结果仍诚实 nonpass，因为上述真实元数据无法确认；没有将 fixture 假定事实改写成生产合规或发布证明。
- 所有普通输出 references 可读、四项标准资产一致；实际 production
  Engine 的四类旧输入拒绝、I/O fault、取消与回收正常。未 patch
  Engine 或使用内部导入，仍使用 readTaskBundleCar +
  IpfsStore.fromClient 的公共 API。
- 最终再次 `pnpm check`：24/24
  tasks 成功；`silvermoon check --worktree --audience agent --language zh-CN`
  通过；`git diff --check`
  无空白错误。ledger 勾选仅记录 Agent 工作，不代表生命周期验收。

未 stage/commit/push、未写生命周期事件或验收决定、未 npm 发布/远程 upload/pin；D-* 保持未完成。
