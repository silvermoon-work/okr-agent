# CI 配置缺失

没有受支持的 GitHub Actions
YAML。若使用其他等价 CI，需要扩展静态支持，而不是用最近 CI 成绩替代配置证据。

brief 为 `jobs.<id>: required job`
时，固定质量工作流缺少该必需 job。按标准资产补齐整个 job；缺失 job 只报告一次，补齐后才会检查其名称、运行环境、步骤和矩阵。
