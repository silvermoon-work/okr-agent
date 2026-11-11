# Node.js Toolchain Check

私有 CAR 作者项目
`@silvermoon-work/check.nodejs-toolchain`，不发布 npm，不在 release 映射中，也不要求消费者安装作者包。一个项目、一个 Check
Task，复用工作区 Check Task SDK/Builder 和上游 Task 0.2.0-rc.0。

**当前阻塞：上游 Engine 的 Worker 环境清空 PATH、HOME、NVM_DIR 等，尚不能在真实 Engine 中完成所要求的执行机有效工具链检查。**
检测器不会退回控制机环境、扫描系统目录或拿 Worker 的 Node 路径冒充 PATH。当前 CAR 是实施候选，不是已验收可部署制品。

## 作者构建与验证

在仓库根执行：

```sh
pnpm --filter @silvermoon-work/check.nodejs-toolchain typecheck
pnpm --filter @silvermoon-work/check.nodejs-toolchain test
pnpm --filter @silvermoon-work/check.nodejs-toolchain build
node packages/check.nodejs-toolchain/scripts/smoke.mjs packages/check.nodejs-toolchain/dist/nodejs-toolchain.car .
```

Builder 已同时生成标准目录和 CAR，无需重复运行 task-builder
car。持久制品位于本包忽略目录
`dist/nodejs-toolchain.car`；构建日志报告准确根 CID。smoke 通过 readTaskBundleCar 完整验证 CAR/DAG，使用其已验证 block
port 启动真实 Engine，并检验结果、输出 CID 文档及资源回收；目前在预期 Node-only 通过用例发现
`tool-missing` 而失败，见下述证据。

## 输入与限制

见 [`src/contract.ts`](./src/contract.ts) 与
[`references/check.md`](./references/check.md)。context.projectDirectory 必须是执行机已存在的绝对目录，非调用机路径。tools 的每项
`{}`
表示可用，minimumVersion 为数字点分下限。pairing.npmWithNode 要求显式声明 node/npm；management 仅支持 nvm，appliesTo 为已声明 node/npm 的非空无重复列表。active
npm/pnpm 分别核验项目有效默认 registry，allowedUrls 任意匹配；nrm.required 对精确名称/URL 全部匹配。未知字段、空要求和冲突输入拒绝。

检测不执行安装、切换、项目 scripts、构建、网络或发布测试。子进程禁止 Corepack 下载/自动 pin 和 pnpm 自动管理版本，并关闭更新通知；只影响检测子进程，不修改调用方环境或配置。因此未准备好的 Corepack/pnpm 环境可能不可用，不会借项目 packageManager 自动下载或切换。每条命令预算 10 秒、合计输出上限 256
KiB，整体由 Engine 生命周期管理。取消/超时按具体 PID 回收进程树；清理故障为执行错误。

## 支持矩阵（实施证据，不等于外部部署声明）

| 组合                          | 当前证据                                  | 范围                                 |
| ----------------------------- | ----------------------------------------- | ------------------------------------ |
| Windows Node 单工具与数字版本 | 本机真实 Node、32 个定向测试              | 检测器进程内通过；Engine 环境阻塞    |
| Windows npm 项目/环境覆盖     | 隔离项目、独立 user/global 配置，真实 npm | 项目覆盖用户、环境覆盖项目；文件未变 |
| Windows nvm-windows 配对/管理 | 受控 Host fixtures                        | 未完成真实 nvm 管理验收，不声明支持  |
| Windows pnpm 有效 registry    | Host fixtures                             | 未完成真实 pnpm 配置覆盖验收         |
| Windows/Unix nrm              | 严格 `nrm ls` 格式 fixtures               | 无真实 nrm 证据；未知格式执行失败    |
| Linux/macOS nvm               | 独立 shell-function 适配候选              | 未在真实 Unix 执行，不声明支持       |
| 其他平台/未知入口协议         | 明确故障或不可确认问题                    | 不会跳过后宣称通过                   |

Unix nvm 只通过绝对 NVM_DIR/nvm.sh 与固定 bash --noprofile
--norc 脚本查询，不加载 profile、不使用继承函数、不执行 nvm use。Windows
npm 配对仅识别已验证形状的标准 modern
npm.cmd，确认 npm-prefix.js 可能选择的实际 npm
CLI 和其 Node 运行时。非标准入口报告不可确认。路径使用真实路径与目录边界，非字符串前缀。

## CAR 导入、pin 与消费（阻塞解除后）

消费者只需标准 Task
Engine 和其可读的 IPFS 存储，不需要安装作者 npm 包。先本地核验 CAR 根 CID 与作者提供的准确 CID 相同，再经独立授权导入受控存储：

```sh
ipfs dag import --pin-roots=true nodejs-toolchain.car
ipfs pin ls <verified-root-cid>
```

以上是消费方操作说明，本次未上传或远程 pin；本地 CAR 不表示远程可用。Engine 的 ipfsClient 必须可读该精确 CID 的完整 DAG。以
`engine.submit({requestId, bundle: "<verified-root-cid>", input, timeoutMs}, caller)`
提交，input 使用执行机绝对目录和明确 requirements。不能用 workspace 名、npm 版本或 latest 代替 CID。成功完成的 Run 通过
`run.output.result` 读取 Check 结果，通过 `run.output.cid/<documentation>`
获取相对参考文档。故障/取消不得解释为正常不满足或通过。
