# 显式交付项

各包自己的 `deliverable.yaml` 是对外交付意图的唯一来源，与
`.silvermoon/config.yaml` 生命周期配置无关。不从 `private: false`、
`publishConfig`、包校验脚本或 Wrangler 配置推导交付意图。

例如在 `packages/sdk/deliverable.yaml` 中声明：

```yaml
type: npm
```

应用可在自己的包目录声明 `type: cloudflare`。单包仓库的文件位于根
`package.json` 旁；monorepo 每个交付包各自声明，私有聚合根无需登记。
不向子目录继承，不在文件中配置 `path`、`packageId` 或 `deliverables`。
路径由文件所在包决定，npm 名称和版本从同目录 manifest 读取。

内部代码、未启用示例无需文件。若观察到发布步骤或 Wrangler 配置却完全没有
交付声明，只报告一次 missing 并列出迹象，补上声明后恢复依赖交付选择的检查。
确有这类配置但不交付时可显式写 `type: none`，作为开放的非 npm 类型处理。
声明无效时也阻断其下游检查，不自动补声明或选择未登记目标。

## 字段与读取边界

- `type` 必需，满足 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`。开放自定义类型，
  不归一化名称，不执行附加字段。未知类型不回退 npm，不代表已验证其交付协议。
- 声明须位于根包或真实工作区成员内，不接受任意未登记目录作为发布目标。
  拒绝符号链接/重定向目录和声明文件，不越出检查根。
- npm 目标不能 private；完整 npm 名称必须有效且唯一，不维护独立发布 ID。
- 重复 YAML 键、非法结构或旧位置/身份字段报告 mismatch，必填字段缺失报告
  missing，受限 YAML/路径/发布关系无法证明时报告 unconfirmed。
  文件受 1MiB 和 YAML alias 预算限制；检查器仍使用自己的扫描/读取预算。

只有显式 npm 项承担 npm ESM exports、files、源码/产物映射、publint 和固定
publisher 要求。其他适用代码/测试仍接受 strict、类型感知 lint、格式、
单次测试和覆盖率门禁。Cloudflare 平台检查与部署职责保持原有边界。

## 发布身份与迁移

tag 使用 `<完整 npm 包名>@<manifest.version>`，例如
`@acme/sdk@1.2.3-rc.0`；无 scope 时为 `sdk@1.2.3`。
手动 `PACKAGE_INPUT` 使用完整名称 `@acme/sdk`，不带版本，仅允许 dry-run。
workflow 的 tag 过滤必须覆盖 `/`，标准采用 `tags: ["**@*"]`。

新版拒绝根 `silvermoon.yaml` 交付清单、旧 `scripts/lib/release-packages.mjs`、
`scripts/release-packages.js` 和 `release.config.json`，不执行、不回退，也不
容许并行选择来源。先核对真实交付职责，为各交付包创建声明，再移除旧数据并
原子升级固定标准、workflow 与消费副本。历史 tag、npm 版本和旧 CAR 不修改；
旧 CAR 不会自动获得新行为。

本仓库的四个 npm 包分别声明 `type: npm`；core 保持 private 且不登记。
两个私有 Check 作者包声明 `type: task-bundle`，仅记录既知 Bundle/CAR 职责，
不定义 IPFS/Pinboard 分发协议。

安装 [deliverables.mjs](../assets/deliverables.mjs) 为各固定命令所在
`scripts/lib/deliverables.mjs`，与 commands/publisher 一样逐字验证（仅统一换行）。
Check 只读目标；声明不构成发布授权。准确版本、SHA/CI、Trusted Publishing、
单包/单次 pack/同 tarball 等保护不变。
