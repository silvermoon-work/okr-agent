# Node.js Toolchain Check

私有 CAR 作者项目
`@silvermoon-work/check.nodejs-toolchain`，不发布 npm，不在 release 映射中，也不要求消费者安装作者包。一个项目、一个 Check
Task，复用工作区 Check Task SDK/Builder 和未修改的已发布 Task 0.2.0-rc.0。

原先 sanitized
Worker 缺少 PATH 的问题已通过获批准的显式执行上下文解决，没有改变 Engine 隔离。真实 CAR 的 Node-only、Node/npm 配对、npm/pnpm/nrm、有效配置、输出文档与生命周期场景已通过。官方 portable
nvm-windows
1.2.2 已在隔离环境通过真实 CAR 的 Node/npm 管理与配对、双工具未受管及仅 npm 未受管反例；未改共享安装、配置、链接或 PATH。原共享 nvm 二进制仍存在启动挂起问题，未声称修复该宿主问题。Check 不会自动改用验证缓存；工具选择始终遵循调用方授权的显式上下文。

## 作者构建与验证

在仓库根执行：

```sh
pnpm --filter @silvermoon-work/check.nodejs-toolchain typecheck
pnpm --filter @silvermoon-work/check.nodejs-toolchain test
pnpm --filter @silvermoon-work/check.nodejs-toolchain build
node packages/check.nodejs-toolchain/scripts/smoke.mjs packages/check.nodejs-toolchain/dist/nodejs-toolchain.car .
```

Builder 一次生成标准目录和
`dist/nodejs-toolchain.car`（忽略目录），并报告根 CID；无需重复运行 task-builder
car。测试也会独立构建 CAR，完整校验 DAG，通过公开 Engine 执行和输出 CID 读取中文文档字节，检查取消/超时与实际子 PID 回收。受控故障脚本不是实际工具支持证据。可增加
`--nvm` 诊断宿主原有 nvm；该原安装仍会超时，不用于替代下面的官方隔离实证。

### 官方 portable nvm-windows 隔离实证

仅用于作者验证的前置工具，不是 Check 行为或消费者自动安装。在 Windows 上从官方固定 tag 下载两个精确资产，先验证 checksum 再解包：

```powershell
$owned = Join-Path (Get-Location) ('packages\check.nodejs-toolchain\dist\nvm-validation-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $owned | Out-Null
gh release download 1.2.2 --repo nvm-windows/nvm --pattern nvm-noinstall.zip --pattern nvm-noinstall.zip.checksum.txt --dir $owned
$expected = (Get-Content (Join-Path $owned 'nvm-noinstall.zip.checksum.txt') -Raw).Trim()
if ((Get-FileHash (Join-Path $owned 'nvm-noinstall.zip') -Algorithm MD5).Hash -ne $expected) { throw 'Checksum mismatch' }
Expand-Archive (Join-Path $owned 'nvm-noinstall.zip') (Join-Path $owned '1.2.2')
node packages\check.nodejs-toolchain\scripts\nvm-smoke.mjs packages\check.nodejs-toolchain\dist\nodejs-toolchain.car (Join-Path $owned '1.2.2')
```

官方 checksum 资产使用 MD5；harness 还核对已记录的 archive SHA-256 和 nvm.exe
SHA-256。来源与摘要见 Inner
Verification。它只复制当前授权宿主的原样 Node/npm 文件到自有目录，以独立 NVM_HOME/settings 和私有 junction 表达当前受管安装，不声称 nvm 执行过历史安装；不执行 setup/install/use，不下载 Node/npm。真实 Engine 以同一 CAR 验证正向管理与配对、两个反向场景和 nvm
1.2.2 版本事实，读取输出 CID 中文参考文档；检查设置/链接/源文件未变并删除整个自有运行环境。经校验的 portable 下载缓存留在忽略的 dist 中，可复验或由所有者另行删除。

## 输入与授权

见 [`src/contract.ts`](./src/contract.ts)、
[`src/execution-context.ts`](./src/execution-context.ts) 和
[`references/check.md`](./references/check.md)。

`context.projectDirectory` 是目标执行机绝对目录；必填的
`context.executionEnvironment`
只接受命名字段，不接受原始环境 map、命令或探测结论。同一个 env 用于工具定位、版本、npm-prefix、配对、nvm 和有效 registry 查询。没有 ambient 环境扩展、其他进程扫描或 process.execPath 工具回退。

例如，由**实际 Engine 所在宿主的管理员**选择已存在路径：

```js
const executionEnvironment = {
  path: ["D:\\Tools\\node", "D:\\Tools\\pnpm", "D:\\Tools\\nrm"],
  pathExtensions: [".COM", ".EXE", ".BAT", ".CMD"], // Windows 必填
  userProfile: "D:\\ToolchainUser",
  home: "D:\\ToolchainUser",
  npmConfig: {
    userConfig: "D:\\ToolchainUser\\.npmrc",
    globalConfig: "D:\\ToolchainUser\\global.npmrc",
    registry: "https://registry.example.test/",
  },
};
const input = {
  context: { projectDirectory: "D:\\Projects\\demo", executionEnvironment },
  requirements: {
    tools: { node: { minimumVersion: "22.13" }, npm: {}, pnpm: {} },
    pairing: { npmWithNode: true },
    registries: {
      active: { npm: { allowedUrls: ["https://registry.example.test/"] } },
    },
  },
};
```

示例路径/URL 是占位选择，不是默认政策；必须由执行宿主替换并授权。Unix 不传 Windows 专用字段。完整固定字段和映射由 schema 定义。宿主可按已知键捕获（内部 captureExecutionEnvironment 已有别名冲突测试），但不能复制整个 process.env。捕获必须拒绝空/相对 PATH 项和冲突大小写别名，不能默默改变选择；有意缩小 PATH 应作为管理员显式选择记录。

远程适配层必须忽略客户端自报环境并注入服务端选定上下文；Engine 的 authorize 只审核 caller/operation/scope，不接收业务 input，不能声称它签认了路径。直接提交者必须已获授权选择目标机路径/配置。输入会持久化，只传非秘密参数；token、NODE_OPTIONS、NODE_PATH、代理凭据等不传入。SystemRoot/WINDIR 仅复用 Worker 允许的系统值。Worker 不是安全沙箱。

## 检测范围

- tools 仅为 node/npm/pnpm/nvm/nrm；`{}`
  表示可用，minimumVersion为任意精度数字点分下限。未声明且不被约束依赖的工具不要求。
- pairing 要求显式 node/npm；management 仅支持 nvm 和已声明 node/npm。各工具分别验证其受管安装；management 不隐式要求同一版本，配对由 pairing 决定。
- active
  npm/pnpm 分别查询实际项目/工作区有效默认 registry；allowedUrls 任意匹配，nrm.required 对精确名称/URL 全部匹配。npm 与 pnpm 的原生覆盖顺序不互相推断。
- pnpm
  11 的工作区边界由 pnpm-workspace.yaml 决定；嵌套 package.json 不一定隔离外层工作区配置。实际 pnpm
  10/11 的 npm_config_registry 优先级不同，smoke 先通过同一 CAR 观察版本，再分别验证其原生结果。
- 对 pnpm 11 会默默忽略的 YAML
  registry 插值，额外只读解析实际工作区和全局 YAML 的默认 registry，明确执行故障，不能靠允许的 fallback
  URL 通过。YAML 解析复用 catalog 的 yaml，不执行项目代码。
- nrm
  **只读启动目前只验证并允许 1.2.6**。2.1.0 在 --version/ls 前无条件重写用户 .npmrc，因此先检查已选入口/package 身份并拒绝执行；其他未验证实现也不跳过后宣称通过。1.2.6 仅为作者测试 devDependency，不随 CAR 安装到目标环境，不是 npm 发布依赖。

不安装、切换、修改配置、运行项目 scripts/实际构建、检查网络或发布权限。子进程禁止 Corepack 下载/自动 pin 和 pnpm 自动管理版本，并关闭更新通知；只影响检测子进程，不修改调用方环境。每条命令预算 10 秒、输出上限 256
KiB。故障、取消、未知协议或清理失败不生成正常 Check 结果。

固定禁止项目/全局 pnpmfile 执行、编译缓存与 pnpm
11 自动版本下载；在首次启动 pnpm 前拒绝 configDependencies，避免配置查询本身安装配置包。

即使没有 pnpm-workspace.yaml，也预检 cwd/.npmrc；另按已安装 pnpm
10.22/11.22 相同的 local-prefix 标记定位实际父级项目 .npmrc，并保留工作区 .npmrc 检查。只检查这条项目祖先链的固定配置名及 cwd 的真实路径，不遍历其他项目、不改原生命令或 registry 优先级。pnpm
11 的 .npmrc 只接纳 registry/auth/网络相关键，不把该文件中的 configDependencies 当作安装设置；pnpm
10 的通用 INI 读取也不代表每个原始键都成为有效 configDependencies。预检对发现的该声明一律防御性拒绝，不假定它在两个版本均会触发安装；YAML 中的配置依赖能力保持原有拒绝策略。

## 真实支持证据

Windows 证据限 x64 运行时，不代表其他体系结构已经验证。

| 组合                                   | 当前证据                                                            | 限制                               |
| -------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| Windows Node、标准 modern npm.cmd 配对 | 真实 CAR；真实 npm-prefix 覆盖与另一份原样 npm 副本回归             | 不承诺未知 shim/发行版拆分布局     |
| Windows npm 有效 registry              | 真实 CAR，隔离用户/项目/显式覆盖，配置字节未变                      | 不检查 scoped registry、认证或网络 |
| Windows pnpm 10.22.0 / 11.22.0         | 真实 CAR；项目/用户/显式上下文；11 的插值忽略被拒绝                 | 不推断与 npm 有相同优先级          |
| Windows nrm 1.2.6                      | 真实 CAR；隔离 .nrmrc 的命中、缺失、URL 不符与额外项                | 未验证/会修改配置的版本先拒绝      |
| nvm-windows 1.2.2                      | 官方 portable；真实 CAR 中管理+配对通过，两个真实反例及版本事实通过 | 当前管理实证，不证明历史安装过程   |
| Linux/macOS nvm                        | 独立 shell-function 适配与受控逻辑                                  | 未在真实 Unix 执行，不声明支持     |

Unix nvm 通过绝对 NVM_DIR/nvm.sh 与固定 bash --noprofile
--norc 脚本查询，不加载 profile、不使用继承函数、不执行 nvm
use。管理关系使用 nvm 已确认管理的安装与实际 CLI/运行时路径，不用字符串前缀。

## CAR-only 独立消费

消费者只需标准 Task
Engine 与可读的 IPFS 存储，不安装作者包或读取作者源码。先校验 CAR 根 CID 与提供的准确 CID 相同，再经独立授权导入受控存储：

```sh
ipfs dag import --pin-roots=true nodejs-toolchain.car
ipfs pin ls <verified-root-cid>
```

以上是消费方操作说明，本次未上传或远程 pin；本地 CAR 不表示远程可用。Engine 的 ipfsClient 必须可读该精确 CID 的完整 DAG。以
`engine.submit({requestId, bundle: "<verified-root-cid>", input, timeoutMs}, caller)`
提交，不能用 workspace 名、npm 版本或 latest 代替 CID。成功完成的 Run 从
`run.output.result` 读取结果，从 `run.output.cid/<documentation>`
读取相对参考文档。

建议父级部署验收：在不链接本仓库的独立目录只放 CAR，安装/使用已发布 Task
Engine/Builder 0.2.0-rc.0 和标准 exporter，用 readTaskBundleCar 的已验证 block
port 直接创建 Engine；由该宿主构造上述授权上下文，执行 Node-only
pass 和多问题 fail，从输出 CID 读取中文文档。不得调用本包 src、SDK 私有 API 或作者 smoke 作为替代。这验证离线 CAR 消费，不等于远程 IPFS 发布；D-* 由父级另行验收。
