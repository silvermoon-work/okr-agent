# npm 交付配置缺失

按问题补全实际 npm
ESM 交付包的身份、许可、入口、files、build 和 lint-package。private:true 包完全跳过 npm 发布/交付专项要求；纯聚合根没有 npm 交付职责时也不强加这些要求。通用质量及适用构建仍检查，不要为通过检查自动解除 private 保护。

若 brief 指出 `silvermoon.yaml`
未声明 deliverables 却观察到发布步骤或 Wrangler 配置，先按[显式交付项](../deliverables.md)登记真实交付单元；确实不交付时写
`deliverables: []`。在此之前，发布工作流、npm 交付元数据和 Cloudflare 平台检查不会运行，声明后可能出现新的后续问题。
