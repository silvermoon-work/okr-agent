# 工具安装与版本就绪

这是第一个 Checkpoint。收集所有可独立判断的工具失败；只有全部通过，才执行配置
Checkpoint。brief 指明具体工具，同一规则可因多个工具失败而重复出现。

检查显式 tools，以及 management 隐含的 nvm、nrm.required 隐含的 nrm。
未声明且不被约束依赖的工具不要求；仅检查 Node 不要求其他工具。

## 规则与修复

- `tool-present`：授权执行环境没有所需入口。由执行机管理员准备工具或修正显式
  PATH；Unix nvm 使用 NVM_DIR/nvm.sh，不能当普通可执行文件。控制机已安装不代表
  Worker 可见。
- `tool-executable`：入口存在，但固定版本命令返回非零退出码。检查入口、权限或
  运行时。brief 仅含工具与退出码，不回显可能含秘密的 stderr。
- `tool-version-readable`：版本命令成功，但输出不是独立数字点分版本（允许前置
  v）。不从横幅或警告猜测版本；确认真实工具及标准输出，新布局需适配与证据。
- `tool-version-minimum`：brief 给出工具、数字版本与 minimumVersion 下限。按任意精度
  数字段比较并忽略补零，不是 SemVer 范围或工具兼容性矩阵。由管理员选择合格版本；
  pnpm/nrm 升级不等于 Node 升级。

若要求 nvm 管理，保持 Node/npm 使用对应平台的受管安装，不以系统安装绕过要求。
没有管理约束时不强迫使用 nvm。Check 不安装、切换或修复工具；Corepack 下载及 pnpm
自动管理版本被禁用，管理员须预先准备。修复后以相同项目目录、授权上下文与原始
requirements 重验；此阶段通过不表示配置已经合格。
