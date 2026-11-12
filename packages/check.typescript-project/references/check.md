# TypeScript 项目基础实践配置

本 Check 判断配置及其连接，不判断代码质量成绩。它不运行目标工程的命令、配置、模块、测试、安装或 CI，也不读取远端配置、node_modules、已有覆盖率报告。项目中即使存在类型错误和必定失败的测试，只要配置满足要求仍可通过。

## 输入与有效要求

`context.projectDirectory` 必须是绝对目录；没有 `executionEnvironment`。可提供
`context.projectScopes: ["packages/a", "apps/b"]`
指定根内成员目录，替换自动 pnpm
workspace 成员发现。根项目仍纳入检查；数组非空、不重复，不允许绝对路径、`..`
或重复根目录。此输入是调用方显式声明的边界，不会自动证明未选成员合规。缺省扫描 pnpm-workspace.yaml 的 packages；未声明的嵌套 package.json 不能据此推断为成员，非 pnpm 嵌套工程需显式 scope。

requirements 缺省或 `{}` 使用下列完整默认，各领域可按语义局部定制：

| 路径                     | 默认                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| dependencyManagement     | enabled:true, manager:"pnpm", minimumVersion:"11.22.0", lockfile:true                                                   |
| typescript               | enabled:true, declaredDependency:true, strict:true, includeSource:true, includeTests:true                               |
| typescript.safetyOptions | noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noImplicitReturns, noFallthroughCasesInSwitch |
| lint                     | enabled:true, typeAware:true, includeSource:true, includeTests:true                                                     |
| formatting               | enabled:true, checkOnly:true                                                                                            |
| testing                  | enabled:true, nonWatch:true, failOnNoTests:true                                                                         |
| testing.coverage         | enabled:true, includeUntested:true                                                                                      |
| testing.coverage.minimum | branches/functions/lines/statements 均为 90                                                                             |
| qualityGate              | enabled:true, propagateFailures:true, capabilities 根据启用领域推导                                                     |
| ci                       | enabled:true, pullRequest:true, mainPush:true, frozenInstall:true；qualityGate/coverage 按有效领域推导                  |

capabilities 为 typecheck、lint、formatting、test、coverage。显式数组为替换，拒绝空数组、未知值、重复值。minimumVersion 是稳定的 major.minor.patch；阈值为有限的 0..100 数字，允许小数。其余能力字段是布尔值，false 只放宽，不禁止目标使用该能力。领域 enabled:false 时只允许 enabled 字段。testing.coverage 独立可关闭。未知字段、null、数组、字符串数字、跨域冲突均为输入错误而非项目问题。禁用领域自动从缺省门禁移除，显式门禁引用禁用能力、CI 显式引用已关闭的门禁或覆盖率则报错。关闭全部能力可导出空的默认门禁。归一化函数不修改输入、不做 I/O；结果是完整判别联合，不使用通用深合并。

## 静态支持范围

- 项目：pnpm exact packageManager（可带 sha 校验后缀），lockfile 存在；pnpm
  workspace 正向 `*`、`**` glob 及根 catalog/named
  catalog。检查各适用成员而非只看根。源码为成员内
  `.ts/.tsx/.mts/.cts`，排除声明文件、 `*config.ts`；测试输入为
  `test`、`tests`、 `__tests__` 目录或 `.test/.spec`
  文件。目录内辅助文件纳入类型/lint 范围，不强制作为独立测试发现。
- TypeScript：JSONC 注释/尾逗号，单个根内相对 extends（最多 32 层），compilerOptions 的局部覆盖，以及 include/exclude/files 相对各自声明位置。tsc 的
  `-p/--project`、`--noEmit` 等有限选项；配置含 project references 时不伪造
  `tsc --build`
  语义，报告无法确认。strict 显式子项 false 不被 strict:true 遮蔽。没有默认 NodeNext、ES2022 或 Node
  types 要求。显式 module 支持 none/commonjs/amd/umd/system/es6/es2015/es2020/es2022/
  esnext/node16/nodenext/preserve；moduleResolution 支持 classic/node/node10/
  node16/nodenext/bundler；target 支持 es5/es6/es2015 至 es2024 及 esnext，均不区分大小写。校验 Node16/NodeNext 族的相容约束与 Bundler 的 ES
  module/
  preserve 约束；未知枚举或需根据未指定 module 推断配对时无法确认，不加载编译器。启用 TypeScript 而整个项目范围没有可观察的 TS 源码/测试时，报告 typescript-unconfirmed，不因缺少检查对象而通过；无源码的工作区根聚合器仍允许。CommonJS/Bundler 的支持随 TypeScript 版本变化，本版保守报告无法确认。
- ESLint：ES module flat array、typescript-eslint.config、eslint/config
  defineConfig；已知 typescript-eslint recommended/strict
  TypeChecked（含 Only）预设，以及该预设直接 map 为 `{...config, files:[...]}`
  的有限语法。支持 @eslint/js
  recommended、globals 属性、import.meta.dirname。要求已识别 TS 预设，类型感知使用 projectService:true；默认 tsconfig 必须覆盖目标。显式 parserOptions.project、自定义 parser/processor、关闭 TS 规则的覆盖、动态 ignores 不猜测通过。任何关闭 TS 规则的配置保守视为不满足。默认发现时逐文件配置与 CLI 范围配置不一致则无法确认。
- Prettier：根或祖先静态配置（JSON/YAML/ES
  module）、缺省内置格式策略、--check/-c、静态目标、.prettierignore 和 .gitignore，同时检查适用的嵌套配置。插件/overrides 无法确认。checkOnly:false 时允许写入式入口，但本 Check 仍不执行它。
- Vitest：import {defineConfig} from
  "vitest/config" 包裹静态对象或直接对象，静态 test.include/exclude、run/--run/--watch=false、passWithNoTests。已声明 Vitest
  4.x/5.x 的 include 纳入未触达文件语义；覆盖率 v8/istanbul、全局四项 thresholds，明确的 coverage
  CLI 开关或 enabled:true。未连接覆盖率的 thresholds 不能证明 gate。projects/workspace、动态配置、自定义 provider 和分 glob 阈值不支持。观察到的四项 thresholds 必须是有限的 0..100 百分比；超界/无限值不满足，不把负数未覆盖数量等其他语义当作百分比。
- scripts：仅有限 shell
  token、`&&`、`pnpm [run] script`、`pnpm exec tool`、无 filter 的
  `turbo run tasks`。递归最多 32 层、共 4096 次展开、8192 条终端命令；生命周期钩子、环境赋值、shell 控制/builtin、管道、`;`、`||`、重定向、插值、递归/filter 调度等无法确认。通过实际已证明能力连接门禁，不依赖脚本名。Turbo 的 task
  env/persistent 和成员本地配置不支持；不执行任务，也不把任意 node 脚本推断为某项检查。自定义 pnpm
  script shell 和项目 package hooks 直接报告范围无法确认，不加载它们。
- GitHub Actions：YAML，PR 和 main
  push，在同一无条件 job 中依次 checkout、`pnpm install --frozen-lockfile`、`pnpm [run] gate`。支持常见 checkout 参数。有条件、continue-on-error、目录/env/defaults 覆盖、可复用工作流、事件过滤等不作为合格连接。检查的是配置，不是 CI 历史。

静态 JS 解析器为 Acorn，不是解释器：不调用目标函数，不加载任何 import，仅对已知包装器/预设生成有限语义证据。TS 注解、as/satisfies、函数配置、变量计算、条件、未知调用和导入均无法确认，而不是猜测缺少某项设置。glob 仅支持普通路径、`*`、`**`、`?`；否定、brace、extglob 等不能证明通过。等价工具/语法可能无法确认；该保守结果不是声称等价配置不合规。

## 安全与结果

不越过目标根，不跟随任何符号链接/目录 junction；发现链接报告 scope-unconfirmed。跳过 node_modules、.git、.silvermoon、.turbo、dist、coverage。最多枚举 16384 项、读取 512 个配置、每文件 1MiB、配置总量 16MiB、128 个 workspace 成员。预算超限无法确认。配置读取检查路径和读取期间变化；不要在检查过程中并发改写目标目录。输出排序固定，不含时间或宿主探测事实。

问题码按领域区分 missing（证据明确缺失）、mismatch（明确不满足）、unconfirmed（不能静态确认）；scope-unconfirmed 表示范围不完整。每项问题有独立中文文档。输入非法、目录不存在、权限/读取故障、取消等仍是执行故障，不会被转换成普通不合规或通过。只有全部启用要求已证明且无问题时通过。
