# npm 发布流程缺失

非 private:true 的实际 npm 交付目标需要固定 release/release-dry-run 入口、scripts/lib/npm-publish.mjs 及标准 workflow，不要求独立 release.config.json。按 brief 的准确缺失路径从 output
assets 安装固定标准，并按实际职责选择[单包](../npm-publisher-v1.md#single-package)或[workspace](../npm-publisher-v1.md#workspace)配置，唯一映射真实目标身份；两者共用同一固定核心，无需无关 adapter。不允许自定义发布实现冒充标准。private 包不要求发布入口，也不得被发布；不能为消除问题执行真实发布。
