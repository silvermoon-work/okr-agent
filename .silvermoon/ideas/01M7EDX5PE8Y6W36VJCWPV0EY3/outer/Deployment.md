# Deployment

本契约驱动本地独立消费验证，不授权 npm 发布、远程上传/pin 或 Cloudflare 部署。
本阶段独立消费只验收通用项目、非 Cloudflare 交付与工具链；Cloudflare 专项延后。
主会话按用户委托自主负责验收，不豁免任何检查。实现已按准确 Inner revision
`abebd5f321c307470f2ac09c5ff2522c4ebbd90d` 验收。

## Steps

### D-S01: 准备独立消费者与准确交付身份

在仓库之外的自有消费者目录安装公开 Engine/Builder `0.2.0-rc.2`、
IpfsStore `0.1.0-rc.1` 与 exporter `16.2.3`，SDK 安装同一未发布 tarball；
不安装两包作者项目，不链接或 import 作者源码。复制本阶段的两个生产 CAR、
测试生成的确定性元数据验证 CAR 和受控目标 fixture，核对准确 CID 与 SHA256。
调用方只授权自有 Node/npm 副本、隔离配置和目标目录，不改共享工具。

### D-S02: 验证两个 Check 的实际消费结果

把[CAR 消费验证脚本](./verify-cars.mjs)与[SDK 消费验证脚本](./verify-sdk.mjs)
复制到上述目录执行，仅导入安装后的公开包，使用 `IpfsStore.fromClient` 注入
CAR 内容和公开 Engine。SDK 验证完整 target 参数、有序 DFS、剪枝/兄弟继续、
未知类型、非法结果与取消。工具链生产 CAR 验证 Node-only、Node/npm 配对、
有效 registry、低版本后独立 registry 失败、缺工具局部剪枝、执行故障与取消。

TypeScript 生产 CAR 验证准入、明确缺失的通用项目/文档问题、执行故障与取消。
另以准确标记的确定性验证 CAR 验证单包/npm 通过、多问题失败和坏成员剪枝/
独立根文档继续；它只替换元数据来源，不冒充生产 CAR 或实时官方版本合规成绩。
这是离线编排/协议验收，不要求本轮通过联网证明所有外部版本新鲜度。
所有正常输出从 output CID 读取 references/必要 assets 并比较 Bundle 字节；
验证回收、Engine 耗尽后调用方内容存储仍可读和目标文件树未修改。

复验材料为[消费者 manifest](./consumer.package.json)与
[场景配置生成器](./prepare-consumption.mjs)。将 manifest 作为独立目录的
`package.json`，复制准确三份 CAR、同一 SDK tarball、受控 `good/npm/bad/member-pruning`
目录（命名 `ts-*`）和脚本；准备自有 `owned-node-npm` 副本、
隔离 `toolchain-project` 及相邻的准确 Node `26.13.1` 目录。
安装后运行 `node prepare-consumption.mjs <consumer-directory> <author-root>`、
`node verify-sdk.mjs` 与 `node verify-cars.mjs consumption.json`。
生成器固定本阶段准确 CID；未来候选必须先更新契约和身份，不能直接复用旧成绩。

### D-S03: 记录迁移说明与证据边界

提供准确新 CID、SDK 消费方式和旧制品不自动升级的说明；
区分受控消费验证、原生工具支持与线上平台验证，不复用历史成绩冒充本次结果。

## Acceptance criteria

### D-AC01: SDK 与两个 CAR 可独立消费

独立消费者可从候选 SDK 包导入新作者接口，两个 CAR 的已验证根 CID
与提交身份一致；通过公开 Engine 使用，不读取作者源码或 SDK 私有 API。
记录生产与确定性 CAR 的不同身份、SDK 同一 tarball 摘要和准确公开依赖版本，
证明依赖真实解析路径在作者仓库之外。

### D-AC02: 结果与文档协议实际保持

记录两个 Check 本阶段职责的成功/多问题失败与故障/取消结果、output 文档/资产读取
及回收证据；被前置阻断的分支没有派生报告，独立分支仍有对应发现。
TypeScript 成功逻辑使用明示的确定性验证 CAR，生产 CAR 的独立准入、缺失诊断
与故障边界另记；不将确定性成绩描述为真实官方元数据或生产版本新鲜度通过。

### D-AC03: 迁移记录准确且无未授权发布

新交付身份、执行环境与验证范围可复核，旧 CAR/CID 不被覆盖。
无明确授权不发布 npm、上传/pin 或部署 Cloudflare；没有线上证据就不声称线上成功。
迁移记录明确 Cloudflare 专项未纳入本阶段交付与验收，不要求其新的消费或部署证据。
