# 无法确认覆盖率配置

工具版本、provider、分 glob 阈值或动态语法超出支持范围。仅验证已声明 Vitest
4.x/5.x 的有限语义，不会安装工具或执行覆盖率采集。

静态支持 coverage.autoAttachSubprocess 的 boolean 值 true/false；此选项可缺省，不强制启用。非 boolean 报告字段和值，其他未知字段仍无法确认。子进程采集选项不等于已启用覆盖率、不证明源码映射正确，也不替代源码 include、未触达文件统计及四项合法门限检查。
