# 外部试跑中的诊断缺陷

2026-11-14 用已接受实现 `7516460a7e7d66eb708e3a11bc12a920c74dc181`、primary `582adc2de1777a26d63dbe95d49ae29875be3de0` 上的 Check CAR `bafybeigslm7zesptsjmn3skte3tmorwdvdxyhsv6yy7v7kfgsoabwailcy`，对 `D:\Code\pinboard` 做了一次只读检查。任务完成，共 110 个问题，没有 `cloudflare-*`。根上没有 `silvermoon.yaml`，也没有 `type: cloudflare`，所以 `apps/worker/wrangler.jsonc` 没有进入平台检查。

这次试跑不是 D-S02 的仓库内受控样例，也不能代替本地候选验证。下面只记录检查器自身不合适的诊断。Pinboard 使用 Turbo、冒号脚本名、成员未声明 `engines.node`、以及工具版本未追到同系列最新，这些差异按当前标准读到了，不记为缺陷。

## 同一事实被报两次

- `delivery-missing` 与 `release-missing` 正文相同：`.github/workflows/publish-npm.yaml:publish: 发布目录 . 未登记 npm 交付声明`。`convention` 与 `publisherProfile` 各调用了一次 `projectDeliverables`。
- `.github/workflows/ci.yaml` 的 `jobs.check.steps[4]` 向 `GITHUB_ENV` 写入 `PINBOARD_TEST_ROOT`。同一条步骤先报「不得改环境」，再报「扩展步骤影响无法证明」。

## 缺失 job 被按字段展开

Pinboard 的 CI 只有一个带矩阵的 `check`。检查器仍对不存在的 `compatibility` 和 `release-verification` 逐字段要求。25 条 CI 结果里有 14 条观察值是 `undeclared` 或空列表，包括这两个 job 的 name、timeout、runs-on、checkout、安装、`pnpm check`、矩阵和聚合 guard。缺 job 是一件事。

实际存在的 `check` 使用 commit pin：`actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`、`pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413`、`actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1`。工作流注释分别标为 v7.0.1、v6.1.0、v7.1.0。检查器只接受字面量 `actions/checkout@v7`、`pnpm/action-setup@v6`、`actions/setup-node@v7`，不会把同一主版本的 SHA pin 认成已批准 Action。

## 发布目录被指错

发布命令是 `npm publish "./apps/cli/dist/shazhou-pinboard-${RELEASE_VERSION}.tgz"`。检查器没有识别 tarball 参数，也没有看到 `working-directory`，因此把发布目标写成根目录 `.`。根包 `private` 为 true。裸 `npm publish` 的 `release-mismatch` 仍然成立，发布目录不是 `.`。

## 测试配置的原因不准确

- `apps/web` 同时有 `vitest.config.ts` 和 `vite.config.ts`。后者从 `vite` 引入，配置开发服务器。检查器把两个文件都当成 Vitest 配置，报 `ambiguous configuration`。专用 Vitest 配置就在同目录。
- `apps/cli/vitest.config.ts` 的 `include`、`testTimeout`、`coverage` 在允许列表内。整份配置被标成无法确认，是因为另有不在列表中的 `hookTimeout`。诊断把全部字段列在一起，没有指出该字段。
- `apps/worker/vitest.config.ts` 在插件里调用 `readFileSync`。静态检查不执行该配置，报无法确认符合当前边界。

## 检查过程自己产生的无法确认

- `https://registry.npmjs.org/typescript` 10 秒超时，被记成 `dependency-unconfirmed`。这是当次请求失败，不是 Pinboard 的依赖声明错误。
- Vite 已解析的 peer `esbuild` 写着「尚无公开元数据支持，未发送该名称」。根 `devDependencies` 已声明 `esbuild`。检查器的可查询名单不包含该名称，于是在未查询的情况下给出 `dependency-unconfirmed`。

## 同一入口被两条规则各报一次

`format:check` 被报成非法脚本名，同时缺失的标准名 `format-check` 再报一次。`apps/worker` 的 `preview:assets` 与它实际调用的 `scripts/build-preview-assets.mjs` 同样被名称规则和 `scripts/` 一对一规则各报一次。
