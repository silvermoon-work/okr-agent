# Cloudflare 首期范围与可行性

## 已有底座与最小接入

基线是第一阶段源码 `9c098ff3c76251ed314b581747a0103e4d75ec6b`、父代理已接受的实现修订 `6b1a3b63a29c0181a379a0615e384a1bd593476c`。第一阶段已完成本地部署验证并 submitOuter，尚待父代理接受；本次仅准备第二阶段，不把它记为第一阶段已经 completed。

现有 `check.typescript-project` 已有根 `silvermoon.yaml` 解析、`Project.delivery`、安全文件预算、项目发现、missing/mismatch/unconfirmed 结果和参考文档输出，以及通用质量/固定资产验证。最小方案是在同一 Check 内增量添加 Cloudflare 专项及对应问题文档，仍只输入绝对 `projectDirectory`，仍交付一个 private Check 的 CAR；不另建 npm 包、子 Task、远端调用协议或通用配置平台。

仅 `type: cloudflare` 的真实根包/工作区成员适用专项；一个 Package 是一个 Workers 部署单元，不增加 realtime 类型、环境编排或额外部署身份。npm/custom/未登记项不被平台配置文件存在与否自动选中。通用严格类型、type-aware lint、格式、单次测试、未测试源码覆盖率及项目四项阈值不变，npm publisher/发布保护不变。

现有 `src/static.ts` 的 JSONC 解析可复用；配置 JS/TS 只支持有限静态数据及白名单包装，不认识任意插件。现有 `inspect.ts` 仍以每代码包一个有效 tsconfig、一个明确 Vitest 配置及成员执行根为边界，不解释完整 project-references 图或多项目 runner。平台支持必须正面补齐必要的有限形态，不能仅取消错误或绕开通用检查。

## 首期可证明的能力

| 能力 | 首期正向支持与证据 | 不得推断或强迫 |
| --- | --- | --- |
| Wrangler 配置 | 交付 Package 根恰好一个 `wrangler.jsonc` 或 `wrangler.json`；只读解析静态字段、合法 name/非未来 compatibility_date/明确 flags 和根内路径，按实际声明/锁定版本对应的已审阅字段语义验证 | 不执行 Wrangler/配置模块、不自动更新兼容日期/旗标，不凭新类型包推断运行能力 |
| 纯静态资产 | `assets.directory` 是安全的明确目录，资产路由选项是受支持的静态值；可没有 main、assets.binding 和服务端代码 | 不因是 Cloudflare 就要求 handler、ASSETS binding、DO 或 Workers 测试插件 |
| API/SSR 模块 | 明确 main 指向输入中可读取的本地 ESM 入口，允许单独服务端或与资产并存；有限静态导出分析确认模块形态，资产 binding/路由与显式声明一致 | 不执行入口，不解释框架插件或运行请求；框架生成入口未提供时不声称 SSR 已通过 |
| 本地多个 DO | 按已声明 bindings 的 name/class_name，对照入口可静态确认的本地命名导出与明确迁移声明；首期覆盖带唯一 tag 的 new_sqlite_classes 创建关系和同一 Worker 多类/多 binding | 无 DO 不要求 migrations；不把外部 script_name 当本地类，不操作迁移或假设远端状态 |
| 平台类型 | 服务端/DO 使用与 compatibility_date/flags/config 对应的显式本地类型声明，纳入有效 tsconfig；可读的生成声明中的 binding 名称与配置对照 | 不运行 wrangler types，不手写一套平台 Env 代替生成类型，不以文件存在证明生成器刚运行或类型检查实际成功 |
| 平台测试配置 | 对 Worker 代码/DO，首期识别普通 defineConfig 中字面量 `cloudflareTest({ wrangler: { configPath } })`，配置指向本 Package 的同一 Wrangler 文件；仅给 Cloudflare 消费成员增加该有限只读适配 | 不接受任意函数、动态插件、异步工厂或自定义 runner 作为已证明安全的配置 |
| 覆盖率 | Workers runtime 测试使用受支持的 Istanbul provider，并保留 include 未测试源码、四项显式有限阈值和实际失败传播；普通 Node/前端测试保留已有适用配置 | 不将根共享 V8 配置直接当作 workerd 覆盖率证明，不因平台限制降低阈值、去掉源码或将配置存在冒充运行成绩 |

JSON/JSONC 支持是首期有限 profile，不宣称覆盖全部 Wrangler 合法形态。TOML、多个候选配置、`cloudflare.config.ts`、环境覆盖/多环境合成、动态构建选择、复杂重导出、DO rename/delete/transfer 历史及远端类、其他平台 binding/资源协议等超出首期证明能力时，给出准确路径、观察字段和无法确认原因；不自动转换、升级或猜测语义。与当前检查无关的普通 metadata 不因不在核心字段表就一概拒绝。

配置必填字段缺失报 missing；重复身份、路径逃逸、已确认的配置/导出/声明矛盾报 mismatch；不支持的有效形态、无法确认的版本语义、生成输出尚未提供或关系不完整报 unconfirmed。生成资产/入口缺失需区分源输入缺失与尚未提供构建输出，不执行 build 补齐，也不把未生成状态冒充产物已验证。任一适用项存在问题均不得正常通过。

类型/脚本/配置读取是静态机制证据，不证明程序行为、真实类型检查/测试成绩、源码所有访问的完整数据流、远端资源存在、完整生产安全或可观测配置、线上路由和部署成功。默认不全局强制 nodejs_compat，按目标声明及已识别能力检查，不把浏览器/Node/Worker 类型混用视作可互相替代。

## 当前官方资料核对

2026-11-14 通过只读 Cloudflare 文档检索核对，未调用账户或资源 API。普通网页抓取受到本机 DNS 地址安全限制，未绕过该限制；以下为文档检索返回的官方页面，不是实时账户事实：

- [Static assets configuration and bindings](https://developers.cloudflare.com/workers/static-assets/binding/)：纯资产示例可省略 main；assets.binding 是可选能力，run_worker_first 可为布尔或明确路由列表。不能机械要求所有 Cloudflare 应用先执行 Worker。
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)：以目标版本、兼容日期和原生配置为依据，不把本项目补充清单变成平台配置副本。
- [TypeScript](https://developers.cloudflare.com/workers/languages/typescript/)：现代 wrangler types 同时产生 bindings Env 与兼容日期/旗标相关运行时类型；默认 worker-configuration.d.ts，需纳入 tsconfig，配置变更后应由维护者重新生成。静态 Check 不代为执行。
- [Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/) 与 [configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)：当前官方路径为 `@cloudflare/vitest-plugin` 的 `cloudflareTest`，旧 `@cloudflare/vitest-pool-workers`/defineWorkersConfig 属迁移背景，不能以旧技能记忆直接固定为新标准；本轮不设计通用插件执行器。
- [Known issues](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/)：workerd 原生 V8 coverage 不支持，须 Istanbul；因此必须正面解决测试配置与通用覆盖率约束的对接，而非声明 Cloudflare 后跳过 coverage。
- [Durable Object class migrations](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/)：class_name、本地导出、唯一 migration tag 与 new_sqlite_classes 的有限关系可静态对照；复杂迁移和远端现状不在首期证明范围。该页面明确为 legacy 迁移语法资料，不能用它宣称覆盖所有新 Wrangler 行为。

本仓库目前没有 Wrangler 或 Workers Vitest 插件的已安装版本可充当平台基线。实施时必须先核对拟支持的稳定版本、schema/字段事实、Node/Vitest/Istanbul peer 兼容并选择最小依赖；准备阶段不安装或升级。无法取得相容稳定组合或静态语义证据时明确阻断相关支持，不通过降级既有质量工具、全局切换 Node 或扩大未知语法豁免解决。

## 阶段与部署边界

父代理保留 ideal/inner/outer 全部门禁；本阶段在两份待审门禁前不实现。实现通过后，Deployment 仍仅对同步候选进行本地受控样例、CAR 身份、文档和失败诊断验证，区分生产与确定性验证制品。不发 npm 包、不发版、不推送发布 tag、不上传 IPFS/Pinboard、不部署或迁移 Cloudflare 资源，不要求真实账号、外部消费者或线上运行。
