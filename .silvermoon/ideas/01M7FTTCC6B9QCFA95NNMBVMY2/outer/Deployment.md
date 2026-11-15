# Deployment

本契约在本轮独立消费验证前固定，不表示已运行或批准发布。只计划本地独立消费；
Cloudflare 专项、npm 发布、远程上传/pin 和部署均不在本阶段授权内。
已验收实现为 Inner `06c4f3f96e58708e559d93eecedc2e9e7e676a88`，
源码提交 `aab421a8625be8d373a4383f05e6d66543483bf4`；本阶段由监督会话
按用户委托自主验收，先同步本契约，再执行以下条件，不复用旧 DFS 成绩。

## Steps

### D-S01: 建立准确候选的独立消费环境

在作者仓库之外安装本轮准确 SDK 候选包及公开依赖，复制经过校验的新 CAR；
明确 Bundle/CID、Task/Run 和 CheckExecution 的身份与授权范围，不读取作者源码
或私有 API，不以旧 DFS 制品代替本轮交付。

消费者安装精确 Task Engine/Builder/Builder CLI `0.2.0-rc.2`、
Task SDK/Protocol `0.2.0-rc.1`、IPFS Store `0.1.0-rc.1`、
TypeBox `0.34.52` 与 exporter `16.2.3`；开发验证 Node `26.13.1`。
SDK 安装同一候选 tarball，不从 registry 获取已发布同名同版本代替。
验证依赖解析路径不在作者仓库，只有受控目标和候选制品复制进独立目录。

### D-S02: 验证图执行和 Bundle 组合

通过公开入口消费本地与适配 Bundle 的 Checker，观察共享节点一次执行、
问题及文档来源、有限并发、执行中取消与故障回收；分别验证两个新 Check。
确定性 fixture 与生产适配器的身份/成绩分开记录，不伪称实时外部政策通过。

固定独立验证集合：

1. 从 SDK 公共导出定义静态 registry，规范等价 target 的菱形/重复 child
   只调用一次，保留父边；同 code 的不同节点问题保留，重跑重新观察。
2. concurrency=2 的受控异步检查证明实际并发不超过 2、FIFO 且无层级屏障，
   不同完成顺序得到稳定报告；本地图的中途 abort 和兄弟故障停止新展开，
   真实清理未结束前 executeCheck 不结束，预取消不代替这些断言。
3. 用独立安装的 SDK 和公开 Builder 构建一个**受控 v2 Check Bundle**，
   其 input 明确 pass/fail/wait 模式；wait checker 实际写入 started 标记后等待
   signal，并在 finally 写 cleaned 标记。它仅证明组合机制，不冒充生产 Check。
4. 用 caller-owned Engine 执行端口将上述 Bundle 适配为叶，验证正常通过、
   与本地问题并存的失败、共享远程节点一次调用、真实 output.cid 下文档字节、
   不导入子图。收到 wait checker 的 started 标记后触发图取消或独立兄弟故障，
   确认 cancelTask、waitForTaskRelease、cleaned 标记和 Run reclaimedAt 均真实发生。
5. 两个生产 CAR 通过公共 Engine 执行：工具链的 Node/npm 可用、配对/registry、
   缺工具剪枝、低版本后独立 registry 失败、故障；TypeScript 的安全缺失目标
   诊断和非法路径执行故障。TypeScript 的通用/npm 通过、多问题失败、坏成员
   剪枝使用明示的确定性元数据 CAR，不声称生产联网新鲜度通过。
6. 所有正常 v2 报告用公共 validateCheckReport 验证，references/适用 assets
   从真实 output CID 读取并比较 Bundle 字节；目标快照前后相同。
   全部本次实际启动的 Run 均确认回收，Engine 不关闭调用方共享内容存储。

普通 Worker invokeTask 仍没有 graph-local 单次取消和真实 output envelope；
本阶段仅验证明确宿主端口，不暗示已新增 Worker 自动绑定。端口使用公开
submit/getRequestStatus/getTask/getRun/cancelTask/waitForTaskRelease，取消发生在
preparing 时跟踪到可取消/终态，不丢弃尚未创建 Task 的请求；错误与清理失败可见。

### D-S03: 固化证据和迁移边界

记录准确制品摘要/CID、依赖与环境、目标未修改、资源已回收及支持范围，
提供 API/协议升级和旧制品不自动升级的说明，不改写旧 Idea 的验收证据。

## Acceptance criteria

### D-AC01: 候选能通过公开接口独立消费

公开导出、注册表/根入口和 Bundle 适配可由独立消费者使用；核对 SDK 包及
两个 CAR 的准确身份，证明不依赖 workspace 源码或未声明的私有运行时能力。

### D-AC02: 真实组合和停止行为满足契约

以独立运行记录证明通过、业务不通过和故障区分，重复检查去重及来源可追溯；
运行中的 abort 停止新调度并回收在途工作，不以“启动前取消”替代此项证据。
汇总不丢独立问题，文档可读，授权目标/环境未被改写。

### D-AC03: 新旧证据和交付范围清晰

制品与已验收准确实现关联，明确旧协议/版本兼容边界；新报告不复用旧 DFS
成绩，生产/确定性结果不混淆。无未经授权的发布、远程资源变更或
Cloudflare/跨平台支持声明。

## 独立执行材料

[consumer.package.json](./consumer.package.json) 作为独立目录的 package.json；
安装同一 SDK tarball（命名 check-task-sdk.tgz）和显式公开依赖。
复制 [verify-graph.mjs](./verify-graph.mjs)、[engine-port.mjs](./engine-port.mjs)、
[probe-contract.mjs](./probe-contract.mjs)、[probe-graph-worker.mjs](./probe-graph-worker.mjs)
及 [verify-artifacts.mjs](./verify-artifacts.mjs) 后，在独立目录执行：

```text
node verify-graph.mjs <author-repository-root>
node verify-artifacts.mjs <author-repository-root>
```

三份已校验 CAR 分别命名 toolchain.car、typescript.car、typescript-fixture.car；
复制 graph-verification 中 good/npm/bad/member-pruning 目标为 ts-* 目录。
自有 owned-node-npm 目录只包含校验后的 Node 26.13.1 和宿主 npm 原样副本，
缺工具场景使用相邻 node-v26.13.1 目录（只有 Node）。
脚本只创建其自有 probe 标记、受控目标和本地报告，不修改作者或共享环境。
输出 graph-consumer-report.json 和 artifact-consumer-report.json，完成后再记录结果。

## 本阶段固定候选身份

| 候选 | 路径（仓库根相对） | 准确身份与 SHA256 |
| --- | --- | --- |
| SDK 未发布 tarball | `dist/graph-validation/check-task-sdk-graph-final.tgz` | `@silvermoon-work/check-task-sdk@0.1.0-rc.1`；`39306812d00ff01e8d10dff0be3ad68923c055409032e614bf03e468409e6821` |
| 生产工具链 CAR | `packages/check.nodejs-toolchain/dist/nodejs-toolchain.car` | `bafybeidrewa4ommkoogtndb5idog2cfn5xuhjstnsb2hxm4l6nd6tm7taa`；`d98229bbadc311591ace3d14041341d713d1aebcf60ecd7950aa6dfe5e2cf24f` |
| 生产 TypeScript CAR | `packages/check.typescript-project/dist/typescript-project.car` | `bafybeiaqow5thznglyi4ufkulzrk5fel5bc5zl77xya6qvnbmt55ujcnci`；`2bda7acb3c901f4ca2547d4d0c8cda42081367013a91d46b5726bf0aec338709` |
| 确定性 TypeScript 验证 CAR | `packages/check.typescript-project/dist/graph-verification/bundle.car` | `bafybeid6vx2qztpjyp732yqixxwz2yt2p2dpguodrwhoa3d5yjohawalsa`；`40eda472726ede7645623baad889ab666ddff916dc55549917105f7771e8dc0b` |

独立消费者构建的受控 v2 Bundle 身份在构建后随结果记录；不复用旧版本或
猜测 CID。不能为了匹配本表重写制品；出现不一致先停止并确定候选。

## 独立验收结果

监督会话先同步了本阶段验收标准与脚本，最后一次完整独立验收对应
Outer revision `e071f1a2733cf94df26d202e85565a59f6518d5b`、
primary commit `64f930e10bc16c2c8fea8fe823d7d904bd7f4461`。
首次试运行发现消费者脚本给公共 Builder 的 include 目标误用文件路径；
已修正为目录映射并同步，再核对复制脚本的 SHA256 与同步版本一致后重跑。
该修正没有更改验收条件、SDK/两包源码或候选制品身份。

### 公开接口和准确制品（D-AC01）

- [图消费结果](./Graph-consumer.json)核对同一 SDK tarball 的 SHA256，
  在作者仓库之外解析 SDK、Task Engine 和 Builder 公共导出。
  同一静态 registry 的重复目标只执行一次，下一次执行重新观察。
- [制品消费结果](./Artifact-consumer.json)读取两个生产 CAR 与确定性验证
  CAR 的全部内容并校验准确 CID/SHA256；三个身份均与上表一致。
  未安装两包作者项目，未 import 作者源码或私有 Engine API。
- 独立受控 v2 Bundle 使用已安装候选 SDK 和公开 Builder 构建：
  CID `bafybeiculgjdxqjdy7knymlfertuhpozortbdrnwjxbdp4jirjr664nowa`，
  SHA256 `80427297480846ad9fef3bb42e3e6d893c97a113cac5b5af9b1333ec4e726770`。
  它只证明图/适配机制，不是生产检查，也不是旧传输校准 Task。

### 图组合、来源和真实停止（D-AC02）

图消费者的 6 组断言全部通过：

1. 规范等价对象与菱形路径共享一个节点调用，保留两条父边；两个独立节点
   同 code/brief 的问题都保留，第二次执行重新调用。
2. 实测最大在途数为 2，慢同层不阻断已就绪子项，启动遵守 FIFO；
   反向完成顺序得到相同完整报告。
3. 本地图在检查已开始后 abort，清理 Promise 释放前外层未结束，
   迟到 children 未触发调用。
4. Bundle 通过为叶；失败与本地问题共存、保留原 child-only code、
   Bundle CID、真实 output CID 与源节点身份。共享远程节点只提交一次，
   子报告不重新导入父图，文档从实际 output 读取且字节与子 Bundle 资源一致。
5. 图取消发生在远程 checker 的 started 文件已写出之后；端口取消 Task，
   cleaned 文件真实存在，Run 为 stopped 且 reclaimed=true 才返回拒绝。
6. 独立兄弟抛错触发同样的远程在途取消、finally 清理和物理回收；
   首个兄弟故障保留，没有正常完整报告或遗留运行。

受控 Bundle 共启动 4 个实际 Task/Run：2 个正常完成、2 个运行中停止，
全部确认回收；没有用启动前取消冒充在途取消。

三个制品共 11 个独立场景满足预期：4 个正常通过、5 个正常不通过、
2 个执行故障，11 个实际 Run 全部回收。工具链验证缺 npm 只剪掉依赖关系、
低版本仍报告独立 registry 不匹配；TypeScript 验证安全缺失诊断、非法路径，
确定性版本验证普通/npm 通过、多问题失败及坏成员剪枝/独立根发现。
所有正常报告通过公共 validateCheckReport；references 和所需 assets
从真实 output CID 读取，字节与 CAR 资源一致；受检目标前后快照不变。
Engine 关闭后调用方 IpfsStore 仍能读取，最后由所有者关闭。

### 范围和迁移说明（D-AC03）

环境为 Windows x64、Node 26.13.1 / pnpm 11.28.12；工具链仅使用自有 Node
和 npm 11.20.0 原样副本、隔离配置。未更改共享工具、宿主 registry、授权目标
或执行任意目标 scripts。受控 fixture 不代表新增 Unix/其他架构或线上支持。

新公开接口及 `check-report/v2` 是显式协议迁移；历史无版本报告、旧 callback、
`$root`/type-selector DFS 接口不能被假定兼容。SDK tarball 仍是同版本
`0.1.0-rc.1` 的本地未发布源码候选，不代表 registry 已发布字节发生变化；
两个新生产 CAR 必须通过其准确 CID 显式选择。
生产 TypeScript 的官方实时元数据全通过不在此离线验收声明内；
确定性元数据 CAR 和受控 v2 Bundle 始终单独标识。

当前上游 Worker invokeTask 的 output envelope/单次取消限制仍存在：
完成的是明确调用方宿主端口适配，不是自动 Worker 适配。没有引入 CPS、
跨执行缓存、通用 DAG join 或 Cloudflare 专项迁移，也没有 npm 发布、
远程上传/pin 或部署。旧 DFS Idea 和历史证据未修改。
监督会话复核上述结果后，依据用户委托审批准确的最终 Outer revision。
