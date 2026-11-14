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

## 第二轮收敛后的处理状态

2026-11-14 用 CAR `bafybeiges6ric6t2k5mfi5si2uadtx6532wxztzhftnpyf7vgiuufat2s4` 复跑同一个项目，问题总数从 90 降到 36（首轮 110）。

已处理：

- Vitest 配置按优先级读取：`vitest.config.*` 优先于 `vite.config.*`，同一档位出现多个文件才算有歧义。
- ESLint 的 `files`/`ignores` 展开 `{a,b}` 花括号。TypeScript include 与 gitignore 语法不支持花括号，所以只对 ESLint 开启；没有逗号的 `{js}` 仍报无法确认。
- 忽略文件按 gitignore 语义处理：后面的规则优先，`!` 可重新纳入文件，父目录已被排除时子文件仍被排除。
- Vitest 不支持字段的诊断只列出具体字段（如 `test.hookTimeout`），未知 import 的诊断带上 import 名。
- 同一个 manifest 的 script 结构问题合并为一条，包括不符的 script、冒号名及改名建议、scripts 顶层孤儿文件。入口文件缺失另合并为一条 `gate-missing`。
- 多个包缺少 `engines.node` 合并为一条，列出每个 package.json。
- 多个 importer 共用同一 catalog 条目且同样落后时只报一次，列出所有 importer。

按决定保持不变：

- CI 里 Action 的 SHA pin 仍必须字面等于 `@v7`、`@v6`，SHA 写法继续报 `ci-mismatch`。

纠正此前的几处判断：

- scripts 顶层的 `.py`、`.wat` 文件被报告符合 Ideal，该规则写明入口均为 `.mjs`，不是误报。
- `compatibility` 与 `release-verification` 是 CI 固定标准对 GitHub 项目的要求，不依赖 npm 交付，不应随交付声明跳过。
- `steps[5]` 是独立的扩展步骤，不是 `steps[4]` 写 `GITHUB_ENV` 的连带结果，两条各自成立。
- `apps/worker/vitest.config.ts` 使用的是自定义插件加 `node:fs`，不是 Cloudflare 测试插件，不属于 Cloudflare 检查的范围。
- `esbuild` 确实声明在根 `devDependencies`，但它是被规定工具 `vite` 的 peer，Check 的元数据查询名单是封闭的，名单里没有它。Ideal 要求这类 peer 有独立证据，所以报告本身与 Ideal 一致，缺的是名单。

新暴露的真问题：`apps/web` 有 `.tsx` 文件，而 ESLint 类型感知配置只覆盖 `**/*.ts`，现在报 `lint-mismatch`。以前被无法确认挡住。

仍待决定，均不在本轮范围：

- 去掉 `unconfirmed`，只保留过/不过。该状态写在已验收的上游 Ideal（`project-standards-composition` 等）里，改它需要作为上游变更单独立项。已确认的方向：外部证据拿不到（registry 超时、发布索引过期）时，整次检查执行失败，不产生报告条目；检查器解析不了的形态按不满足处理；有歧义的按规则消歧，消不了的判不满足。
- 是否把 `esbuild` 等 `vite` 的 peer 加入元数据查询名单。
- Vitest 允许字段列表是否加入 `hookTimeout` 等纯超时字段。