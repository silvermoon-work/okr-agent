# 工具链配置

只有工具安装、可执行性与版本全部就绪后才执行本 Checkpoint。收集全部可独立判断的
配置失败；brief 标明工具或注册名称。同一规则可对应多个失败，但本阶段只有这一份
参考文档。执行故障、取消或未知协议不是业务失败，不生成正常 Check 结果。

## Node/npm 配对

- `node-npm-paired`：当前 npm CLI 或其运行时不属于当前 Node 的标准安装布局。
  修正执行机授权 PATH、npm shim/prefix，使两者指向同一环境。版本分别合格不足以
  证明配对；不要求 npm 是该 Node 原厂附带的精确版本。
- `node-npm-pairing-verifiable`：入口或实际路径不足以建立关系，不等于已经证明不配对。
  确认标准 CLI/shim，调查符号链接及全局 prefix；新布局需要适配与真实证据。
  系统发行版拆分布局未建立关系时不判通过。

## nvm 管理

- `tool-managed`：brief 指明工具的入口或运行时不属于 nvm 已确认管理的安装。
  管理员通过对应平台 nvm 选择所需 Node，修正实际入口和 npm 指向。
- `tool-management-verifiable`：入口证据不足，不当作已受管或已证明未受管。检查 nvm
  当前选择与标准安装布局；Unix
  nvm 需要正确的 NVM_DIR/nvm.sh，未知协议为执行故障。

各工具分别判断，不能从 Node 推断 npm；nvm 存在不代表当前工具受管。只确认当前管理
关系，不证明历史安装过程，也不隐含同一版本，配对由 pairing 单独要求。

## 有效默认 registry

- `registry-allowed`：brief 指明 npm/pnpm，其实际项目上下文有效默认 registry 没有
  命中任一 allowedUrls。分别调查项目、用户与环境覆盖的原生优先级，不能从 nrm
  列表推断，也不要擅自替换调用方 URL 政策。
- `registry-readable`：工具可运行，但 config get registry 返回非零退出码。
  检查配置语法、权限或入口，不依据旧文件猜测有效值。

不回显实际 URL 或完整配置。尾斜线可等价，协议、主机、非默认端口和有意义路径必须
匹配；不涉及 scoped registry、认证或网络健康。npm/pnpm 优先级分别验证。
未支持的插值明确执行失败，包括 pnpm 11 默默忽略的 YAML registry 插值。

## nrm 注册项

- `nrm-registration-present`：缺少 brief 指明的精确名称（区分大小写）。管理员在
  同一用户上下文添加声明名称及 URL，不用 nrm use 掩盖缺失。
- `nrm-registration-url-matched`：名称存在，但 URL 不符。修正该项，不改名或切换当前
  registry；名称全部 required 项都必须匹配，允许保留额外项。

nrm 注册不代表 npm/pnpm 当前使用该地址，也不检查网络。只读启动仅验证 1.2.6；
2.1.0 会在只读命令启动时重写用户配置，Check 在调用前拒绝它及其他未验证实现。

若要求 nvm，修复配对时保留受管要求，不改用系统安装；registry 切换不能修复管理。
Check 不执行修改、安装、网络或 publish 测试。避免将认证内容粘贴到日志，全部修复后
以同一个项目目录、授权上下文与原 requirements 重验。
