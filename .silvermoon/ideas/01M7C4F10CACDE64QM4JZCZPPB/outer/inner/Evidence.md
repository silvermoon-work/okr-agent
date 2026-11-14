# 实现证据

## 版本与 schema

2026-11-14 只读核对 npm registry 与 Wrangler `4.162.0` 发布包内 `config-schema.json`，未把这些工具安装进本 Check，也未执行它们：

- `wrangler@4.162.0` 为当时 latest，`engines.node` 为 `>=22.12.0`。`RawConfig` 有 91 个字段，且 `additionalProperties` 为 false。
- `@cloudflare/vitest-plugin@1.8.2` 为当时 latest，peer 为 `vitest@^4.1.0 || ^5.0.0`，依赖声明锁定 `wrangler@4.162.0`。该依赖树包含 `miniflare@5.20261113.0-beta`；本检查不安装、不执行它。
- `@vitest/coverage-istanbul@5.0.4` 的 peer 为 `vitest@5.0.4`，与“Istanbul 版本必须等于实际 Vitest 版本”一致。

字段划分与 schema 一一对应、互不重叠：7 个解释字段，27 个只允许出现、不解释的普通 metadata，57 个超出 profile 的能力字段。schema 外字段报告无法确认。

## 行为

- 纯资产不要求 main、binding、生成类型或 Workers 测试插件；显式模块入口和同一 Worker 的多个本地 DO 按静态导出、`Cloudflare.Env` 与 `new_sqlite_classes` 对照。正例源码含抛错，检查不执行目标模块。
- `env`、`vars`、`vectorize`、额外模块图、schema 外字段，以及远端 DO、动态导出、非 Istanbul coverage 均不通过。`workers_dev`、`minify`、`routes`、`observability` 等已审阅普通 metadata 可以出现，但其值不被解释。
- npm、custom 和未登记包不进入平台检查。通用 strict 与覆盖率门禁在平台配置通过后仍然生效。

## 验证与未证明事项

2026-11-14 在此 worktree 运行：

- `pnpm --filter @silvermoon-work/check.typescript-project test-coverage`：25 个文件、588 个测试通过。四项覆盖率为 statements 93.92%、branches 90.56%、functions 98.78%、lines 94.76%。
- 最终 `pnpm check` 退出 0，包含格式、依赖序构建、类型、lint、覆盖率、发布回归、publint 和脚本检查。本会话的 Node 是 v26.13.0；仓库 `.node-version` 是 26.13.1。这次退出 0 不证明 26.13.1 已被实际执行。

未执行 Wrangler、Workers Vitest 插件、miniflare 或目标 Worker，未调用 Cloudflare 账户或资源 API，未证明外部消费、真实运行或线上部署。普通 metadata 的值语义不在本次证明范围内。
