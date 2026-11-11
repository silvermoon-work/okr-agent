# Node.js 工具链检查实施

## Steps

### I-S01: 定稿契约与平台证据边界

按 [业务要求](./ideal/Requirements.md)
定稿 TypeBox 输入及问题码，确认项目上下文、工具配对、nvm 与有效 registry 的检测证据及支持矩阵。

契约位于 `packages/check.nodejs-toolchain/src/contract.ts`。
`execution-context.ts`
实现必填闭合执行环境、平台路径校验和宿主白名单捕获的别名冲突拒绝；只复用 Worker 允许的系统值，不扩展 ambient
process.env。 `inspect.ts`
拒绝跨字段冲突，版本按任意精度数字段比较；配对独立确认 npm-prefix 选择的 CLI 与 Node 运行时；nvm 管理逐工具核对其确认管理的安装，不隐含同一版本配对。真实平台矩阵与宿主差异见
[Verification.md](./Verification.md)。

### I-S02: 实现单 Check 包及参考文档

唯一作者包 `@silvermoon-work/check.nodejs-toolchain`
保持私有，不加入发布映射。入口调用现有
`runCheck`，Builder 提取 TypeBox 并打包十二类问题的中文参考文档。子进程仅使用枚举内固定只读命令，限制时间/输出、取消并按 PID 清理进程树；关闭子进程自动下载、pin 和 pnpm 自动版本管理，不改调用方配置。

通过固定环境控制禁止项目/全局 pnpmfile、Node 编译缓存及 pnpm
11 自动版本下载；启动 pnpm 前只读拒绝 configDependencies，避免“配置查询”先安装配置包。真实 CAR 项目包含会抛错的 pnpmfile 和不满足的 packageManager 指定，证明检查既不执行项目代码，也不切换/下载该指定版本。

预检不依赖工作区 YAML 的存在：始终包含 cwd/.npmrc，并按 pnpm
10.22/11.22 的共同 local-prefix 标记检查实际选中的父级 .npmrc；工作区配置保持原样，包含逻辑路径与真实路径的项目祖先链，不扫描无关项目。两个启动标记回归证明 cwd/父级来源都在工具启动前拒绝且没有安装产物；真实 CAR 新增无本地工作区 YAML 的项目 .npmrc 拒绝场景。

通过真实包管理器查询实际生效 registry，而非读取 nrm 后推断；补充只读 YAML 默认 registry 检查，防止 pnpm
11 静默忽略插值后以 fallback 误通过。复用 catalog 的 yaml；nrm
1.2.6 仅为作者测试 devDependency。已知 nrm
2.1.0 在只读命令启动时写用户配置，因此在启动前拒绝它及未验证实现。Windows
npm 只接受已验证的标准 shim；不确定入口不判配对/管理通过。

### I-S03: 验证业务与标准制品

覆盖要求文档中的正常、不满足、非法输入、取消和清理场景，执行真实 Engine 制品验证及仓库检查。

原 sanitized Worker 阻塞已按获批准的显式上下文契约解决；未修改的已发布 Engine
0.2.0-rc.0 已从真实 CAR 完成 Node-only、多问题、实际 Node/npm 配对、npm/pnpm/nrm 与配置覆盖验证，并读取输出 CID 中文文档字节。故障、取消、两级超时及自有子进程物理回收已有证据。

父级授权的官方 portable nvm-windows
1.2.2 已通过 checksum/SHA-256 核验；使用原样真实 Node/npm 副本、独立 NVM_HOME/settings 和私有当前 junction，同一 CAR/已发布 Engine 已验证管理+配对通过、双工具未受管、仅 npm 未受管及实际 nvm 版本。配置/链接/源文件未变，运行环境已清理；未执行 setup/install/use。原共享 nvm 二进制仍挂起，未被替换或修复；Unix 仍未验证。详见
[Verification.md](./Verification.md)；[原设计提案](./ExecutionContextProposal.md)
仅保留方案决策背景，不替代当前证据。

## Acceptance criteria

### I-AC01: 要求语义可验证

针对 R-02 至 R-08、R-11 的测试证明未声明项不误报、关联约束不被简化、有效配置与输入一致性正确。官方 portable
nvm-windows
1.2.2 有真实管理正向与反向证据，不以 fixture 代替；未验证平台明确列出，不声明 Unix 支持。

### I-AC02: 结果与资源边界正确

通过实际 Engine 执行通过、不通过及故障制品，核对结果和输出参考文档，并验证取消、清理及无环境修改。

### I-AC03: 单包交付符合仓库规范

作者包保持私有且不进入 npm 发布映射，工作区脚本与依赖一致，标准 Bundle/CAR 可构建，准确 CID 可验证，相关测试及
`pnpm check` 通过；支持平台与未验证范围有明确文档。
