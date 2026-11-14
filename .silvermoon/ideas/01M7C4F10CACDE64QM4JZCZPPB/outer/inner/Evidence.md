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

## 前置关系收敛

本节对应 I-S04 与 I-AC04。采用的前置关系如下：

- 交付声明是发布工作流、npm 交付元数据、发布者 profile 和平台配置的前置。未声明但观察到交付迹象（wrangler 配置、`pnpm release*`、`npm|pnpm publish` 步骤）时，只报告一次 `delivery-missing`，并列出迹象。声明无效或无法确认时，同样跳过上述后置检查。`deliverables: []` 算作已声明。
- 必需 CI job 缺失只报告一次，不展开其字段。check job 有 `strategy` 时，由矩阵派生的 name、runs-on 和 setup-node 值不再报告。同一个改写环境的步骤只报告一次。
- 无效脚本名是孤儿入口和必需名称缺失的前置。冒号名可改为合法名称时，在同一条报告里给出改名建议。已被其他脚本以 `node scripts/<name>` 调用的入口不算孤儿。缺少 `packageManager` 和完全缺少 tsconfig 的情况，各由一个检查域报告。
- 锁文件、`.node-version`、tsconfig 和 Vitest 配置由通用检查域负责。它们缺失或有歧义时，Cloudflare 检查静默停止，不再复述。缺少 `pnpm-workspace.yaml` 仍由 `cloudflare-missing` 报告。

正反例测试证明：前置失败时后置结果被跳过，前置修复后后置结果重新出现。原有独立规则的测试仍然各自报告，没有放宽任何门禁。

2026-11-14 验证：

- 第一轮（前置关系）：CAR `bafybeierfq6ummrgxf25lp6bigu5knfuzztk4k3puzf2gfm344x3a24lda` 对 `D:\Code\pinboard` 只读复跑，问题总数从 110 降到 90。CI 从 25 条降到 9 条，delivery 和 release 从 3 条合并为 1 条 `delivery-missing`。dependency-mismatch 从 7 升到 10 是 registry 波动：上次 `typescript` 查询超时，依赖检查提前终止，本次没有超时，`typescript-eslint`、根目录 `vite` 和 `vitest` 的落后版本得以报告。
- 第二轮（同类合并与可判定语义）：同一 manifest 的 script 结构问题、缺少 `engines.node`、共用 catalog 的落后版本各合并为一条；Vitest 配置按 `vitest.config.*` 优先于 `vite.config.*` 读取；ESLint 花括号和忽略文件取反按真实规则判定；Vitest 不支持字段与未知 import 在诊断里点名。`pnpm --filter @silvermoon-work/check.typescript-project test-coverage` 的 25 个文件、604 个测试通过，四项覆盖率为 statements 93.92%、branches 90.45%、functions 98.80%、lines 94.79%。根目录 `pnpm check` 退出 0。
- 用 CAR `bafybeiges6ric6t2k5mfi5si2uadtx6532wxztzhftnpyf7vgiuufat2s4` 对同一项目只读复跑，问题总数 36（110 → 90 → 36）。gate 55 → 7（`gate-mismatch` 6 条按 manifest 各一条，`gate-missing` 1 条），environment 6 → 2，formatting-unconfirmed 1 → 0，lint-unconfirmed 1 → 0。复跑后 Pinboard worktree 无变更。
- 本轮新暴露的 `lint-mismatch` 是真问题：`apps/web` 有 `.tsx` 文件，ESLint 类型感知配置只覆盖 `**/*.ts`。它以前被无法确认挡住，不是新增误报。
- `testing-unconfirmed` 仍是 3 条，原因变了：`apps/web` 的 `vitest.config.ts` 引入 `@vitejs/plugin-react`，`apps/worker` 引入 `node:fs`，`apps/cli` 含 `test.hookTimeout`。`apps/web` 的歧义已消除，这条是之前被歧义挡住的真实不支持形态。

仍然保留、未在本轮处理的事项，包括去掉 `unconfirmed` 需要作为上游 Ideal 变更单独立项，已记录在 [诊断缺陷](../Diagnostic-defects.md)。
