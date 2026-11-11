# Node.js Toolchain CAR 交付与独立验收

## 交付身份

- 私有作者项目：`@silvermoon-work/check.nodejs-toolchain`，不发布 npm。
- 持久制品：`packages/check.nodejs-toolchain/dist/nodejs-toolchain.car`。
- 准确 Bundle 根 CID：`bafybeiahk52evmukio5wr7nkomvab4ujmk3yxzss4pxbaqlz57rmmc2yxe`。
- CAR 字节数：305283。
- CAR
  SHA-256：`4fa6defe505dbb9d4500c1aa20a748ee02b54787737b84516e6eff8e4004f8ab`。
- 本地输出文档根：`bafybeid34lp2g3vvu44b5waqzbxx24u2l6qlxhataeshymot3alabzifdi`。它是测试存储中的已验证内容身份，不意味着已经上传。

作者源码与内层证据已在实现提交 `705a3fd310aaa1fd92e05cf8f23e29dd623a827f`
同步。CAR 按项目约定保留在忽略的 dist 中，可通过作者构建重建；交付时仍须核验所取 CAR 的根 CID，不以 npm 包名、文件名或 latest 替代身份。

## 实际部署验证

验证针对已同步的
[Deployment.md](./Deployment.md)；独立消费脚本的 ESM 解析修正后，准确计划提交为
`b4c5a2881db25c5d8b9123a9a1188d54eee5503a`。没有修改 Check 制品来配合消费环境。

| 证据                                                     | 实际结果                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Engine-verification.json](./Engine-verification.json)   | 同一 CAR 的 14 个真实 Engine 场景：工具、配置覆盖、nrm、问题分类、故障、取消、两级超时及物理回收全部符合预期 |
| [Nvm-verification.json](./Nvm-verification.json)         | 官方 portable nvm-windows 1.2.2 的受管且配对、非受管工具、npm 来源不符及版本不足共 4 场景符合预期            |
| [Independent-consumer.json](./Independent-consumer.json) | 仓库外 5 场景通过：Node-only、Node/npm 配对与用户 registry、显式 registry 覆盖、多问题不通过及执行故障       |

共 23 个真实 Engine 场景使用同一准确 CAR。正常不通过不是执行故障；故障没有 Check 业务输出。参考文档均从实际 Run 的 output
CID 读取，并逐字节与 Bundle 中文参考资源核对；各 Run 已物理回收。

独立目录只安装公开 Engine/Builder 0.2.0-rc.0 与 exporter
16.2.3，未安装作者包或 Check
SDK，也不读取作者源码或仓库 node_modules。脚本显式断言这两包不可解析，并断言消费依赖不在作者仓库内。CAR 副本与作者持久制品 SHA-256 相同。隔离配置字节未变，工具上下文夹具已删除。

初次安装因本机 pnpm 构建审批策略拒绝 esbuild 的 postinstall；随后仅通过
`pnpm approve-builds esbuild` 批准该必要依赖，并以 frozen
lockfile 完成安装。未关闭整机策略，未使用 registry 强制覆盖；该安装操作只准备外部消费工具，不是 Check 安装目标工具的行为。

## 独立消费复现

在仓库外新建自有目录，将 [consumer.package.json](./consumer.package.json)
复制为 package.json，并复制 [consumer.mjs](./consumer.mjs)
与上面准确 CAR。脚本只能在明确的授权执行机上运行，输入路径和用户配置由该宿主选定。

```powershell
pnpm install
# 仅在本机策略要求且已核验此依赖时：
pnpm approve-builds esbuild
pnpm install --frozen-lockfile
node consumer.mjs nodejs-toolchain.car bafybeiahk52evmukio5wr7nkomvab4ujmk3yxzss4pxbaqlz57rmmc2yxe D:\Code\okr-agent
```

最后一个参数是应当隔离的作者仓库路径，需按复现环境替换。调用前遵守该执行机自己的包源与安装授权要求；本机 Tencent 源不是此 Check 的默认政策。

consumer 通过标准 CAR reader 验证完整 DAG，以公开 block
port 创建真实 Engine，不需要额外 Kubo 服务。示例隔离 registry
URL 只作为配置观测对象，不探测网络，也不进行依赖安装。

若实际消费方使用外部 IPFS 存储，必须另外授权导入/pin，再使 Engine 的 ipfsClient 可读取准确根 CID 的完整块闭包。本文没有执行外部上传或 pin；本地离线验收不代表远端可用性。

## 支持范围与限制

- 已实证 Windows x64：Node 26.13.0、npm 11.20.0、pnpm 10.22.0/11.22.0、nrm
  1.2.6、官方 portable nvm-windows 1.2.2。
- 这些是验证过的组合，不是硬编码的业务版本下限；调用方通过 requirements 声明需要的版本与关系。
- nrm
  2.1.0 的只读命令启动会重写配置，因此当前在启动前拒绝它及未验证实现；不假装能无副作用检查所有 nrm 版本。
- 当前仅确认标准 modern
  npm.cmd 的安装配对；其他 shim 或拆分发行版无法确认时不判通过。
- Unix nvm 适配有逻辑回归，但没有真实 Unix 支持证据，不作已支持声明。
- 原共享 nvm 二进制启动挂起是宿主已有问题。本次未替换它、改共享 settings、切换全局链接或修改 PATH；官方 portable 实证也不意味着该宿主问题已经修复。
- 必填闭合 executionEnvironment 保留 Engine 默认隔离。远程服务应注入服务端选定上下文，不信任客户端自报环境；现有 authorize 不审核业务 input。
- 不安装或升级目标工具，不切换版本/registry，不运行项目构建，不检查 scoped
  registry、认证、网络或发布权限。

## 门限依据

实现阶段 52 项本包测试与仓库 `pnpm check`
通过，父级独立复核并返工后接受了准确实现 revision。上述独立 CAR 消费与外层真实证据满足本阶段 D-S*/D-AC*；ledger 勾选只记录完成的工作，最终 completed 状态仍由准确同步 revision 的 submitOuter/acceptOuter 决定。
