# 发布保护不满足

根据准确 workflow/job 修复确定的不安全配置。只允许 stable/latest 和 rc/rc；禁止批量发布、长效 npm
token 或省略 channel。发布须使用 Trusted
Publishing、显式 environment 与 id-token:write，并保护唯一包身份及同一 tarball。不实际发布或移动标签。
