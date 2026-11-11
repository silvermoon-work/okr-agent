# 实施验证证据与阻塞

## 父级最终实施复核

父级独立复验最终 CAR
`bafybeiahk52evmukio5wr7nkomvab4ujmk3yxzss4pxbaqlz57rmmc2yxe`：默认 14 场景与官方 portable
nvm
4 场景全部通过，问题码、中文输出文档字节、配置不变及物理回收符合预期。复核并返工修正了无工作区 YAML 项目的 pnpm 启动配置漏检，新增回归包含实际 local-prefix 的配置来源。

父级最终 `pnpm check` 通过：52 项本包测试、20/20 Turbo
tasks 及发布守卫检查通过。首次并行运行格式化检查与 smoke 时，格式化扫描到了尚在执行的临时夹具而失败；待夹具清理后串行重跑通过，不将那次失败误称为通过，也不修改夹具去迎合格式化。

当前证据允许提交准确实施 revision 供委托门限验收，但不代表 Deployment 已完成；独立 CAR-only 消费、可复用交付说明及外部可用性边界仍由父级在部署阶段验证。支持范围仅限已经真实验证的 Windows 组合，Unix 未被宣称支持。

当前候选已通过 `silvermoon check --worktree --audience agent --language zh-CN`。

## 当前：官方 portable nvm-windows 1.2.2 实证（2026-11-12）

父级授权仅为作者验证准备隔离的官方 portable 工具；不是 Check 的安装行为，不涉及全局安装/替换、共享 settings、当前系统链接或 PATH 修改。固定 tag
1.2.2 已成功，无需尝试旧版本或运行任何 setup/install/use。

### 官方来源与摘要

- 官方仓库：`https://github.com/nvm-windows/nvm`；固定 release：
  `https://github.com/nvm-windows/nvm/releases/tag/1.2.2`。
- 通过 `gh release view 1.2.2 --repo nvm-windows/nvm` 核对资产，仅下载
  `nvm-noinstall.zip` 与 `nvm-noinstall.zip.checksum.txt`。
- 官方 checksum 文件给出 **MD5**：
  `d654c26a04e35a318d5939f8ceb09934`；下载包实测 MD5 完全一致。
- 下载包实测 **SHA-256**：
  `74232ea51c060ecd44ecf2cebee314ed9e3f6da56e1f9484d8d46c4e8bb6ae0e`。
- 解包后的 nvm.exe 实测 **SHA-256**：
  `665b0b033e88098367381e929b71cfc96dc4058a3cb6fef760a0ccc9a883dd13`。它与原共享挂起二进制的摘要不同；实际版本命令输出
  `1.2.2`。
- 经过核验的下载缓存保留于忽略目录
  `packages\check.nodejs-toolchain\dist\nvm-validation-954fb765-4cc8-4543-a142-9eda922a63d2`，包含上述两个原始资产与
  `1.2.2` 解包目录。未登记为发布制品或远程上传。

### 真实受管环境与 CAR 结果

新增 `scripts/nvm-smoke.mjs`，只使用标准 CAR 与未修改的已发布 Engine/Builder
0.2.0-rc.0 公共接口，不调用 Check 源码或替代检测器。执行前再次核验 checksum、archive
SHA-256、nvm.exe
SHA-256。将既有授权宿主的原样 Node/npm 复制到自有 NVM_HOME/v26.13.0，创建同树独立 settings.txt 与私有 current
junction。这验证当前管理关系，不声称 nvm 完成过历史安装。

Node v26.13.0 的原文件及副本 SHA-256：
`14319838b3f355e0398c13569a90270bce4fc68f25189f58c59b03dadae0e6d5`。真实 npm
11.20.0 的 npm-cli.js 原文件及各副本 SHA-256：
`3ce7cba6f5128dd5f54c98b6a5036b0f850496878cc2e21044b675fe3c594e3e`。没有编辑工具代码、生成伪版本输出或运行安装器。

| 真实 CAR 场景                    | 实际结果                                                          |
| -------------------------------- | ----------------------------------------------------------------- |
| portable-nvm-managed-and-paired  | pass；Node/npm 同时受官方 nvm 管理且配对                          |
| portable-nvm-unmanaged-tools     | fail；两个 management-mismatch，两个工具自身可用且彼此配对        |
| portable-nvm-unmanaged-npm       | fail；pairing-mismatch 与 npm 的 management-mismatch，Node 仍受管 |
| portable-nvm-version-observation | fail；version-too-low 的实际 brief 精确包含 nvm 当前 1.2.2        |

真实 nvm 的 root/list 与工具实际路径由同一 CAR 内的检测器核验；不是仅安装了 nvm 或仅比较版本。负向工具仍为未经修改的真实 Node/npm 副本，不是模拟命令。四个 Run 均 completed、Worker 非强杀且 reclaimed；通过输出 CID 逐字节读取对应中文文档。独立 settings、用户/项目配置、私有 current 链接及源工具文件前后未变；整个自有运行环境（含 junction 与全部 Node/npm 副本）已物理删除。原共享 nvm 二进制及其故障未被修复或替换。

可直接复验（在仓库根执行；重新准备缓存的完整命令见作者 README）：

```powershell
node packages\check.nodejs-toolchain\scripts\nvm-smoke.mjs packages\check.nodejs-toolchain\dist\nodejs-toolchain.car packages\check.nodejs-toolchain\dist\nvm-validation-954fb765-4cc8-4543-a142-9eda922a63d2\1.2.2
```

当前 Windows x64 实证矩阵为 Node 26.13.0、npm 11.20.0、pnpm 10.22.0/11.22.0、nrm
1.2.6、nvm-windows
1.2.2；Unix 仍无实际证据，不声明支持。原默认 smoke 的 13 场景与本节 4 场景共同覆盖业务、输出文档、取消/超时、实际进程清理、真实管理正向与反向。最终当前 CAR/CID 和总检查结果见末节。部署独立消费仍由父级负责，所有 D-* 保持未完成；本次不记录门限事件或同步 Git。

## 此前候选：显式上下文已在真实 CAR 中解决原阻塞

按父级接受的理想契约
`cce883d4cd29bd1b8d2e5fd2363590ee6777c94a`，实现了必填闭合 executionEnvironment。未修改上游 Engine/SDK/Builder、node_modules、Worker 或系统环境；没有靠宿主直接检查代替 CAR 结果。

### 当前实现与可复现验证

- `src/execution-context.ts`：命名字段到子进程环境的唯一映射，路径/平台/凭据 URL/未知字段校验，宿主按已知键捕获并拒绝冲突大小写别名。工具定位、npm-prefix、版本、配对、nvm 与 registry 共用同一环境。
- `test/inspect.test.ts` 和
  `test/execution-context.test.ts`：数字段比较、输入冲突、逐工具管理与显式配对独立、路径边界、未知 nrm 只读安全拒绝、真实 npm-prefix 覆盖、registry 插值、超时/取消/清理故障及实际子 PID 消失。
- `test/car.test.ts`：独立构建标准 CAR，通过公开 readTaskBundleCar 校验完整 DAG 后连接**未修改的已发布 Engine
  0.2.0-rc.0**。
- `scripts/smoke.mjs`：真实 Engine 中 Node-only
  pass；Node/npm 低版本和 registry 不符的三问题 fail；真实 Node/npm 配对；npm/pnpm 项目、用户、显式上下文覆盖；真实 nrm 的命中、缺失、URL 不符与额外项；中文参考文档逐字节与输出 CID 对照；目录错误、插值错误、取消、Task 超时及命令超时无业务输出。隔离配置文件字节不变，自有 fixture 子 PID 均已物理回收。

命令：

```powershell
pnpm --filter @silvermoon-work/check.nodejs-toolchain typecheck
pnpm --filter @silvermoon-work/check.nodejs-toolchain test
pnpm --filter @silvermoon-work/check.nodejs-toolchain lint
pnpm --filter @silvermoon-work/check.nodejs-toolchain build
node packages\check.nodejs-toolchain\scripts\smoke.mjs packages\check.nodejs-toolchain\dist\nodejs-toolchain.car .
```

50/50 定向测试通过，默认 smoke 的 13 个真实 Engine 场景通过。fixture 仅用于确定性故障/生命周期与未满足逻辑，不作为真实 nvm 支持证据。实际工具为 Windows
Node 26.13.0、npm 11.20.0、pnpm 10.22.0/11.22.0、隔离安装的作者测试 nrm
1.2.6；没有全局安装、切换或注册修改。

### 两个实际工具行为带来的必要适配

1. pnpm
   11 在嵌套项目没有独立 pnpm-workspace.yaml 时读取外层工作区；且 npm_config_registry 与项目 registry 的优先级和 pnpm
   10 不同。smoke 通过同一 CAR 的版本问题 brief 确认当前 pnpm 主版本，然后分别验证其原生覆盖结果，不把 npm 结论套给 pnpm。pnpm
   11 会不报错地忽略 YAML
   registry 中的环境插值；复用 catalog 的 yaml 只读检查实际工作区和全局 YAML 的默认 registry，插值必须故障，不能允许的 fallback 恰好匹配就通过。实际 pnpm
   11 在配置命令启动时也可能加载 pnpmfile、安装 configDependencies、根据 packageManager 自动下载/切换。使用固定执行控制禁止 hooks/编译缓存/版本下载，并在首次调用前拒绝配置依赖；不改变业务输入选择的 registry。CAR 夹具包含会抛错的 cjs/mjs
   pnpmfile、 `packageManager: pnpm@0.0.0`
   与单独 configDependencies 故障目录；前两者不执行/不下载，后者在启动前明确失败且目录未出现安装产物。
2. 真实 nrm
   2.1.0 的入口在解析 --version/ls 前调用 cleanInvalidNpmConfig，无条件重写用户 .npmrc。未对共享配置运行它；以启动前入口/package 身份检查拒绝该版本和未知实现。nrm
   1.2.6 的实际 --version/ls 在自有 HOME/.nrmrc 上验证只读；仅增加本包 devDependency 与 catalog，不成为目标机安装行为或发布依赖。

### 历史宿主问题：原 nvm-windows 启动挂起（未修复）

`C:\Users\Wei\AppData\Roaming\nvm\nvm.exe`（8,479,128 字节）的 SHA-256：
`09C0B24AE56D26CC2AA8C1D583E5C1E58E11C425B0E899EC3124C5551E8F4373`。尚无法从它获得版本，不能猜测其实现版本或管理状态。

已执行的安全、有界尝试均无 stdout/stderr：

- 原生 version，以及闭合 NVM_HOME/NVM_SYMLINK/PATH 下的 --version，5 秒超时；
- 将相同真实二进制复制到自有目录，以独立 settings.txt/home 执行 version，20 秒超时，随后清理自有目录；
- 原生 version 单次放宽至 90 秒，仍超时；诊断进程已终止；
- 固定 cmd /d /s /c 版本查询，5 秒后按实际 PID 回收整个自有进程树；
- 当前真实 CAR 加 `--nvm`：`real-nvm-managed` 预期 completed/pass，实际 Run
  `failed`，错误
  `run_failed: Tool command timed out.`，无 Check 输出、Worker 未强杀且 reclaimedAt 存在。共享 nvm
  settings.txt 前后 SHA-256 相同。

```powershell
node packages\check.nodejs-toolchain\scripts\smoke.mjs packages\check.nodejs-toolchain\dist\nodejs-toolchain.car . --nvm
```

此问题在 Engine 外也独立复现，已不是 sanitized
Worker/PATH 根因；内部启动挂起原因尚未查明，不以推测代替事实。当时尚未获准下载验证前置，故 I-S03/I-AC01 未完成。父级随后明确授权隔离的官方 portable 前置；本文件当前章节已记录成功实证，不再以这个共享宿主问题阻塞实施候选，也不声称共享安装已修复。Unix 仍不声明支持。

### 当前交付与后续消费

标准 CAR 持久路径仍为
`packages\check.nodejs-toolchain\dist\nodejs-toolchain.car`。最终根 CID 与仓库总检查结果在本文件末节记录。独立 CAR-only 消费步骤见作者 README：另一个不链接本仓库的目录只放 CAR，使用已发布 Engine/Builder 的公开接口，由执行宿主选择上下文，验证 pass/fail 和输出文档；不需要作者 npm 包或源码。本次没有远程 IPFS 上传/pin，所有 D-* 保持未完成。

## 历史：2026-11-11 上游 Worker 环境阻塞（已解决）

上游 `@silvermoon-work/task-engine@0.2.0-rc.0` 的 `dist/type-supervisor.js`
Worker 构造处（约第 102–113 行）显式设置 env，仅包含空 NODE_OPTIONS 与 Windows 的 SystemRoot/WINDIR。它不继承 PATH、HOME/USERPROFILE、NVM_DIR、npm
registry 环境覆盖等；当前公开 EngineOptions 无 Worker 环境注入选项。

真实步骤：

1. `pnpm --filter @silvermoon-work/check-task-builder test`：实施前既有 Builder/SDK 集成测试 12/12 通过，确认现有作者管线。
2. `pnpm --filter @silvermoon-work/check.nodejs-toolchain typecheck`：通过。
3. `pnpm --filter @silvermoon-work/check.nodejs-toolchain test`：32/32 通过（包括真实 Node、隔离真实 npm 项目/环境 registry 覆盖、实际子进程树取消/超时/清理故障）。
4. `pnpm --filter @silvermoon-work/check.nodejs-toolchain build`：标准 CAR 构建成功。
5. `node packages\check.nodejs-toolchain\scripts\smoke.mjs packages\check.nodejs-toolchain\dist\nodejs-toolchain.car .`：CAR 完整验证与真实 Engine 加载成功，但第一个 Node-only 预期通过场景实际
   `pass: false`，问题为
   `tool-missing`。该结果来自真实 Worker，无伪造结果；smoke 断言失败。

同机检测器在常规进程下 Node-only 通过；不能以它冒充 Engine 证据。不能扫描宿主系统或回退 process.execPath/控制机配置来绕过 R-03，也不能将输入扩展为任意执行环境变量来改变已接受的理想要求。因此 I-AC02 未完成，I-S03/I-AC03 的完整验收亦未完成；请父级协调上游提供明确、获授权的执行环境契约，或决定是否需要重新讨论要求。本次未更改上游源码或 node_modules，未修改 Ideal
World。

## 历史候选与父级复核

父级门限复核：重新执行定向测试，32/32 通过；重新执行同一真实 Engine CAR
smoke，Node-only 场景再次返回 `tool-missing`
并触发断言失败。核对当前安装的 Engine `type-supervisor.js`
Worker 构造代码，确实仅传入空 NODE_OPTIONS 以及 Windows 的 SystemRoot/WINDIR，未传入检查所需的执行环境。未批准实现门限，不记录 submitInner/acceptInner，不将本候选宣称为可用交付。应先明确并实现上游受授权的执行环境传递机制，再重跑 CAR 验收；不得用放宽断言或改用宿主直接检测代替。

`packages/check.nodejs-toolchain` 为唯一新增私有作者项目，入口使用现有 Check
Task
SDK，标准 Builder 一次输出 Bundle/CAR。未新增共享框架、发布映射、工作流或 npm 发布配置。问题只使用 code/brief/documentation，不内嵌 CID。

输入 schema 与跨字段验证覆盖非法/未知字段、空约束、引用、重复/冲突映射、无效路径和 URL。配对检查与 nvm 管理分别核验 npm
CLI 及 Node 运行时。Windows npm 仅识别特定标准 modern
npm.cmd；其他入口不可确认而非通过。Unix nvm 通过固定无 profile
shell 脚本查询 nvm.sh，不把 shell 函数当可执行文件。

当时的支持证据（不代表上述新候选）：

| 内容                                            | 实际证据                                                   | 不得推断                           |
| ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| 数字段版本、输入、配对、管理、registry/nrm 分类 | Host fixtures                                              | 真实 nvm/pnpm/nrm 已支持           |
| Node 定位和版本                                 | 本机 Windows Node v26.13.0                                 | CAR 内有效环境已可见               |
| npm 项目覆盖用户、环境覆盖项目                  | 隔离自有目录 + 真实 npm；配置字节未变                      | 所有 npm/pnpm 版本及 Unix          |
| 超时、取消、清理失败                            | 真正启动 Node 及其子进程，按 PID 清理并核实子 PID 不再存在 | 所有平台均已测试                   |
| CAR 结构与 Engine 加载                          | readTaskBundleCar 校验完整 DAG 后提供 block port           | 业务通过/多问题/输出文档验收已完成 |
| Unix nvm / 真实 nvm-windows / 真实 pnpm/nrm     | 尚缺真实验证                                               | 不作外部支持声明                   |

## 历史制品与验证（旧 CID，不用于当前消费）

CAR 持久路径 `packages\check.nodejs-toolchain\dist\nodejs-toolchain.car`
（被仓库忽略）。最终候选 CAR 已由 `readTaskBundleCar` 完整验证：
`bafybeid6vl3z2y2clah2yyxvxsdx6bykhztpfk6en3s62bxodxqpqkl32u`。真实 Engine
smoke 再次复现上述 `tool-missing`
阻塞；不以该 CID 声称业务验收通过。消费、导入/pin 及输出文档读取说明位于作者 README；未实际上传或远程 pin。该阻塞候选尚不可作为部署完成证据；Deployment 和所有 D-* 保持未完成。

`pnpm check` 通过（20/20 Turbo tasks，包含新增 32/32 定向测试）；
`silvermoon check --worktree --audience agent --language zh-CN`
通过。上述成功不包含 smoke 验收通过，也不解除上游环境阻塞。自有测试目录与 Engine
smoke 目录已清理；未 stage/commit/push、记录事件或批准门限。

## 历史：前一候选制品与检查结果（旧 CID）

- CAR：`packages\check.nodejs-toolchain\dist\nodejs-toolchain.car`。
- 当前准确根 CID：
  `bafybeicq6vigavdfkexbglk2gukyvx5ewh4bvhqduvnortn2cqljjmtp7m`。
- 默认 smoke 完整验证该 CAR 的 DAG 后执行 13 个场景，全部符合预期；输出文档根 CID 为
  `bafybeig7wg25y3c437ppkash4h35nuos7sn3vdkgez2r2a4smnyzjnhl2i`，已在测试 MemoryStore 内逐字节读取中文文档；不表示输出已上传或远程可用。
- `pnpm check` 最新通过：20/20 Turbo
  tasks，包含当前 50/50 定向测试与独立 CAR 构建执行测试。 `git diff --check`
  通过，自有 `.toolchain*` 测试/诊断目录已清理。
- 同一当前 CAR 的 `--nvm` 仍精确失败在
  `real-nvm-managed`：期望 completed/pass，实际 failed、`run_failed: Tool command timed out.`，无 output、Worker 非强杀且 reclaimedAt 存在。其余支持范围不因此伪报失败或通过。
- 仅勾选已完成的 I-S02、I-AC02、I-AC03；I-S01、I-S03、I-AC01 的完整门限仍等待真实 nvm 管理证据，所有 D-* 未勾选。未 stage/commit/push、记录事件、审批门限或远程上传/pin。

本轮变更只涉及根 README/pnpm
catalog/lockfile，本私有包的 README/package.json、contract/command/inspect 与新增 execution-context、smoke、inspect 测试与新增 execution-context/CAR 测试，以及该 idea 的 Inner 文档/ledger。没有修改 Ideal
World、其他 idea、发布映射/工作流或其他仓库。

## 最后复核修正：无工作区 YAML 的项目 .npmrc

父级指出原 preflight 仅在找到 pnpm-workspace.yaml 时加入项目 .npmrc，遗漏了独立项目 cwd/.npmrc，也可能漏掉没有自身 manifest 的子目录实际采用的父级 prefix。本次只补齐这些已选项目配置来源，不改变调用方上下文或原生命令优先级。

已核查当前安装的 pnpm 10.22.0 npm-conf/findPrefix 与 pnpm 11.22.0
loadNpmrcConfig/findLocalPrefix：两者都按最近的 node_modules、package.json、package.json5、package.yaml、pnpm-workspace.yaml 确定本地 prefix，并处理 cwd 名为 node_modules 的情况。10.22 会读取 prefix
.npmrc 及可选 workspace .npmrc；11.22 在 workspace 存在时选 workspace
.npmrc，否则选 prefix .npmrc。

安全的真实工具观察只使用自有 registry
URL，不设置配置依赖：通过诊断专用 --ignore-workspace 排除测试容器的外层工作区，10.22 和 11.22 均在独立项目返回该项目的 .npmrc；从没有 package 标记的 leaf 运行时，均返回最近父级 package 的 .npmrc，而非 leaf/.npmrc。Check 自身没有增加该 flag，也没有重写原生优先级。所有诊断文件前后不变且自有目录已清理。

版本能力不能混淆：11.22 的 INI 只接纳 registry/auth/网络相关键，不会把 INI 中的 configDependencies 传入安装设置；10.22 的通用 INI 原始键读取也不等于 rcOptionsTypes 中支持这个安装设置。原有 YAML 配置依赖安装路径仍须拒绝。本次对发现的项目 INI
configDependencies 声明保守拒绝，不以“某个已测版本可能忽略它”为由跳过预检，不宣称两个版本都支持从 INI 安装配置依赖。

新增两个定向回归：无本地 YAML 的 cwd 与实际父级 prefix 各自声明配置依赖，使用仅供启动观测的 launcher，若启动就写 marker/安装目录；两者都精确抛出 preflight 错误，marker/安装目录不存在，配置字节未变。这些 launcher 只证明启动前拒绝，不作为真实 pnpm 支持证据。真实 CAR 另增加 standalone-pnpm-config-dependencies-fault：仅 package.json/.npmrc 的项目被明确拒绝，无业务输出或安装产物。

## 此前最终候选（旧 CID，已被本次复核修正替代）

- 持久 CAR：`packages\check.nodejs-toolchain\dist\nodejs-toolchain.car`。
- 准确根 CID： `bafybeigpeawcaxlmpoksl3u67nejdofakiz5w5ypjniennyhq6yl4g3e74`。
- 当前输出文档根 CID：
  `bafybeid34lp2g3vvu44b5waqzbxx24u2l6qlxhataeshymot3alabzifdi`。仅在本地测试存储验证字节，不声称已远程上传或 pin。
- 定向 lint/typecheck/test/build 通过，50/50 测试通过；最新 `pnpm check`
  通过，20/20 Turbo tasks（16 个既有缓存、4 个本包新执行）。
- 对**同一个上述最终 CAR**，默认 smoke 的 13 场景与官方 portable nvm
  smoke 的 4 场景全部符合预期，共 17 个真实 Engine 场景；Node-only 与真实 nvm 管理+配对通过，各正常不满足场景代码精确匹配，故障/取消/两级超时无伪造 Check 输出，中文文档从输出 CID 逐字节读取。
- 四个 nvm
  Run 均正常 completed、非强杀且 reclaimed；原样工具源文件、独立配置和私有 current 链接未变，自有运行环境全部删除；默认故障夹具子 PID 已回收。
- 同一次验证前后，共享 nvm.exe、共享 settings.txt、原 `C:\Program Files\nodejs`
  链接及父进程 PATH 比较全部相同。原共享二进制故障保留为宿主历史问题，没有被替换或修复。
- 所有 I-S*/I-AC* 已按真实工作与证据勾选；所有 D-* 保持未完成。这些勾选不是门限审批或生命周期事件。

本次补充的 `scripts/nvm-smoke.mjs` 使用固定官方校验值与公开 CAR/Engine
API；没有修改检测器来迎合工具输出，官方 1.2.2 的真实 root/list 输出直接通过现有适配。未修改 Ideal、其他 idea、共享工具、node_modules、上游仓库或发布配置；未 stage/commit/push、记录事件或批准门限。当前实施候选交由父级复核、同步及准确 revision 的提交/验收。独立 CAR-only 消费与远程存储授权仍在 Deployment 阶段处理。

## 当前最终候选：项目 .npmrc 修正后的证据

- CAR 持久路径：`packages\check.nodejs-toolchain\dist\nodejs-toolchain.car`。
- 准确根 CID： `bafybeiahk52evmukio5wr7nkomvab4ujmk3yxzss4pxbaqlz57rmmc2yxe`。
- 输出文档根 CID：
  `bafybeid34lp2g3vvu44b5waqzbxx24u2l6qlxhataeshymot3alabzifdi`。
- 定向 typecheck/test/lint 通过，52/52 测试通过； `pnpm check` 最新通过，20/20
  Turbo tasks（16 个既有缓存、4 个本包新执行）。
- 对同一个上述新 CID，默认 smoke 的 **14** 场景与原官方 portable nvm smoke 的
  **4** 场景全部符合预期，共 **18**
  个真实 Engine 场景。新增 standalone-pnpm-config-dependencies-fault 精确为 failed/reclaimed，没有 Check 输出或安装产物；所有既有业务、输出文档、取消/超时与物理清理断言未放宽。
- 官方 nvm 管理+配对通过，两个真实反例与版本观察通过；checksum 核验与原样 Node/npm 源文件、独立配置/链接不变的断言仍全部通过，自有运行环境全部删除。没有重调试原宿主故障或重新下载工具。
- 经核验的官方 portable
  archive/解包目录仍保留，父级可按原命令复验；仅将其第一个 CAR 参数换成本节持久路径，harness 会核验并输出当前准确 CID。
- I-S*/I-AC* 已根据本次重新验证恢复完成；所有 D-* 未勾选。本次仅修正启动前配置来源发现并增加回归、真实 CAR 场景及相关文档，未改变原生 registry 优先级或公共输入要求，未扩展无关目录扫描。

本候选交父级最终复核与准确 revision 的生命周期提交/验收；子代理未修改 Ideal、其他 idea、事件、上游/已安装代码或共享配置，未 stage/commit/push、审批门限、发布 npm 或上传/pin。
