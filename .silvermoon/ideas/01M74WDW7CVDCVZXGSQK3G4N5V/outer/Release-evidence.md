# 发布与外部验证记录

## 当前状态

用户已将版本要求改为两包均发布 0.1.0-rc.0，后续 rc.1、rc.2 递增，不再发布 canary；RC 使用仓库现有 next
dist-tag，不更新 latest。RC 已通过本地 pnpm
check、两包 tarball 的 publint、两次独立 Trusted Publishing 和 office-ubuntu
registry 安装后的真实 Engine smoke。原身份配置阻塞已解除；最终部署证据见
[Registry-smoke](Registry-smoke.json)。

## 首次发布阻塞（已解决的历史记录）

用户修订前，已在通过 exact-commit
CI 的 ccda8c4e8720bf0f797ae870da749e345ffd8c30 上创建并推送 SDK 的旧 canary
release tag；未创建 Builder canary
tag。该 tag 不移动、不删除，也不重跑旧版本发布。

[发布工作流 43020564299](https://github.com/silvermoon-work/okr-agent/actions/runs/43020564299)
完成了身份/版本、main 可达性、exact-commit
CI、构建、单次打包、artifact 校验和 publint，但最终 npm
publish 返回 ENEEDAUTH，要求身份认证，发布失败。查询时工作流已结束，因此取消请求无法取消已完成运行；不能声称已取消或已发布。

GitHub 的 npm
environment 已创建，未使用或新增存储 token。恢复发布需要 npm 侧为这两个包建立可用的 Trusted
Publisher：GitHub
owner 为 silvermoon-work，repository 为 okr-agent，workflow 为 publish-npm.yaml，environment 为 npm，并允许 npm
publish。GitHub 环境存在不代表 npm 侧已建立信任，不能通过更换版本或绕过身份校验解决。

在身份配置没有变化时，不盲目重复触发相同的发布失败；SDK 成功发布并验证 registry 可见后才可发布依赖它的 Builder。未满足这些条件时不记录 submitOuter/acceptOuter，也不将 Idea 标记 completed。

## 远端准备

office-ubuntu 使用现有 Node 24.22.2 和 pnpm
11.22.0。专属临时目录已成功安装 registry 的 task-engine、task-engine-cli、task-builder-cli、task-protocol
0.1.0。没有修改全局旧 CLI，没有停止或复用其他服务。后续验证必须使用该目录的 node_modules/.bin，而非 PATH 中旧 canary
CLI。

## 首次 RC.0 tarball 补充验证

[RC exact-commit CI 43021241736](https://github.com/silvermoon-work/okr-agent/actions/runs/43021241736)
在提交 5b7d11cc582a715c07de87b110daf918f83f9422 上成功，覆盖 Node
22.13.0、24.11.1 和 Release verification (v1)。实现 revision
4edc0c07bbc5 经重新提交和委托验收后回到 deploying。

在发布身份阻塞未解除时，补充执行了 RC
tarball 的 office-ubuntu 安装 smoke，结果见
[Remote-smoke](Remote-smoke.json)。来源显式标为 local-tarballs-not-registry，不以文件包替代 registry 已发布声明。

验证过程：安装 RC.0 两包及正式版上游，init 两个 Check 项目，在 CLI 外修改参考文档、加入附属文本资源，并对故障版本注入 reportProblem 后抛错。每个项目通过类型检查和一次完整 build，交付标准 Bundle/CAR。显式启动专属 task-engine
0.1.0 Server，在独占端口运行通过、不通过和故障输入。

- 通过与不通过均正常 succeeded，业务结果分别 pass:true 和 pass:false。
- 故障为 failed，未被包装成普通 problem 结果，也没有正常输出 outputCid。
- 另一个独立标准 Task 通过 context.space(outputCid) 实际读取整体标准、问题标准和附属资源，验证引用文本与附件字节。
- 专属 Server
  readiness 已验证，测试后 stop 返回 stopped，随后 status 再次确认 stopped，专属临时目录已删除；未修改或停止共享服务。
- 当时两包 registry 查询仍为 E404，发布身份问题未解除；该次测试仅完成 D-AC02 的远端执行证明，不能替代后续 D-AC01
  registry 验证。
- 远端 npm 安装另报告 2 项 moderate advisories；没有运行自动 audit
  fix 或擅自改变已确认的上游依赖版本。

## 占位与信任配置完成后的正式发布

用户确认已发布两个占位包并配置 Trusted
Publisher 后，重新观测到两包 latest 均为 0.0.0、待发布版本不存在。使用通过上述 exact-commit
CI 的同一提交分别创建两个不可变 RC tag：

| 包                                  | Release tag                    | 发布工作流                                                                           |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| @silvermoon-work/check-task-sdk     | check-task-sdk-v0.1.0-rc.0     | [43023721100](https://github.com/silvermoon-work/okr-agent/actions/runs/43023721100) |
| @silvermoon-work/check-task-builder | check-task-builder-v0.1.0-rc.0 | [43024218167](https://github.com/silvermoon-work/okr-agent/actions/runs/43024218167) |

先完成 SDK 发布，并等待 npm 处理完毕、准确版本可查询后，才发布依赖它的 Builder。两个单包流程均成功执行 main 可达性、准确版本、exact-commit
CI、构建、单次打包、artifact 校验、publint 和 npm OIDC
publish。没有重试旧 canary
tag、移动任何 tag、使用存储 token 或发布其他工作区。Builder 的已发布 SDK 依赖准确为 0.1.0-rc.0。发布后的两包 next 均为 0.1.0-rc.0，latest 均保持 0.0.0。

## Registry 安装后的独立消费验收

在 office-ubuntu 新建专属临时目录，使用 npm 从该设备现有 registry 安装两包的精确 RC.0 版本及上游 CLI
0.1.0。没有传入本地 tarball、workspace
override 或本机源码链接，并显式取消 fallback 环境变量。

使用已安装的 check-task-builder 初始化正常及故障项目，作者在 CLI 外编辑文档、附件和检查源，安装项目依赖后分别执行类型检查和一次 build。随后启动隔离的 task-engine
0.1.0 Server 并验证：

- 通过任务 succeeded 且 pass:true；不通过任务也 succeeded，pass:false 且问题字段仅 code/brief/documentation。
- 先报告问题再抛错的任务 failed，不返回普通不通过结果或正常输出 CID。
- 两个独立标准 Task 从各自输入的 outputCid 实际读取整体标准、问题标准和附属文本资源；文档路径和附件字节均符合预期。
- 独立 Server
  readiness、测试后 stop 和再次 status 均核实；最终状态 stopped，专属临时目录已删除，无共享服务变更。

完整精确任务身份、版本、registry integrity 和输出 CID 已归纳到
[Registry-smoke](Registry-smoke.json)。本次证据同时满足 D-AC01 和 D-AC02，不再依赖此前 tarball 补充测试。npm 安装仍提示 2 项 moderate
advisories；未运行自动 audit fix 或更改已发布不可变 RC.0。

## 委托部署门限判断

主 Agent 按用户明确授权完成部署审查：两个单包发布、实际 registry 消费、三类检查结果、输出资源读取与资源回收的证据均成立，可为同步后的精确 deploymentRevision 提交并记录 acceptOuter。该判断不代表通用生产安全审计或任何未请求的上游能力验收。
