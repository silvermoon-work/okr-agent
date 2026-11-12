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

首版提供可正向通过的[单包 npm publisher v1](references/npm-publisher-v1.md)：有限 tsc 产物与真实源映射、完整标准发布器字节/声明式 workflow、RC/CI/OIDC/同 tarball 保护。未知自定义实现仍不放行。本 CAR 的包元数据只查询明确捕获的 Tencent 源，不能证明上游完整同步时 unconfirmed，无官方回退。无需修改输入来“跳过”这些检查，不自动安装/更新/发布或远程 pin。
