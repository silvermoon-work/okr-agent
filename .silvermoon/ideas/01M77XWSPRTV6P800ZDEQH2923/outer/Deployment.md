# 统一 TypeScript 项目约定交付初版

## Steps

### D-S01: 准备独立 CAR 消费

在不依赖作者源码的环境消费准确新 CAR，仅使用公开 Task 工具、授权项目对象与发行元数据来源。

本次制品为 `bafybeibt3cicv25ra5jv5dyj2qitoumoobaiblbjx3ytn6gr7iutjfipuy`，504485
bytes，SHA256
`edcc787456072d71bba461a7895ebd87dcb1e2b2c865efa33a8cea67e8eb3fb5`；本地交付文件为仓库
`packages/check.typescript-project/dist/typescript-project.car`。制品不再重打包，不发布 npm、不远程 pin、不执行目标脚本。

先将本契约与 [consumer](./consumer/) 同步到 primary，再于
`xiaonuo@xiaonuo-ubuntu` 的本次独占 `/tmp/okr-convention-2QcjdAV3`
使用公开依赖复验。只操作此目录，不修改共享 npm、全局 registry、主机网络规则或无关项目。

### D-S02: 验证统一项目约定

以单包、单/多成员 workspace、私有应用及 npm 交付项目验证六类约定，包含根/成员版本职责、逐包开放/发布、准确提交 CI 复用、旧输入及查询失败反例；不执行目标发布或声称线上 CI 成绩已验证。

独立消费者从 Run
output 的 problem 相对链接读取标准 assets，核对完整修复字节与目标路径；证明固定文档整份检查、自由扩展只检查约定连接，不依赖硬编码 Check
CID 或移动模板。

实际生产 CAR 分别验证当前私有应用、npm 单包、根工具共享的单/双成员 workspace 通过，以及旧配置、固定文档变更不通过；用同一 CAR 和仅测试进程的 fetch 拒绝注入验证元数据查询故障不判通过。拒绝注入不更改业务输入、Bundle 或其他进程，也不声称为正常 live 观测。先验证真实 live，再验证明确标记的故障场景。若故障注入未传播到 Worker，不将普通 live 成功冒充故障证据。

实际输出核对四项 assets 全字节及 problem 相对引用；四种旧输入拒绝、I/O 故障与取消无输出、Run 回收、借用 store 生命周期、目标配置不变均由消费者断言。固定文档损坏样本可同时有质量门限错误，不据此声称只有一条问题。

### D-S03: 记录身份与迁移边界

记录准确 CID、单目录输入、适用性、观测来源与时间，以及旧输入的不兼容行为；不改写历史 CAR 或未经授权的外部引用。

输入仅为
`{ "projectDirectory": "<执行宿主上的绝对目录>" }`；拒绝旧 context、requirements、projectScopes 及额外字段。不把当前开发机 registry 限制写进 CAR。宿主必须明确授权 canonical-v1 对 npm 完整 install-v1
packument、Node 历史精确发行 index 和 GitHub 当前生命周期 schedule 的只读查询。历史精确发行证据与当前可变事实采用不同新鲜度规则；故障、过期或未知结构明确不通过而非凭旧缓存通过。

本版支持有限、可证明的配置：pnpm v9 importer/peer
snapshot、静态可解析工具链与脚本、tsc ESM 产物关系及显式启用的单包 npm
publisher-v1。未知自定义/多包 publisher、非支持 lockfile、动态不可证配置保守 unconfirmed；不声称已验证真实线上发布或任意 CI 工作流。逐包发布及准确 main-push
full-SHA CI 的要求仍适用，不能把本版的支持边界误写为所有 monorepo 必须禁止发布。

### 独立消费复现

[consumer/package.json](./consumer/package.json)
仅含已发布公开消费者依赖，无本地 workspace、作者 SDK 或 Check 包。[fixture-inputs.tar.gz](./consumer/fixture-inputs.tar.gz)
是惰性人工项目数据，不是可执行测试目标依赖；SHA256
`dcd1ddfbbfa440be499c5e7381525d32872a4e8b7fa979c5a234e4481e4f8770`。仅在独占临时目录解压这些已审核的输入，不解压未知 archive。

将 consumer 文件与准确 `production.car`
放入上述目录（另一次重放须选新的同前缀独占目录并记录实际路径），在授权 Ubuntu 宿主依次执行：

```sh
pnpm install --ignore-scripts --config.manage-package-manager-versions=false
tar -xzf fixture-inputs.tar.gz
node prepare.mjs
node workspace.mjs
node verify.mjs bafybeibt3cicv25ra5jv5dyj2qitoumoobaiblbjx3ytn6gr7iutjfipuy
node --import ./deny-network.mjs verify.mjs bafybeibt3cicv25ra5jv5dyj2qitoumoobaiblbjx3ytn6gr7iutjfipuy --deny-network
```

prepare 仅在自有 fixture 中更新同一非破坏系列的实际声明并生成真实 lockfile；所有安装均 ignore-scripts，不运行目标 test/build/publish。Prettier
`3.10.1`
是本次已核准的精确 minimum-release-age 例外，只写在此自有 fixture，不全局关闭供应链政策；未来新增发行被政策阻止时必须显式处理，不能扩大例外。网络失败测试的作用域仅为专用 Node 进程及其 Worker，绝不修改宿主防火墙。

复验成功后把
`independent-report.json`、`offline-report.json`、fixture/workspace 准备报告保存到本外层，与本契约同步后再提交/审批准确 deploymentRevision；最后只清理已取回证据的独占临时目录。

## Acceptance criteria

### D-AC01: 独立消费可复现

实际结果证明没有作者源码或 workspace 隐含解析也能运行统一 Check。

### D-AC02: 六类标准与适用性可观察

真实 Engine 证明规则覆盖适用代码及交付包，私有应用不误报发布要求；旧输入、查询异常及 assets 链接故障不判通过，正常输出参考与标准资产可读且 Run 回收。

### D-AC03: 交付身份与范围真实

CAR/CID、复现说明及限制持久可用，不将本地验收声称为 npm 发布、远程 pin 或未验证平台支持。
