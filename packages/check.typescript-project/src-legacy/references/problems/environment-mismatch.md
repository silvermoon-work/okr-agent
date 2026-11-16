# 环境声明不满足

根 .node-version 必须精确匹配官方索引中最高 SemVer 的稳定、发行标 LTS 且当前官方 schedule 仍支持的发行版；仍维护的旧 LTS 或同系列旧 patch 也不满足。所选开发 Node 必须能运行成员与开发工具。monorepo 所有适用代码包（包括 private）的 engines.node 解析最低 SemVer 必须一致；完整范围可不同，但不能排除开发版本。纯聚合 manifest 不参与，单代码包不产生跨包比较。缺失或非法声明各自报告，前置不完整时不追加派生最低值/矩阵差异。brief 列出相关 package.json 路径、原范围及 minVersion，不自动提高下限、修改声明或缩窄兼容承诺。消费者最低 Node 不必运行所有现代工具；开发最新 LTS 与消费者 runtime 独立。根据实际值、要求版本、来源和时间复验，不自动切换宿主工具。
