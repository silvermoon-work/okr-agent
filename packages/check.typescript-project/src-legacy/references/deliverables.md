# 显式交付项

仓库根 `silvermoon.yaml` 的 `deliverables` 是唯一对外交付意图来源，与
`.silvermoon/config.yaml` 生命周期配置无关。单独存在的
`private: false`、`publishConfig`、包校验脚本或 Wrangler 配置不推导交付意图。

```yaml
deliverables:
  - path: packages/sdk
    type: npm
    packageId: sdk
  - path: apps/web
    type: cloudflare
```

应用与库均须登记实际对外交付项；内部代码、未启用示例无需登记，不添加 `none` 或
`inactive`。没有交付项时可以省略文件或使用
`deliverables: []`；但省略文件而工作流含 npm/pnpm 发布步骤或成员含 Wrangler 配置时，只报告一次 missing 并列出这些交付迹象，此时不再推导发布工作流、npm 交付元数据和平台配置，补上声明后这些检查才恢复。迹象不推导交付意图，显式
`deliverables: []`
即视为已声明。声明本身无效时同样跳过这些依赖它的检查。已声明后，`pnpm release`
入口/选择缺少对应 npm 声明时报告 missing；直接 `npm publish`/`pnpm publish`
由发布域统一报告为不匹配，不再另行推断其发布目录。不自动补声明，发布器绝不选择未登记目标。

## 字段

- `path`：现存目录的仓库根相对明确路径，使用 `/`；根包可用
  `.`。拒绝绝对路径、盘符、反斜杠、空段、`.`/`..`
  子段、尾分隔符、glob 和重复路径。拒绝符号链接/重定向路径，不越出检查根。嵌套目录各自登记，不递归继承意图。npm/cloudflare 项须精确对应根包或真实 pnpm 成员，自定义类型不强加 Node 拓扑。
- `type`：`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`。开放自定义类型，不归一化名称，不执行附加字段。没有通用附加字段要求；未知类型不回退 npm，也不表示已验证其交付协议。
- `packageId`：仅 npm 类型必需，沿用已有唯一 `<package-id>-v<version>`
  标签 ID，满足
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`。目录与实际 manifest 唯一匹配，npm 名称读取 manifest，不复制名称或版本。

无 `schemaVersion`；当前根只支持
`deliverables`。重复 YAML 键、非法结构/字段值报告 mismatch，必填字段/目录缺失报告 missing，受限 YAML/路径/发布关系无法证明时报告 unconfirmed。文件受 1MiB 和 YAML
alias 预算限制；检查器仍使用自己的文件扫描/读取预算。

## npm 与其他职责

只有显式 npm 项承担 npm ESM
exports、files、源码/产物映射、publint 和固定 publisher 要求。npm 项为 private 时明确不匹配/拒绝发布，不能靠声明移除保护。普通、Cloudflare 和自定义类型的适用代码/测试仍接受 strict、类型感知 lint、格式、单次测试和覆盖率门禁。

`cloudflare`
只登记一个应用 Package 对应一个 Workers 部署单元的意图，资产、服务端和多个 DO 均可选；本阶段不验证 Wrangler、bindings、DO、运行或部署，不扩展既有 tsconfig/Vitest 支持范围。未知配置继续无法确认。

## 迁移

新版拒绝旧 `scripts/lib/release-packages.mjs`、`scripts/release-packages.js` 或
`release.config.json`，不导入/执行、不回退，也不容许并行选择来源。先核对真实交付职责、manifest 名称与旧标签 ID，再将真实 npm 项迁入根清单并移除旧数据，原子升级固定标准和消费副本；旧 CAR 保持旧版本行为，不会自动更新。

历史 private 示例映射不等于启用目标。本仓库只迁移
`check-task-sdk`、`check-task-builder` 的准确 ID/name/path；core 仍是 private
preset 示例，不登记、不发布、不解除 private。当前清单中 `task-bundle`
是两个现有私有 Check 作者包的自定义交付分类，仅登记既知 Bundle/CAR 产物职责，不定义 IPFS/Pinboard 协议或执行分发。

安装 [deliverables.mjs](../assets/deliverables.mjs) 为各固定命令所在
`scripts/lib/deliverables.mjs`；与 commands/publisher 一样逐字验证（仅统一换行）。固定检查器只读目标；标准命令/发布器实际执行自己的既有获准职责，交付声明不构成发布授权。全部准确版本、SHA/CI、Trusted
Publishing、单包/单次 pack/同 tarball 等保护不变。
