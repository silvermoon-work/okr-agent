# 发布门卫无法确认

固定 publisher 的声明式配置、平台绑定或明确支持范围无法确认，按 brief 的准确路径、字段、观察值与要求处理。按真实职责选择[单包](../npm-publisher-v1.md#single-package)或[workspace](../npm-publisher-v1.md#workspace)参考，不按 workspace 文件存在与否猜测。两种适配共用同一严格核心；未知配置不是现有全部保护都不存在的证据。非标准文件缺失或不匹配分别报告 missing/mismatch，不列一大段任意自定义脚本内部未知。

质量 workflow 先报告标准结构差异；前置结构不符不追加派生矩阵/发布绑定未知，独立确凿发布配置缺陷仍保留。发布只能复用相同完整 SHA 的成功 main-push 固定质量 CI，缺失、运行中、失败/取消/跳过、不完整或查询失败均直接阻断，不补跑 check 或派发补跑，不接受 PR、其他 workflow/分支/SHA 成绩。

不能通过重新跑发布内全套 CI、猜测 registry
404 或历史快照豁免这些要求。实际权限与制品需要独立发布验证；本 Check 不执行发布。
