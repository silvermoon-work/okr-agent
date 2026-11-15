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

## 独立消费证据

本次验证按已同步的 Outer 契约
`1a219af075efd32513e13bb9666d5137a186c16d` 执行，其 primary commit 为
`a9b1377b301af928df95524360792096bb59d34b`。以下是执行后的成绩，
不变更已执行的场景或验收条件。

- [SDK 消费报告](./SDK-consumer.json)：同一未发布 tarball 安装到仓库之外；
  验证完整 target、有序 DFS、失败分支/兄弟、未知类型、空失败与取消。
- [CAR 消费报告](./Consumer-verification.json)：13 场景全部满足预期，包含
  4 个正常通过、5 个正常不通过、2 个执行故障和 2 个取消。正常结果均从
  output CID 读取中文 references，TypeScript 所需 assets 与 Bundle 字节一致。
- 11 个实际启动的 Run 均已回收；2 个取消发生在 Run 启动之前，没有业务 output，
  不将其描述为新增的运行中子进程取消证明。运行中取消与子 PID 回收仍由已接受
  Inner 的既有 CAR/Engine 回归覆盖。
- 正常输出后的 `IpfsStore` 仍可读取（Engine 不关闭调用方内容存储）；
  目标文件树 SHA256 前后相同。依赖解析在作者仓库之外，不安装或 import
  两个作者包，不使用作者 SDK 私有 API。
- 环境为 Windows x64、Node `26.13.1`，工具链约束使用自有 Node/npm 副本，
  npm 为 `11.20.0`，隔离用户/全局配置；未修改共享工具、宿主 registry 或原配置。
  公开 Engine/Builder/IPFS Store 的精确版本见消费者 manifest。

### 准确交付身份

| 交付物 | 准确身份 | SHA256 |
| --- | --- | --- |
| SDK 本地未发布 tarball，manifest 仍为 `0.1.0-rc.1` | `dist/silvermoon-work-check-task-sdk-0.1.0-rc.1.tgz` | `8903dc5030f978b48181a62165e3eb738c5f98e8938c02f39bedd97b20d129ff` |
| TypeScript 生产 CAR，704654 字节 | `bafybeifmac4srult3w6hunlixc2afhrdbdrvpdgmn6tdmybegab7hogbba` | `6fe34ff46e9bde733171af00cd8d52e053325d6796905893b6154098c0e89780` |
| 工具链生产 CAR，311544 字节 | `bafybeihg3hca453wf4ukcx6ulqw76qzxdlyfuaij37tsrckxjnrdyrnu6i` | `f74a9aff2f0a5ba7c80f2f99fdc2040c7d659e8158da93cbb343a02fcac39004` |
| 仅确定性元数据验证 CAR，705665 字节 | `bafybeidqbbwbfczams6roqphvrsa6jowrwikxbxl2txtwvcxssao5wzsde` | `47699df5f66760446ac2bd2f99c025fdb618e529f6eb28aeb9b659d1c10bdd5d` |

生产 TypeScript CAR 已独立确认准入、通用缺失诊断、故障及取消；
单包/npm 的通过与坏成员局部剪枝成绩来自明示的确定性 CAR。
没有宣称本次证明所有生产联网版本新鲜度，也没有把验证 CAR 当作生产身份。
SDK 只是本地候选包，registry 已有的同版本 rc.1 不会因此拥有新 API；
两个新生产 CID 须由消费者显式切换，历史 CAR、CID 与证据未覆盖。

Cloudflare 专项未迁移或新增；未发布 npm、上传/pin CAR 或部署 Cloudflare，
也未新增真实 Unix、其他架构或线上平台支持声明。SDK 与两个生产 CAR 的
本地独立消费验收通过，主会话据用户委托负责准确最终 Outer revision 的审批。
