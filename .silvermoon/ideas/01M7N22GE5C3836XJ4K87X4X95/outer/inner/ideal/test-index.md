# 验收场景索引

本索引由主 Agent 根据用户的全部门限审批委托审阅确认。每项的完整条件见[文字用例](test-spec.md)，测试结果不写回此索引。

| ID | 分类与场景 | 环境 | 阶段 |
| --- | --- | --- | --- |
| T-01 | 短 ID 日期、宽度、随机、排序与碰撞 | 隔离文件系统/受控时钟与随机源 | Implementation |
| T-02 | config、内容语言与错误输入 | 隔离用户 home / Git 仓库 | Implementation |
| T-03 | 新旧目录隔离、无 guidance、无 ledger | 混合历史 fixture | Implementation |
| T-04 | 五次 sign off、独立索引、完整支持内容 | 受控 Git primary 与 worktree | Implementation |
| T-05 | 修订回退与下游签字/证据失效 | 已实施/部署的受控 fixture | Implementation |
| T-06 | 草稿审核与提交/primary 推进边界 | 本地 bare primary + clone | Implementation |
| T-07 | Device → Project → Idea 前置阻断 | 受控 CLI / skill / home / Git | Implementation |
| T-08 | Events replay、追加、并发、重试与授权声明 | 隔离文件系统与进程 | Implementation |
| T-09 | Evidence 准确性、覆盖、版本与环境 | 实现/部署证据 fixture | Implementation |
| T-10 | Engine 新鲜观测、取消释放、业务结果与故障 | 实际 CAR / Engine | Implementation |
| T-11 | ContentRef、离线内容、缺块及呈现 | 实际 CAR / IPFS Store | Implementation |
| T-12 | CLI 命令与 audience / JSON 一致性 | 候选独立命令进程 | Implementation |
| T-13 | 新 Idea CID 固定与历史内容错误 | 两个规则版本的隔离 fixture | Implementation |
| T-14 | 构建、typed lint、格式、类型、90% 覆盖、publint | 完整 workspace | Implementation |
| T-15 | npm 准确版本交付及 registry 独立安装 | 授权的 npm / CI / 干净安装目录 | Deployment |
| T-16 | 发布版全流程与旧环境保持不变 | 发布后独立 Git fixture | Deployment |
