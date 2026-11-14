# 第一阶段本地部署验证

## 固定候选与契约

父代理接受的实现仍为 `6b1a3b63a29c0181a379a0615e384a1bd593476c`，源码提交为 `9c098ff3c76251ed314b581747a0103e4d75ec6b`；接受事件已在 primary `8676b55abe58eb48ecfe8b0ff4cf46b131cb54e0`。

执行前先将最终 Deployment 契约同步至 primary `2c509486077f46c18b87dc57057d27564430fbc0`，fresh 报告的 `deploymentRevision` 为 `db70181f8f6e68da24caf0fa0ad90b31eb2d3b7b`。本报告及原始证据是该契约的结果补充，不修改已验收实现、理想世界或第二阶段代码。

## 实际执行

2026-11-14，使用已有 `test/car.test.ts` 的 `TYPESCRIPT_CHECK_PERSIST_EVIDENCE=1` 模式构建确定性元数据验证 CAR，并经本地 Task Engine 完成普通通过、通用门禁失败、npm 通过三个基线样例。之后执行同层 [verify-local.mjs](verify-local.mjs)，复用既有 `scripts/smoke.mjs` 完成九个受控样例：

| 样例 | 预期及实测 |
| --- | --- |
| ordinary | 普通 TypeScript，通过 |
| npm-library | npm ESM 库，通过 |
| npm-cli | 带 bin 的 npm 应用，通过 |
| cloudflare | 显式 Cloudflare 意图，通过通用检查、不承担 npm 专项 |
| custom | 自定义类型和惰性附加字段，通过通用检查 |
| duplicate | 同路径多类型，不通过，含 delivery-mismatch |
| escape | 路径逃逸，不通过，含 delivery-mismatch |
| private-npm | 明确 npm 但为 private，不通过 |
| unregistered-publish | 未登记却存在明确 npm 发布入口，不通过，含 delivery-missing |

九个样例均符合预期，目标文件树执行前后 SHA256 相同，问题文档均可读，输出固定资产与验证 CAR 一致；非法输入、执行故障、取消及任务回收也按既有 smoke 断言通过。样例中的 target build/test 含故意抛错内容，检查器未运行目标代码。

另外仅调用已接受固定模块的纯映射、计划函数：真实仓库仅 SDK/Builder 两项进入 npm/publint 计划，准确 ID/name/path 不变；core 保持 private、未登记且不能被选择。`resolveConfiguration` 只生成身份计划，没有执行 publish 或 dry-run CLI，也没有触发 CI。

原始输入覆盖层、预期、诊断、目标快照、CAR/资源摘要、Engine 结果见 [local-verification.json](local-verification.json)。此 JSON 不是人工改写的测试成绩；由实际验证脚本在全部断言通过后生成。

## 制品身份

| 制品 | CID | SHA256 |
| --- | --- | --- |
| 已接受源码的生产 CAR，仅本地身份核对 | bafybeidwniqa77leuzpddh56ln4zyyxbz5z3vn66emoqtpn6bk5z33ya4i | 7d80c258d37f4f90e244b7645639de52a76d5438269ecac9d6765687072402fc |
| 同源、确定性元数据验证 CAR，实际本地 Engine 执行 | bafybeigqvnr5gmccfzaqmk2obkhwc7o5oodxelptedbk554akz5hxoruyy | 633c1810cc40608154e91faa93b5dfee5347a4202bef56da6aa19ac0e1080d65 |

两 CAR 的 CID 不同；AGENTS、commands、deliverables、npm-publish、workflow-predicates 五个关键固定资源逐字摘要相同。生产 CAR 没有被替换为 mock 版本。本地 Engine 使用 CAR block 与内存 store，无网络 IPFS 客户端或上传。

最终 `pnpm check` 退出 0，包含 478 项 TypeScript Checker 测试、13 项发布回归、全部原质量/覆盖率门禁、SDK/Builder 包校验及脚本 lint。接受后的 packages/scripts/apps 实现目录及依赖/标准文件无 diff；根 check 重建的生产 CAR 身份保持相同。

## 复现与边界

从仓库根执行，在 `packages\check.typescript-project\dist\verification` 不存在时：

```powershell
$env:TYPESCRIPT_CHECK_PERSIST_EVIDENCE='1'
pnpm --filter @silvermoon-work/check.typescript-project exec vitest run --root . --config ..\..\vitest.config.ts test\car.test.ts
Remove-Item Env:\TYPESCRIPT_CHECK_PERSIST_EVIDENCE
node .silvermoon\ideas\01M7C33MXC53288148DJY4QW0X\outer\verify-local.mjs
```

不要覆盖未知的既有 verification 目录；脚本通过后才生成原始 JSON。此次操作自有的受控输入与验证 CAR 已在取证后清理，生产 CAR 仍位于原忽略目录。复现会产生新的观察时间与任务标识，不要求原始 JSON 逐字相同。

实际 Node 为 `26.13.0`，固定为 `26.13.1`；pnpm 为精确 `11.28.12`。沿用已披露限制，未切换或安装全局工具。确定性 provider 不证明官方实时发行事实，Cloudflare 样例只证明意图及通用职责边界，不证明平台配置或运行。本轮没有发 npm 包、发版、推送发布 tag、上传 IPFS/Pinboard、部署或迁移 Cloudflare 资源；普通生命周期提交与非强制同步 primary 仅用于审阅。
