# 实现验证与委托验收依据

## 授权与边界

用户明确要求派一个 subagent 实现，由主 Agent 负责实现与部署门限审批、自主推进，并授权预发布和 office-ubuntu 安装后 smoke
test。构想 revision
36a7d1745406 已记录 acceptIdeal 后进入 implementing。用户后续修订发布要求：两包均使用 0.1.0-rc.0、后续 rc.1/rc.2 递增，使用 next
dist-tag，不更新 latest；此前 canary 发布计划已被取代。上游使用正式版 0.1.0，不假定所有上游工作区同版本，不自行发布其依赖。本文件记录主 Agent 的集成判断；部署证据未完成前不标记完成。

## 交付与对应证明

| 标准   | 实现及证明                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-AC01 | SDK 提供 createCheckContract、createCheckCallback、runCheck。输入和有限问题码由 TypeBox 同源定义，结果仅 pass/documentation/problems；Context 显式选择只读 bundle/space、invokeTask、signal、log、progress，不暴露 output。SDK 依赖上游 task-sdk 0.1.0，无 builder 依赖。                                     |
| I-AC02 | Builder 使用 ReadonlyFileTree 转换和上游 buildTaskBundle、CAR 编码器，不生成持久中间树。测试覆盖必需文档、未声明问题文档、大小写、无效 UTF-8、隐藏资源拒绝、二进制附件、init/build、CAR 部分交付与 --no-car。实际 published Engine 0.1.0 Worker 执行通过、不通过及先报告后抛错，并验证 outputCid 文档和回收。 |
| I-AC03 | RC.0 的 pnpm check 通过：10 项发布测试、16 个 Turbo lint/typecheck/test/build 任务全部成功（8 项命中缓存）；SDK 9 项、Builder 12 项测试重新执行通过。README、LICENSE、exports、bin、发布映射与 RC next 标签规则已补齐。                                                                                       |

## 命令与观察

- `pnpm check`：RC.0 版本退出 0；发布测试 10/10、工作区任务 16/16。CLI
  init 生成依赖版本和 --version 测试均已更新到 0.1.0-rc.0。
- `pnpm lint:release` 和
  `pnpm test:release`：通过；按修订要求移除本仓库的 canary 特例，检查 rc.0/.1/.2 使用 next，不更新 latest。
- 两包 RC.0 各打包一次，分别运行 publint，均返回 All good。
- subagent 完成初始版本独立 tarball 的安装消费验证，命令为
  `pnpm --dir .check-consumer install`、`pnpm --dir .check-consumer typecheck`、
  `pnpm --dir .check-consumer build`，再复制并执行正常与 fault 两种 smoke 模式。测试使用 SDK 本地 tarball
  override，无源 workspace 链接；专属 .check-consumer 与 .check-packs 已由 subagent 清理。此记录不替代 RC 的部署阶段 registry 安装验证。
- 补充附件字节验证后，Builder 聚焦测试、lint、typecheck 再次通过；独立 smoke
  harness 比较输出包附件与 Bundle 的实际字节。
- 首次实现提交 ccda8c4 的 CI 43020158281 在 Node 22.13.0、24.11.1 及 Release
  verification
  (v1) 全部成功；版本切换后的新提交仍须独立 CI，不把旧提交成功冒充新提交证据。
- office-ubuntu 前提核实：Node 24.22.2、pnpm
  11.22.0 可用；专属临时目录安装正式版 task-engine、task-engine-cli、task-builder-cli、task-protocol
  0.1.0 成功，未修改远端全局工具。

参考文档完整子树收录遵守上游点开头路径及 node_modules 的排除限制；出现不可收录路径时明确失败，不静默漏掉后声称完整。运行时文档链接或异常不会被转换成普通不通过。

## 后续门限

主 Agent 基于验证结果对确切同步 revision 做实现验收；RC 发布、office-ubuntu
registry 安装及实际 smoke 是独立部署标准，任何 npm 信任配置或外部条件故障均须明确记录为阻塞，不得标记通过。
