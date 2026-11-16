# 有限 Cloudflare profile

仅根交付清单中 `type: cloudflare`
的根包/真实成员适用本专项。保持单一 Check、闭合输入、通用质量门禁和 npm 保护；不新建包、不执行目标代码、不调用 Cloudflare 账户或资源 API。

只读 JSON/JSONC、明确资产目录和 ESM 模块入口、同 Worker 本地 DO 的命名导出及
`new_sqlite_classes`
创建关系。纯资产没有 main、binding、DO 或 Workers 测试插件要求。其他版本/形态准确无法确认，配置证据不冒充运行或部署结果。

当前审阅版本为 Wrangler 4.162.0、Workers Vitest 插件 1.8.2。Wrangler 的
`engines.node` 为 `>=22.12.0`；插件的 Vitest peer 范围为
`^4.1.0 || ^5.0.0`，且其依赖声明锁定同一 Wrangler 版本。Istanbul 与实际 Vitest 版本须一致。目标的声明/catalog 与准确 lock
importer 必须一致；不从目标 node_modules 执行工具来确认版本。本 Check 自身不安装这些工具，也不执行插件依赖中的 miniflare。

字段分类对照该 Wrangler 版本发布包内 `config-schema.json` 的
`RawConfig`（`additionalProperties: false`），不执行 Wrangler。实际解释的只有
`name`、`compatibility_date`、`compatibility_flags`、`main`、`assets`、`durable_objects`
和
`migrations`。`$schema`、`account_id`、`workers_dev`、`preview_urls`、`routes`、`route`、`minify`、`observability`
等已审阅普通 metadata 可以出现，但其值不被解释，也不证明路由、缓存、可观测性或部署。其余 schema 字段（包括
`env`、`vars`、`vectorize`、`ai`
和其他资源 binding、环境、模块或构建系统）以及 schema 之外的字段均为无法确认。

Worker/DO 使用可读的本地 Cloudflare.Env 生成声明并纳入有效 tsconfig；检查名称关系，不证明生成器刚执行。测试只识别字面量
`cloudflareTest({ wrangler: { configPath } })`，使用 Istanbul 并保留全部覆盖率阈值及未测试源码。普通 Node/前端配置仍按既有通用规则验证。

官方依据：[Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/)、[assets](https://developers.cloudflare.com/workers/static-assets/binding/)、[types](https://developers.cloudflare.com/workers/languages/typescript/)、[Workers Vitest](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)、[coverage limitations](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/)。
