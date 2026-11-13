# 覆盖率配置不满足

问题列出未声明或无效的项目门限、未纳入 include 的源码或被 exclude 排除的源码。branches、functions、lines、statements 四项全局门限必须由项目显式声明为有限的 0..100 百分比；Check 不规定统一最低值，合法数值不因低于某个固定比例而失败。未触达源码仍参与统计，不使用当前报告分数代替配置；固定覆盖率入口须执行项目声明的门限。

共享 Vitest 配置的 include/exclude 按成员实际执行 root 解释，而非配置文件目录。证据列出配置来源、成员、实际 root、include/exclude 和适用源码；共享根因合并列出全部影响成员，独立差异保留。
