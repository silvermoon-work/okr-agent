# Node.js 工具链检查独立 CAR 交付验证

本阶段交付准确 CAR/CID 与消费说明，不发布作者 npm 包、不上传或 pin 到外部存储。目标制品为
`bafybeiahk52evmukio5wr7nkomvab4ujmk3yxzss4pxbaqlz57rmmc2yxe`；已接受实现的真实平台范围为 Windows
x64、Node/npm、pnpm 10.22/11.22、nrm 1.2.6 与官方 portable nvm-windows
1.2.2。Unix 不作支持声明，原宿主故障 nvm 不声称已修复。

## Steps

### D-S01: 准备独立消费环境

在仓库外消费准确 CAR 制品，按实施确定的支持矩阵准备真实 Node.js 工具环境；环境准备与 Check 执行分离，不修改共享机器的全局工具选择。

将 [consumer.package.json](./consumer.package.json)
作为独立目录的 package.json，仅安装已发布 Engine/Builder
0.2.0-rc.0 与标准 exporter；复制 [consumer.mjs](./consumer.mjs)
和准确 CAR。独立目录不得链接作者包、SDK、源码或仓库 node_modules，宿主显式选择本机授权上下文。

### D-S02: 验证真实工具链要求

在独立环境导入并运行交付 CAR，验证工具、配对、nvm 管理及 npm/pnpm/nrm 配置要求，保留准确制品身份和执行证据。

独立 consumer 必须验证 Node-only、Node/npm 配对与用户 registry、显式 registry 覆盖、多问题不通过及执行故障，并按输出 CID 逐字节读取中文文档。对同一准确 CAR 再复验已经声明的平台组合与 nvm 正反例；测试仅使用隔离配置和真实工具，不安装或切换共享工具。

### D-S03: 记录交付结论与限制

记录 CAR/CID、独立消费结果、导入/pin/消费说明、平台覆盖和未验证范围。首版不配置或执行 npm 发布，也不未经授权上传或 pin 到外部存储。

证据文件只记录实际结果，不保存秘密或完整用户环境。独立消费验证的是本地离线 DAG 可获取与运行，不冒充远端 IPFS 可用；制品与复现文档须持久可用。

实际交付身份、复现步骤、23 个真实 Engine 场景及支持限制见
[Delivery.md](./Delivery.md) 与同目录三个原始 JSON 报告。

## Acceptance criteria

### D-AC01: 仓库外可独立消费

记录证明准确 CAR 无需本仓库源码、作者 npm 包或隐藏依赖，即可导入并通过真实 Engine 执行，根 CID 一致且输出文档可读取。

### D-AC02: 已声明平台具有真实证据

对声明支持的平台与 nvm 实现保留实际管理、配置覆盖和不满足场景证据；未运行组合明确列为未验证，不以模拟测试代替。

### D-AC03: 交付与授权边界清楚

记录可复用的 CAR 消费入口、制品身份和限制，检查未修改环境。区分本地验收与外部 IPFS 可用性，不将未上传制品声称为远程可用；作者包保持私有，不发布 npm。
