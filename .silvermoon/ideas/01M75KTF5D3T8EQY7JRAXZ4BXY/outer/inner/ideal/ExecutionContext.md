# 显式工具执行上下文

本文补充 [Requirements.md](./Requirements.md)
的 R-03：检查的是目标执行机上，按调用方获授权上下文真正启动的工具，不是 Worker 默认 ambient 环境。该定义保留工具、配对、nvm 与 registry 的业务要求，不以输入中的结论代替观测。

## 目标与边界

- 当前已发布 Engine
  0.2.0-rc.0 有意不传入 PATH、HOME、nvm 或 npm 配置环境；本 Check 不修改、绕过或放宽这一默认行为。
- `context.executionEnvironment`
  是必填闭合对象。Worker 将它转成工具子进程的环境，所有工具定位、版本、配对、管理与 registry 查询共用它。
- 不支持任意 env map，不从 ambient
  process.env 扩展未批准变量，不扫描其他进程、系统目录或退回 process.execPath 选择另一个工具。
- 子进程不得自动下载、pin、安装或切换工具。执行控制与业务选择分离，固定防自动修改控制不允许输入覆盖。
- 运行要求依赖未支持的环境插值或能力时，明确失败，不悄悄使用默认配置。

## 闭合字段

所有路径必须是目标平台有效的绝对路径，不接受 NUL 或换行。路径选择不等于文件存在或工具可用，仍需实际检测。

| 字段                                               | 要求与映射                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `path`                                             | 非空有序绝对目录数组，映射 PATH，保持查找顺序                                            |
| `pathExtensions`                                   | Windows 必填，有序无重复 `.COM`、`.EXE`、`.BAT`、`.CMD` 子集，映射 PATHEXT；其他平台禁止 |
| `home`                                             | 可选绝对目录，映射 HOME                                                                  |
| `userProfile`                                      | 可选 Windows 绝对目录，映射 USERPROFILE                                                  |
| `appData` / `localAppData`                         | 可选 Windows 绝对目录，映射 APPDATA / LOCALAPPDATA                                       |
| `xdgConfigHome`                                    | 可选绝对目录，映射 XDG_CONFIG_HOME                                                       |
| `nvmDir` / `nvmHome` / `nvmSymlink`                | 可选绝对目录，映射 NVM_DIR / NVM_HOME / NVM_SYMLINK                                      |
| `pnpmHome`                                         | 可选绝对目录，映射 PNPM_HOME                                                             |
| `npmConfig.registry`                               | 可选无凭据默认 registry URL，映射 npm_config_registry                                    |
| `npmConfig.userConfig` / `globalConfig` / `prefix` | 可选绝对路径，映射相应 npm_config_*                                                      |
| `npmConfig.global`                                 | 可选 boolean，映射 npm_config_global                                                     |
| `npmConfig.location`                               | 可选 project/user/global 枚举，映射 npm_config_location                                  |

SystemRoot/WINDIR 仅复用 Worker 已获准的系统值，不允许输入覆盖。不允许 NODE_OPTIONS、NODE_PATH、token、密码、代理凭据、继承的 shell 函数或未知键。上下文不会包含完整环境变量清单。按已知键捕获时遇到大小写别名冲突，应拒绝而非猜测优先级。

## 授权与来源

1. 在实际执行机上，由可信宿主适配层或管理员为 caller、项目目录与准确 Bundle
   CID 选择上下文。
2. 远程服务应忽略客户端自报环境并注入服务端选定上下文；不能仅依赖现有 Engine
   authorize 回调声称已审核 input，因为该回调不接收业务 input。
3. 直接提交完整 input 的调用者必须本来就获授权选择该执行机上的工具路径及配置。Worker 不是安全沙箱，路径和本机文件访问不会因此变成隔离能力。
4. 输入按 Engine 普通业务输入持久化，因此只能传入经批准的非秘密执行参数；认证内容留在本地配置文件，不复制进 input、日志或结果。
5. 不接受来自控制机的环境快照作为远程机器事实。配置选择与检查结果严格区分，真实版本及配置结论由目标机器上的工具产生。

## 真实验证要求

- 使用未修改的已发布 Engine 与标准 CAR，Worker 保持 sanitized，显式上下文下 Node-only 必须实际通过。
- 在隔离的自有目录证明项目、用户配置和显式 npmConfig 覆盖按原生优先级生效，工具选择与配置文件检查前后不变。
- 配对检测中的 npm-prefix、版本命令、nvm 检查和 registry 查询必须使用同一个环境；不得某项回退到父进程配置。
- 覆盖非法字段、相对路径、凭据 URL、平台冲突及别名冲突的明确拒绝；执行故障、取消及清理要求不变。
- 独立 CAR 消费说明必须包含宿主构造上下文的方法与授权边界，不能要求消费者修改 Engine、安装作者 npm 包或继承完整 ambient 环境。
