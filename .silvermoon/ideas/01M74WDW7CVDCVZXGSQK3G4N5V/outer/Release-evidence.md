# 发布与外部验证记录

## 当前状态

用户已将版本要求改为两包均发布 0.1.0-rc.0，后续 rc.1、rc.2 递增，不再发布 canary；RC 使用仓库现有 next
dist-tag，不更新 latest。RC 已通过本地 pnpm
check 和两包 tarball 的 publint；尚未宣称 npm 发布成功。

## 首次发布阻塞

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
