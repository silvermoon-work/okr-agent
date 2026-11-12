# TypeScript Project Check 实施验证

## 交付与边界

已实现私有作者包 `@silvermoon-work/check.typescript-project`，版本
`0.0.0`。没有 npm 发布映射，没有提交、暂存、推送、发布、生命周期事件或 Ideal
World 修改。部署与 Pinboard 上传/重新下载由主 Agent 独立完成，本文件不声称外部部署已验证。

输入只有目标根、可选的有界项目相对 scopes、可选 requirements；没有 executionEnvironment。纯 normalize 返回完整判别联合或路径/原因错误，按领域语义补齐，不使用深合并。缺省全启用，关闭领域只保留 enabled:false；数组显式替换，禁用引用冲突、非法类型/未知字段/阈值及非数据访问器均拒绝。false 是放宽而非禁止。

检测只读取目标配置、文件名及工作区声明。实现没有执行目标程序、动态加载目标模块、eval、安装目标依赖或网络请求。Acorn 仅识别静态数据与有限已知包装器/ 预设；内部引用和预设标记使用不可由目标对象伪造的 Symbol，而非字符串命中。I/O 失败和输入错误仍是故障；未知配置、越界、链接、预算超限报告无法确认。

## 支持的证据与限制

- pnpm exact 版本、锁文件、workspace 正向 glob、catalog/named
  catalog。检查每个适用成员；显式 scopes 是调用方主动指定的局部边界。
- TypeScript JSONC、单个根内 local
  extends、有效 strict 子选项与五项安全选项，按声明位置继承 include/exclude/files，处理 files-only、默认 include 和输出目录排除；独立 emit
  build 不会使已覆盖测试的 typecheck 被误判失败。
- ESLint flat array/config
  wrapper、typescript-eslint 的已知 TypeChecked 预设、该预设的有限 map、projectService、逐文件/CLI/ignore/tsconfig 范围。
- Prettier 静态配置、嵌套配置、检查入口、.prettierignore/.gitignore；Vitest 静态 defineConfig、非 watch、无测试失败、发现范围，以及已声明 Vitest
  4.x/5.x 的源码 include、四项阈值与真正启用采集的连接。
- pnpm 脚本的有限 `&&` 委托及无 filter 的 Turbo tasks；识别退出/切换目录等 shell
  builtin 风险，不把它们之后的命令当作已连接。GitHub Actions 检查 PR/main
  push、checkout、冻结安装及同一无条件 job 的有效门禁/覆盖率连接。
- 不支持任意 TS 注解/函数/条件配置、未知导入/调用、package extends、tsc
  project-reference build、显式 ESLint
  parserOptions.project、任意 glob/否定忽略、Prettier 插件/overrides、Vitest
  projects/custom provider/ 分 glob 阈值、复杂 shell/Turbo
  filter/成员配置、自定义 pnpm
  shell/hooks、动态/过滤 CI 等。这些形式不猜测通过。
- 上限：16384 个目录项、512 个配置、1MiB/文件、16MiB 总配置、128 个成员、32 层继承/脚本、4096 次脚本展开、8192 条终端命令。不跟随符号链接/junction，不读根外。并发改写目标不在快照保证范围内。

精确字段、缺省及支持边界以
[检查参考](../../../../../packages/check.typescript-project/references/check.md)
和归一化类型为准。NodeNext、ES2022、固定目录、Node types 不是默认要求。

## 验证命令与结果

环境为 Windows、Node.js `24.11.1`、pnpm `11.22.0`。修改 manifest 后先以
`nrm current` 和 `npm config get registry` 确认设备选择Tencent registry，再运行
`pnpm install --ignore-scripts`，未覆盖 registry。

以下最终定向命令全部成功：

```powershell
pnpm --filter @silvermoon-work/check.typescript-project lint
pnpm --filter @silvermoon-work/check.typescript-project typecheck
pnpm --filter @silvermoon-work/check.typescript-project test
pnpm --filter @silvermoon-work/check.typescript-project build
```

共
**64 个测试、3 个测试文件通过**。包含缺省/局部归一化、冻结输入与访问器、关闭/冲突/数组/阈值边界、真实工作区继承、未连接覆盖率、strict 子项关闭、忽略源码、动态配置、伪造内部标记、files-only/默认 include、根逃逸/链接、故障、预算、shell 提前退出与 CI
main 排除等回归。

正 fixture 含真实类型错误和必定抛错的测试代码，仍按配置通过；没有运行它们。CAR 测试通过标准
`@silvermoon-work/check-task-builder/cli` 构建，并在独立 Node 进程中使用标准
`@silvermoon-work/task-builder/car` 与 `@silvermoon-work/task-engine`
导入。正 fixture 通过，去掉 coverage 开关的负 fixture 不通过，检查文档与所有实际问题文档均能经输出链接读取。

已运行要求的 `pnpm check`，仅对验证进程去除 PATH 空段和字面 `%...%`
项、设置 PATHEXT 为
`.COM;.EXE;.BAT;.CMD`，没有修改系统环境。完成的全仓验证中，格式、发布脚本 lint、11 个发布测试、新包 lint/typecheck/test/build 和其余任务通过；整体由既有 nodejs-toolchain 原生 npm
prefix 测试阻塞：

```text
packages/check.nodejs-toolchain/test/inspect.test.ts:633
honors the real npm shim's explicit prefix for both execution and pairing provenance
Test timed out in 5000ms.
```

同一测试还报告其 fixture 清理
`ENOTEMPTY`。未修改该无关测试；中断/失败验证产生的确切 fixture 目录已清理。早期本包回归已修复并经最终 64 项定向测试验证，不将其计作已知基线失败。

父 Agent 门禁审阅后的窄范围补丁新增 14 项用例：静态校验支持的显式 module/moduleResolution/target 枚举及 Node16/NodeNext 族、Bundler 相容性，未知或版本相关组合（如 CommonJS/Bundler）无法确认；不捆绑编译器。整个范围没有 TS 源码/测试时，TypeScript-only 请求不再空真通过。观察到的覆盖率百分比必须有限且在 0..100 内（测试包括 101 与 1e309）。合法 Node-family 交叉组合和 ESNext/Bundler 仍通过。补丁后重新通过上述 lint/typecheck/64 项测试/build 及本仓库 Engine 观测；不重复处理无关基线超时。

`silvermoon check --worktree --audience agent --language zh-CN` 通过。

主 Agent 依授权完成门禁审阅，要求并验证上述三类窄范围修复。独立重跑本包 test（64/64）、lint、typecheck 成功。另在作者脚本之外，以标准 Task
Builder/Engine 公开入口导入最终 CAR、校验准确根 CID，并对当前项目执行默认要求：运行完成，三个实际输出文档逐字匹配 CAR 中资源，Worker 已回收，162 个 Git 跟踪及非忽略新文件的前后 SHA-256 和状态完全一致。此记录仍仅证明本地制品；Pinboard 往返留给部署证据。

## 最终 CAR 与本仓库观测

- 路径：`packages\check.typescript-project\dist\typescript-project.car`
- 根 CID：`bafybeicumbn6casp7au5dj4z3zcokpta2wy6jprdfhll2cal5qfph4zmnm`
- CAR：**388590 bytes**，低于 Pinboard inline 上传 2MiB 上限。
- Worker：358535 bytes；没有打包 TypeScript 编译器。
- SHA-256：`dd2baf98defebbae7129dacb2a09668e5fd0231ead841a3f3c5be06e354900f7`

从作者包目录执行：

```powershell
node scripts\smoke.mjs dist\typescript-project.car ..\..
```

真实 Engine 以默认要求检查 `D:\Code\okr-agent`： `pass:false`，只有
`gate-mismatch` 与
`ci-mismatch`，全部中文参考可读。原因是聚合入口和 CI 未连接所有成员的覆盖率能力，不是当前代码/测试成绩。没有修改被检项目实践来制造通过。这里只验证本地构建的 CAR，尚未验证从 Pinboard 重新下载的 CAR。

## 精确文件范围

修改：`pnpm-workspace.yaml`（catalog 增加 Acorn）、`pnpm-lock.yaml`
（新增作者包 importer/catalog，不改无关版本）、本目录
`Implementation.md`（链接本证据）。新增本文件。

作者包新增 42 个源文件/文档，排除被忽略的 node_modules、dist、.turbo：

```text
packages\check.typescript-project\
  check.build.yaml
  package.json
  README.md
  tsconfig.json
  src\
    commands.ts
    contract.ts
    files.ts
    inspect.ts
    main.ts
    requirements.ts
    static.ts
  test\
    car.test.ts
    fixture.ts
    inspect.test.ts
    requirements.test.ts
  scripts\
    smoke.mjs
  references\
    check.md
    problems\
      ci-mismatch.md
      ci-missing.md
      ci-unconfirmed.md
      coverage-mismatch.md
      coverage-missing.md
      coverage-unconfirmed.md
      dependency-mismatch.md
      dependency-missing.md
      dependency-unconfirmed.md
      formatting-mismatch.md
      formatting-missing.md
      formatting-unconfirmed.md
      gate-mismatch.md
      gate-missing.md
      gate-unconfirmed.md
      lint-mismatch.md
      lint-missing.md
      lint-unconfirmed.md
      scope-unconfirmed.md
      testing-mismatch.md
      testing-missing.md
      testing-unconfirmed.md
      typescript-mismatch.md
      typescript-missing.md
      typescript-unconfirmed.md
```
