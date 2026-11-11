# Node.js Toolchain Check

输入由执行机绝对项目目录 `context.projectDirectory` 与复合 `requirements`
组成。只检查显式工具以及 management/nrm 约束必需的工具；不安装、切换、修改配置、运行项目脚本或测试网络。

必填闭合 `context.executionEnvironment`
由实际执行宿主授权，选择有序绝对 path、Windows
pathExtensions、可选用户/nvm/pnpm 目录及 npmConfig 命名覆盖。不接受原始 env
map、token、命令或探测结论；Worker 不继承整个宿主环境。所有查询使用同一个环境；远程服务应注入服务器选定值，不能把不检查 input 的 Engine
authorize 当作路径签认。

工具支持 `node/npm/pnpm/nvm/nrm`，`{}` 表示可用即可， `minimumVersion`
使用非负十进制整数点分形式，逐段比较且忽略补零。配对要求显式声明 node/npm；nvm 管理只允许声明的 node/npm。工具缺失会直接定位工具，不额外制造依赖它的配对或 registry 问题。

registry 使用包管理器在项目目录下的
`config get registry`；不由 nrm 推断。allowedUrls 任意一个匹配即通过；nrm
required 全部匹配，允许额外注册。URL 由 WHATWG
URL 标准规范化主机、默认端口和点路径，忽略末尾斜线；协议、非默认端口、路径大小写、内部斜线、百分号编码仍有意义。不接受凭据、query、fragment、空白和反斜线。重复的等价候选或同名 nrm 项拒绝输入。

npm/pnpm 分别遵守各自版本的原生工作区与覆盖规则，不能互相推断。未支持的 registry 环境插值明确执行失败，包含 pnpm
11 默默忽略的 YAML 插值，不会因 fallback
URL 恰好在允许列表中就通过。nrm 的只读启动仅验证了 1.2.6；2.1.0 会在只读命令启动时重写用户配置，本检查在调用前拒绝它及其他未验证实现，不安装替代版本。

问题列表只含
`code/brief/documentation`；文档路径相对于输出根。执行超时、取消、未知检测协议及清理故障抛出执行错误，不生成 Check 结果。详细修复见各问题文档；完成修复后在同一个项目目录以原 requirements 重验。版本命令成功不代表环境是安全沙箱；仅在获授权且可信的执行环境运行。

## 证据边界

Windows x64 实证覆盖 Node 26.13.0、npm 11.20.0 的标准 modern shim、pnpm
10.22.0/11.22.0、nrm 1.2.6，以及官方 portable nvm-windows
1.2.2。nvm 通过独立根目录、原样 Node/npm 和私有当前链接验证真实管理/配对及反例，不证明 nvm 执行过历史安装；测试环境的准备不是 Check 的安装/切换行为。Unix
nvm 尚无真实执行证据，不声明 Unix 支持；不能从 fixtures 推断平台可用。

配对只确认标准 Node 安装布局中的 npm，而非原厂随附版本或兼容性矩阵。非标准 npm 入口报告不可确认。nvm 管理依据 nvm 确认的安装、实际 CLI/运行时及规范化路径，不以目录字符串前缀或仅存在 NVM_DIR 断言通过；各工具管理不隐含同一版本，配对由 pairing 单独要求。发行版系统拆分布局未建立同一安装关系时不判配对通过。

支持矩阵与真实证据见作者项目 README 和 Inner World
Verification；fixture 不证明真实 nvm/Unix 支持。不会输出完整用户配置、环境或原始工具 stderr，也不会在问题中回显可能含秘密的 registry 内容。
