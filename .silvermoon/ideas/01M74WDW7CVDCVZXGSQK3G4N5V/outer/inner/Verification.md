# 实现验证与委托验收依据

## 授权与边界

用户明确要求派一个 subagent 实现，由主 Agent 负责实现与部署门限审批、自主推进，并授权 canary 发布和 office-ubuntu 安装后 smoke
test。构想 revision
36a7d1745406 已记录 acceptIdeal 后进入 implementing。本文件记录主 Agent 的集成判断；部署证据未完成前不标记完成。

上游使用正式版 0.1.0；两个新包使用 0.1.0-canary-261111-1，仅计划发布到 canary
dist-tag。上游 task-engine-storage 未发布 0.1.0，不假定所有上游包同版本，不自行发布其依赖。

## 交付与对应证明

| 标准   | 实现及证明                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-AC01 | SDK 提供 createCheckContract、createCheckCallback、runCheck。输入和有限问题码由 TypeBox 同源定义，结果仅 pass/documentation/problems；受限 Context 显式选择只读 bundle/space、invokeTask、signal、log、progress，不暴露 output。SDK 依赖上游 task-sdk 0.1.0，无 builder 依赖。                                |
| I-AC02 | Builder 使用 ReadonlyFileTree 转换和上游 buildTaskBundle、CAR 编码器；不生成持久中间树。测试覆盖必需文档、未声明问题文档、大小写、无效 UTF-8、隐藏资源拒绝、二进制附件、init/build、CAR 部分交付与 --no-car。实际 published Engine 0.1.0 Worker 执行通过、不通过及先报告后抛错，并验证 outputCid 文档和回收。 |
| I-AC03 | 主 Agent 运行 pnpm check 成功：10 项发布测试、16 个 Turbo lint/typecheck/test/build 任务全部成功（此次命中缓存）；新 SDK 9 项、Builder 12 项测试通过。README、LICENSE、exports、bin、发布映射与 canary 标签规则已补齐。                                                                                       |

## 命令与观察

- `pnpm check`：退出 0；发布测试 10/10、工作区任务 16/16。
- `pnpm lint:release` 和
  `pnpm test:release`：退出 0，测试包含 canary.1 与 canary-261111-1 不被发布为 latest，保留其他 prerelease 的 next 行为。
- subagent 完成独立 tarball 的 publint 和安装消费验证；主 Agent 不将其替代部署阶段 registry 公开发布及远端验证。
- 独立消费命令为 `pnpm --dir .check-consumer install`、
  `pnpm --dir .check-consumer typecheck`、`pnpm --dir .check-consumer build`，随后将 smoke.mjs 复制到该目录并执行正常与 fault 两种模式。测试使用 SDK 本地 tarball
  override，无源 workspace 链接；专属 .check-consumer 与 .check-packs 已由 subagent 清理。
- 集成检查后补充附件字节验证：Builder 聚焦测试、lint、typecheck 再次通过，独立 smoke
  harness 比较输出包附件与 Bundle 的实际字节。
- office-ubuntu 前提核实：Node 24.22.2、pnpm
  11.22.0 可用；专属临时目录安装正式版 task-engine、task-engine-cli、task-builder-cli、task-protocol
  0.1.0 成功，未修改远端全局工具。

参考文档以完整子树收录，遵守上游点开头路径及 node_modules 的排除限制；出现不可收录路径时明确失败，不静默漏掉后声称完整。运行时文档链接或异常不会被转换成普通不通过。

## 后续门限

主 Agent 基于验证结果对确切同步 revision 做实现验收；canary 发布、office-ubuntu
registry 安装及实际 smoke 是独立部署标准，任何 npm 信任配置或外部条件故障均须明确记录为阻塞，不得标记通过。
