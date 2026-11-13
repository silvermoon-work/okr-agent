# @silvermoon-work/check.typescript-project

唯一的 TypeScript Project Convention Check 作者包，保持 private。输入仅为：

```json
{ "projectDirectory": "D:\\Projects\\example" }
```

固定六类规则、静态支持边界、外部元数据端点/预算和结果语义见[消费文档](references/check.md)。不接受 context、requirements 或 projectScopes，不执行目标项目。单包、pnpm
workspace 和 npm ESM 交付只是内部适用分支。

固定根 AGENTS.md 的唯一标准为
[assets/AGENTS.md](assets/AGENTS.md)，完整 UTF-8/LF 正文随 Bundle 与 Run
output 的 assets/ 交付。自由扩展固定引用 docs/agent-project.md；README、CONTRIBUTING 与扩展不评审关键词质量。

```powershell
pnpm --filter @silvermoon-work/check.typescript-project test
pnpm --filter @silvermoon-work/check.typescript-project typecheck
pnpm --filter @silvermoon-work/check.typescript-project build
pnpm check
```

生产构建为 dist/typescript-project.car；check.fixture.build.yaml 使用同一 callback/检查器和实际 Bundle
asset，但元数据为内部确定性 fixture，明确不是线上发行证明。其真实 Engine 测试覆盖通过、不通过、旧输入、I/O 故障、取消、output 文档/资产字节与回收。fixture 均在 dist 下隔离，避免与并行 ESLint 相互污染。

首版提供可正向通过的[单包 npm publisher v1](references/npm-publisher-v1.md)：有限 tsc 产物与真实源映射、完整标准发布器字节/声明式 workflow、RC/CI/OIDC/同 tarball 保护。未知自定义实现仍不放行。不自动安装/更新/发布或远程 pin。

生产来源政策固定为 `canonical-v1`：官方 npm 的完整 install-v1
packument、Node 官方历史发行索引及 GitHub 上的新鲜官方生命周期文件，无镜像/npmx 回退或业务输入覆盖。部署者必须在执行主机授权这些端点；这不是对所有设备的联网授权。

**当前 Windows 开发机不得现场运行 canonical-v1。**
本地包操作保持 NRM 的有效 Tencent
registry，不覆盖 registry、不执行官方源探测；生产解析器仅使用受控 HTTP
mock 测试。生产 CAR 的实际联网验收由已授权官方源的 `xiaonuo-ubuntu`
执行，必须记录实际证据，不能拿 mock 或 fixture
CAR 通过冒充线上证明。Node 索引允许只作为历史事实使用，不能据其缓存推断当前生命周期；具体端点、时效及预算见[外部事实政策](references/check.md#外部事实政策)。
