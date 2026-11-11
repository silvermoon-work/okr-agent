# 实施验证证据与阻塞

## 2026-11-11：上游 Worker 环境阻塞

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

## 候选实现

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

当前支持证据：

| 内容                                            | 实际证据                                                   | 不得推断                           |
| ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| 数字段版本、输入、配对、管理、registry/nrm 分类 | Host fixtures                                              | 真实 nvm/pnpm/nrm 已支持           |
| Node 定位和版本                                 | 本机 Windows Node v26.13.0                                 | CAR 内有效环境已可见               |
| npm 项目覆盖用户、环境覆盖项目                  | 隔离自有目录 + 真实 npm；配置字节未变                      | 所有 npm/pnpm 版本及 Unix          |
| 超时、取消、清理失败                            | 真正启动 Node 及其子进程，按 PID 清理并核实子 PID 不再存在 | 所有平台均已测试                   |
| CAR 结构与 Engine 加载                          | readTaskBundleCar 校验完整 DAG 后提供 block port           | 业务通过/多问题/输出文档验收已完成 |
| Unix nvm / 真实 nvm-windows / 真实 pnpm/nrm     | 尚缺真实验证                                               | 不作外部支持声明                   |

## 交付与授权边界

CAR 持久路径 `packages\check.nodejs-toolchain\dist\nodejs-toolchain.car`
（被仓库忽略）。最终候选 CAR 已由 `readTaskBundleCar` 完整验证：
`bafybeid6vl3z2y2clah2yyxvxsdx6bykhztpfk6en3s62bxodxqpqkl32u`。真实 Engine
smoke 再次复现上述 `tool-missing`
阻塞；不以该 CID 声称业务验收通过。消费、导入/pin 及输出文档读取说明位于作者 README；未实际上传或远程 pin。该阻塞候选尚不可作为部署完成证据；Deployment 和所有 D-* 保持未完成。

`pnpm check` 通过（20/20 Turbo tasks，包含新增 32/32 定向测试）；
`silvermoon check --worktree --audience agent --language zh-CN`
通过。上述成功不包含 smoke 验收通过，也不解除上游环境阻塞。自有测试目录与 Engine
smoke 目录已清理；未 stage/commit/push、记录事件或批准门限。
