# 执行上下文最小提案（父级已选定）

父级在用户委托的门限职责下选定本方案：以闭合显式上下文定义工具执行环境，保留 Engine 默认隔离，不要求上游发布。业务边界已补入理想世界
[ExecutionContext.md](./ideal/ExecutionContext.md)，以同步后准确 revision 的重新提交/验收为准。本决定只允许按该契约实施，不表示实现、平台或制品已经验收；后续仍须真实 CAR、独立消费和无修改证据。

## 已核实的公共边界

2026-11-12 只读检查了已安装的上游 0.2.0-rc.0 类型声明，以及
`D:\Code\task-engine` 的相应源码：

- `packages/task-engine/src/type-supervisor.ts` 的 `RunWorker.start`
  明确只提供空 NODE_OPTIONS 和 Windows 系统目录，不继承 PATH、用户目录或 npm 环境覆盖。
- `packages/task-engine/src/bundle-engine.ts` 的公开 `EngineOptions`
  无环境能力；`install` 固定 `configuration: null`，不能用 configuration 注入。
- `packages/task-sdk/src/index.ts` 与 `packages/task-protocol/src/run.ts`
  的公开 TaskContext/RunContext只有 signal、Space、日志、进度、消息和子任务，没有宿主工具/环境通道。
- 旧类型注册的 resources/configuration 不属于公开 Bundle
  Engine 消费接口；改成旧类型任务会失去标准 CAR 消费契约，不采用。
- `Authorize`
  只接收 caller、operation、scope，不能检查或替换业务 input。因而不能声称现有 authorize 回调可以签认执行上下文。

结论：不存在可直接启用的现有宿主环境能力，但普通业务 input 已经可通过公开
`engine.submit` 到达真实 CAR
Worker；可用它**显式定义工具子进程的执行环境**，无需放开 Worker 的默认环境隔离。

## 唯一建议：宿主授权的闭合工具执行上下文

批准后，在本 Check 的 `context` 下增加必填
`executionEnvironment`。它是执行参数，不是工具探测结果、环境快照证明或控制机事实。保留 projectDirectory 和所有 requirements 语义，不接受自定义命令或任意 env
map。不改变上游 Engine/SDK/Builder，不新增共享框架。

建议精确字段如下（对象均禁止额外字段）：

| 字段                                               | 类型与映射                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `path`                                             | 非空有序绝对目录数组，映射 PATH；不搜索其他目录，不回退 process.execPath        |
| `pathExtensions`                                   | Windows 必填、有序无重复 `.COM/.EXE/.BAT/.CMD` 数组，映射 PATHEXT；其他平台禁止 |
| `home`                                             | 可选绝对目录，映射 HOME                                                         |
| `userProfile`                                      | 可选 Windows 绝对目录，映射 USERPROFILE                                         |
| `appData` / `localAppData`                         | 可选 Windows 绝对目录，映射 APPDATA / LOCALAPPDATA                              |
| `xdgConfigHome`                                    | 可选绝对目录，映射 XDG_CONFIG_HOME                                              |
| `nvmDir` / `nvmHome` / `nvmSymlink`                | 可选绝对目录，映射 NVM_DIR / NVM_HOME / NVM_SYMLINK                             |
| `pnpmHome`                                         | 可选绝对目录，映射 PNPM_HOME                                                    |
| `npmConfig.registry`                               | 可选无凭据 HTTP(S) URL，映射 npm_config_registry                                |
| `npmConfig.userConfig` / `globalConfig` / `prefix` | 可选绝对路径，映射 npm_config_userconfig / globalconfig / prefix                |
| `npmConfig.global`                                 | 可选 boolean，映射 npm_config_global                                            |
| `npmConfig.location`                               | 可选 project/user/global 枚举，映射 npm_config_location                         |

不传 NODE_OPTIONS、NODE_PATH、shell 函数、token、密码、代理凭据或其他任意变量。SystemRoot/WINDIR 仅取 Worker 已获准的系统值，不接受业务输入覆盖。子进程仍追加已有禁止自动下载/自动 pin/自动切换的固定执行控制值。

宿主侧允许选择显式配置值，或从**同一执行机上获授权的工具环境**捕获上述有限字段；不能复制控制机的 process.env 并宣称它代表远端执行机。捕获必须按已知键逐个读取，不枚举或序列化全部环境。npm 大小写别名冲突时拒绝，不猜优先级；非 registry 所需的任意环境变量不随输入传播。

### 所有权与信任

1. 在 Engine 所在执行机上，由可信服务适配层/管理员为该 caller、项目目录和精确 Bundle
   CID 选择执行上下文。
2. 适配层构造完整 input 后调用现有
   `engine.submit`。对远程请求，应忽略客户端自报 executionEnvironment，并注入服务端选定值；不能只依赖 Engine 的 scope 授权签认 input。
3. 不经适配层而直接提交的调用者必须本来就获授权选择该执行机的工具路径与配置；这是执行参数授权，不是“客户端报来的工具状态可信”。Worker 不是安全沙箱。
4. Worker 在本机以此闭合 env 和 projectDirectory 真正启动工具；版本、配对、nvm 当前状态和有效 registry 全由实际命令/路径观察，不接受输入中的版本、当前 registry、nrm 列表或受管结论。

因此目标仍为实际执行宿主上的工具子进程，而非控制机或模拟工具结果。默认 sanitized
Worker 不需要也不会获得完整宿主环境。这一解释将 R-03 的“实际执行环境”精确定义为显式 context 下实际启动的工具环境；
**必须由父级批准后实施**，不能在未批准时声称它等于原 Worker 的 ambient
process.env。

### 有效 registry 与秘密边界

在同一项目目录以真实 npm/pnpm `config get registry`
查询；home/config 路径和 npmConfig 覆盖逐项进入该子进程，保留项目/用户/环境的原生优先级。npm-prefix.js 也使用完全相同的 env，配对检测不能另用 Worker 默认配置。

不能把捕获阶段的 registry 查询结果作为输入回填来绕过执行阶段查询。输入只允许无凭据默认 registry
URL；认证内容留在本机配置文件，不进入 input、日志或结果。如果配置的 registry 需要未获准变量插值，或需要额外环境才能确定有效值，必须报明确执行故障，不继承秘密、不忽略覆盖、不回退默认 registry。本方案不承诺支持任意 ambient
env，也不把这种受限情况判通过。宿主与消费者应知道 input 会按 Engine 常规行为持久化，因此输入只含经批准的非秘密参数。

## 与上游 opt-in 环境能力的比较

上游另一条路是在 Engine 构造时增加宿主所有的 Bundle/CID 级可选环境能力，贯穿 bundle-engine、Coordinator 和 type-supervisor，让运行 Worker 获得显式白名单；默认仍保持 sanitized，Verifier 不应继承它，SDK 业务结果不变。它避免业务 input 携带环境选择，但需要修改、测试并交付新版 Engine；
**已发布 0.2.0-rc.0 不会认识该能力**，不能把本地源码验证说成已发布消费可用。

本次建议不采用上游改动：现有 CAR
input 足够表达获授权的工具执行环境，实现面只在本 Check，已发布 Engine
0.2.0-rc.0 可原样执行。没有要求编辑或发布
`D:\Code\task-engine`，本轮也未修改该仓库或 node_modules。

## 批准后的精确改动与验收

- `packages/check.nodejs-toolchain/src/contract.ts`：增加上述闭合 context
  schema 和平台/跨字段验证。
- 新增本包内部
  `src/execution-context.ts`：只将已验证的命名字段映射成子进程 env；
  `inspect.ts` 和 `command.ts` 统一使用它，不展开 ambient process.env。
- `scripts/smoke.mjs`：在真实 Engine 所在进程按白名单构造获授权上下文，标准 CAR 仍由 readTaskBundleCar 校验后交给真实公开 Engine；不修改 Worker、Engine 或回调以放宽预期。
- `test/inspect.test.ts`
  及必要的新定向测试：未知变量/凭据 URL/相对路径/平台冲突/大小写冲突拒绝；无控制机回退；项目/用户/环境 registry 覆盖真实生效；npm-prefix、版本、配对、管理与 registry 共用同一上下文；检查前后文件、环境和工具选择不变。
- 扩展真实 CAR smoke：Node-only
  pass、多问题 fail、输出 CID 中文参考文档字节读取、执行故障、取消/超时与实际子进程树清理；Windows 真实 nvm/pnpm/nrm 只读验证使用独立自有配置，不改系统注册或选择。
- README、Inner Implementation/Verification 与匹配 ledger
  I-*：记录新 context 的授权方式、无作者 npm 安装的独立消费者示例及真实支持矩阵；Unix 没有实际证据时继续不声明支持。

上述方案不需要 npm 发布即可用当前已安装的 0.2.0-rc.0 进行端到端本地验证，并继续交付一个私有作者项目、一个标准 CAR/CID。当前尚未获批准，未实现该输入变更、未改 Ideal、未修改其他 idea 或记录生命周期事件。
