# 第一阶段实现证据

## I-S01 / I-AC01：唯一交付意图

- `packages/check.typescript-project/assets/deliverables.mjs` 是作者检查器、固定命令与 publisher 共享的声明解析/路径/映射实现；检查器只导入作者资源，不加载目标副本。
- `src/deliverables.ts` 将根声明绑定到精确代码包职责，区分 missing/mismatch/unconfirmed；明确发布入口、静态目录或 package ID 选择未登记时报告缺失，动态目录不推测通过。
- `test/deliverables.test.ts` 覆盖文件缺省/空列表、单包 `.`、开放类型及惰性附加字段、嵌套/重复/逃逸路径、非法名称、必填字段、YAML 错误/alias 预算、目录缺失/非目录/重定向、旧来源冲突、发布选择/继承配置和声明被忽略等行为。目标源码、测试和 build 故意含抛错内容，检查仍不执行它们。
- 根 `silvermoon.yaml` 明确登记两个真实 npm 包和两个已有私有 Check 作者包；后两者使用自定义 `task-bundle` 分类，仅说明 Bundle/CAR 交付职责，不定义 IPFS、Pinboard 或任何自动分发协议。

## I-S02 / I-AC02：职责分流

- `src/inspect.ts`、`convention.ts`、`script-profile.ts`、`publisher-profile.ts` 及 `release-evidence.ts` 使用新声明；不再从 private、publishConfig、lint-package 或 Wrangler 文件推导 npm 交付意图。
- npm 项承担既有 ESM 身份、exports/files/映射与固定发布检查；private npm 项明确失败。普通 TypeScript、Cloudflare 和自定义项不套用 npm 专项，但不豁免源码/测试 strict、type-aware lint、格式、测试、覆盖率及通用构建检查。
- `test/publisher-profile.test.ts`、`publisher-guards.test.ts`、`script-profile.test.ts` 与新增交付回归共同验证单包/工作区选择、未知选择拒绝、publint 只调度显式 npm 项和所有原有纯发布门卫。
- 未引入多 tsconfig 图解释、Workers/Vitest 配置解释器、Wrangler、bindings、DO 或部署实现；不把平台意图识别当成平台专项通过。

## I-S03 / I-AC03：迁移与保护

实际新映射只包含：

| packageId | 真实 manifest name | path |
| --- | --- | --- |
| check-task-sdk | @silvermoon-work/check-task-sdk | packages/check-task-sdk |
| check-task-builder | @silvermoon-work/check-task-builder | packages/check-task-builder |

原 `scripts/lib/release-packages.mjs` 已移除；新版不回退旧模块或 release.config.json。历史数据解析函数仅保留为离线迁移诊断，不参与当前目标选择。历史 `legacy-release.mjs` 元数据入口也改读同一清单，无独立目标数组。

core 仍为 private、版本 `0.0.0` 的 preset 示例，不在清单中，不增加 inactive，不解除 private，也不被 publisher/publint 选中；`apps/example` 的 workspace 依赖不变。核对 SDK/Builder 现有 ID/name/path 均未改变。

固定 `commands.mjs`、`deliverables.mjs` 的七处消费副本已与作者资源作 SHA256 一致性核对；根 publisher 副本同样一致。固定字节验证新增必要 helper，不能通过替换解析器获得通过。根/包清单、依赖锁文件、AGENTS、四项覆盖率阈值及工作流保护配置均未改动；未安装或升级依赖。

publisher 的本次行为差异限于声明来源和候选选择：准确版本/标签、manifest/artifact 身份、单包显式选择、main 祖先、准确 SHA main-push CI 的全部矩阵/聚合、RC 连续历史、已存在版本/依赖检查、Trusted Publishing、禁钩子单次 pack、同一 tarball 哈希校验及 dispatch 只 dry-run 的实现保持。

## 验证结果与限制

2026-11-14 在此 worktree 完成：

- `pnpm --filter @silvermoon-work/check.typescript-project typecheck`、`lint`、`build` 均退出 0。
- `pnpm --filter @silvermoon-work/check.typescript-project test-coverage`：22 文件、478 测试通过。四项全局覆盖率为 statements 93.22%、branches 90.03%、functions 98.61%、lines 94.05%，原 90% 门禁全部实际执行并通过；新增 `src/deliverables.ts` 行/语句/函数 100%、分支 96.82%。
- 最终 `pnpm check` 退出 0：格式、依赖序构建、类型、lint、全部代码包覆盖率、13 项原 JavaScript 发布回归、SDK/Builder publint 和脚本 lint 全通过。工具链的 4 项既有 native 测试仍按原策略跳过，未改动测试策略。
- `git diff --check` 通过；固定资产消费副本一致。获准 ideal、第二阶段 Idea、外层 Deployment 契约均未修改。

实际环境为 Node `26.13.0`、精确 pnpm `11.28.12`。固定 Node 要求 `26.13.1`；只读查看已有本地 nvm 目录仅发现 `24.12.0` 与 `26.13.0`，未找到固定版本。未切换/安装全局 Node，未修改共享全局环境；上述成功不表示已在固定 Node 下验证。

根 check 的必要本地构建生成 `packages/check.typescript-project/dist/typescript-project.car`：

- CID：`bafybeidwniqa77leuzpddh56ln4zyyxbz5z3vn66emoqtpn6bk5z33ya4i`
- SHA256：`7d80c258d37f4f90e244b7645639de52a76d5438269ecac9d6765687072402fc`

这只是本地实现构建证据，产物处于忽略目录，未上传、未发布、未进行部署阶段验证；也不证明真实 registry/OIDC/外部消费/线上运行成功。第二阶段 Cloudflare 专项、全部门禁接受与后续仅本地部署验证均等待父代理。
