# Node.js Toolchain Check

输入由执行机绝对项目目录 `context.projectDirectory` 与复合 `requirements`
组成。只检查显式工具以及 management/nrm 约束必需的工具；不安装、切换、修改配置、运行项目脚本或测试网络。

工具支持 `node/npm/pnpm/nvm/nrm`，`{}` 表示可用即可， `minimumVersion`
使用非负十进制整数点分形式，逐段比较且忽略补零。配对要求显式声明 node/npm；nvm 管理只允许声明的 node/npm。工具缺失会直接定位工具，不额外制造依赖它的配对或 registry 问题。

registry 使用包管理器在项目目录下的
`config get registry`；不由 nrm 推断。allowedUrls 任意一个匹配即通过；nrm
required 全部匹配，允许额外注册。URL 由 WHATWG
URL 标准规范化主机、默认端口和点路径，忽略末尾斜线；协议、非默认端口、路径大小写、内部斜线、百分号编码仍有意义。不接受凭据、query、fragment、空白和反斜线。重复的等价候选或同名 nrm 项拒绝输入。

问题列表只含
`code/brief/documentation`；文档路径相对于输出根。执行超时、取消、未知检测协议及清理故障抛出执行错误，不生成 Check 结果。详细修复见各问题文档；完成修复后在同一个项目目录以原 requirements 重验。版本命令成功不代表环境是安全沙箱；仅在获授权且可信的执行环境运行。

## 证据边界

配对只确认标准 Node 安装布局中的 npm，而非原厂随附版本或兼容性矩阵。非标准 npm 入口报告不可确认。nvm 管理依据当前版本、实际入口和规范化路径，不以目录字符串前缀或仅存在 NVM_DIR 断言通过。发行版系统拆分布局未建立同一安装关系时不判配对通过。

支持矩阵与真实证据见作者项目 README 和 Inner World
Verification；fixture 不证明真实 nvm/Unix 支持。不会读取完整用户配置或输出原始工具 stderr，也不会在问题中回显可能含秘密的 registry 内容。
