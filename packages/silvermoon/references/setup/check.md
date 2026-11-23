# Silvermoon 设备就绪检查

`silvermoon check-setup` 检查当前设备的全局安装、个人 skill 链接和个人配置。
不要求位于 Git 仓库内，不发现或读取项目，不访问 primary 或 registry。
本 Task 与 Project、Idea Task 复用同一个 global 检查点实现。

通过只代表本次观察设备准备就绪，不初始化项目、不创建 Idea，
也不自动安装、升级、链接 skill 或修改配置。
未通过时按报告在已有授权范围内修复，再重试原命令。
`silvermoon get-reference <cid>` 可以读取本 Task 的参考文档。
