# Deployment

用户已明确授权本次发布两个包的 RC，并连接 office-ubuntu 进行安装后的 smoke
test；主 Agent 负责部署门限决策，证据不足时不得宣称 complete。不以实施测试替代独立 registry 消费结果，不更新 npm
latest，不发布上游或旧包 deprecation。

本阶段须在实施验证和对应门限完成后开展；先将本契约同步到 primary，再对该版本执行发布和远端验证。

## Steps

### D-S01: 准备独立消费环境

使用上游 Task
Engine 正式版 0.1.0。为两个明确映射的包分别发布 0.1.0-rc.0，沿用预发布 next
dist-tag，不更新 latest；后续版本按 -rc.1、-rc.2 递增。如该版本已存在则停止而非覆盖。先发布 SDK 并验证 npm 可见，再发布 Builder，内部依赖版本必须已在 npm 存在。仅发布可从 main 到达且 exact-commit
CI 成功的提交，使用 Trusted
Publishing，打包一次并校验、发布同一 tarball。release
tag 不可移动，不使用存储 token。

### D-S02: 执行独立作者到引擎闭环

通过 office-ubuntu 的现有 Node 24.22.2 和 pnpm
11.22.0，在本次专属临时目录安装已发布的两包及 task-engine-cli
0.1.0，遵循远端 registry 配置，不修改用户全局安装或共享服务。按交付文档初始化、外部编辑并一次构建，交由独立 Engine 执行真实 check，验证通过、不通过、执行故障以及 outputCid 下参考文档和附属资源可读。记录命令、版本、制品身份和实际输出；停止本次创建的 Engine，仅清理本次拥有的临时路径，不触碰共享环境和旧历史。

若 registry 发布被 npm 身份配置阻塞，可补充 RC
tarball 的远端安装验证以排查代码问题，但须标注来源为 local-tarballs-not-registry，不据此勾选 registry 消费标准或完成 Idea。

## Acceptance criteria

### D-AC01: 独立消费不依赖作者工作区

两个单包发布工作流成功且版本与 next 标签可核实；office-ubuntu 使用 registry 安装而非本地 tarball 或 workspace 替代，完成初始化、编辑、类型检查和构建，无源工作区隐式解析。证据明确上游版本为 0.1.0，新两包均为 0.1.0-rc.0，latest 未被本次发布更新。

### D-AC02: 引擎结果与资源证明完整

远端独立 Engine 实际执行标准制品，观察通过、不通过、执行故障及资源读取；业务 JSON 中的 documentation 路径可结合最终 outputCid 读取参考标准及附属资源。证据关联准确制品和依赖版本，确认专属 Engine 已停止，不遗留共享端口上的进程；如发布信任配置、远端安装或执行不可用，明确记录阻塞，不标记验收通过。
