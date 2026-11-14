# 环境声明缺失

根 .node-version 声明精确默认开发 Node；代码成员自身 engines.node 声明运行范围。两者职责不同，不能用根 engines 替代成员声明。多个代码包缺少 engines.node 时合并为一条，brief 列出每个 package.json；逐个补齐即可。
