# 固定 TypeScript 工程标准要求

本文是 [Idea.md](./Idea.md) 的 supporting
document，定义业务范围与可观察结果，不指定内部文件拆分。

## R-01: 标准与对象分离

- Check 的准确 Bundle
  CID 决定按什么标准检查，input 决定检查谁；不再由 input 改变合格线。
- 本次先调整 `@silvermoon-work/check.typescript-project`，再实现
  [npm 包项目标准](./Npm-package-standard.md)。不把这项结论扩展为所有 Check 都禁止参数；Node.js 工具链的能力要求及授权执行上下文不在本次修改范围。
- 标准允许已支持的等价配置，不要求继承 preset、复制模板、固定配置文件内容或提供 lineage 来源。
- 本次固定现有完整默认标准，不重新发明或放宽 TypeScript 项目共性；需要改变规则时重建并交付新 CID。

## R-02: 输入只定位检查对象

保留现有上下文外形，避免无关重命名：

```json
{
  "context": {
    "projectDirectory": "D:\\Projects\\example",
    "projectScopes": ["packages/a", "apps/b"]
  }
}
```

- `projectDirectory` 为执行机上的绝对项目目录，不是控制机目录或 policy 选择器。
- `projectScopes` 仍为可选的根内成员定位：保留根项目、替换自动 pnpm
  workspace 成员发现。选中范围内执行完整固定标准；结果不声称未选成员合规。
- 不指定 scopes 时保持现有实际 workspace 发现逻辑；不擅自扩大或缩小检查范围。
- 保持非空、无重复、最多 128 项、禁止绝对成员路径及 `..` 等现有范围约束。
- 顶层只允许 context；context 只允许已经支持的对象定位字段。没有 requirements、profile、enabled、skip、threshold 覆盖或变相政策输入。
- 旧 `requirements` 无论是
  `{}`、null、禁用领域、降低阈值或等于默认值，均明确作为非法输入拒绝，不忽略、不继续检查后声称通过。
- 不接入 executionEnvironment，也不探测宿主工具。

## R-03: 固定标准

当前规则来源为现有 Check 的默认配置及
[参考文档](../../../../../../packages/check.typescript-project/references/check.md)，本表将其从“可覆盖默认”明确为本次目标标准：

| 领域         | 固定要求                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 依赖管理     | pnpm，packageManager 明确版本至少 11.22.0，存在 lockfile                                                                |
| TypeScript   | 声明 TypeScript 依赖，strict，源码与测试纳入类型检查                                                                    |
| 类型安全选项 | noUncheckedIndexedAccess、exactOptionalPropertyTypes、noImplicitOverride、noImplicitReturns、noFallthroughCasesInSwitch |
| lint         | 类型感知，源码与测试纳入范围                                                                                            |
| 格式化       | 有只检查、不写入的格式校验入口                                                                                          |
| 测试         | 非 watch，未发现测试不能被配置为成功                                                                                    |
| 覆盖率       | 纳入未触达文件，branches/functions/lines/statements 四项阈值均不低于 90                                                 |
| 聚合门禁     | 连接 typecheck、lint、formatting、test、coverage，并传播失败                                                            |
| CI           | PR 与 main push 接入；同一有效检查链路包含冻结安装、质量门禁与覆盖率                                                    |

阈值是最低标准，不要求目标配置恰好等于 90；更高的合法阈值可满足标准。检测的是配置与连接，不是实际覆盖率成绩、编译结果或 CI 历史。

## R-04: 删除配置不降低检测质量

- 删除或收敛仅为接收调用方政策而存在的归一化、默认合并、关闭领域及跨政策冲突逻辑；不保留无人可达的公开政策执行器作为另一个入口。
- 内部可以有只读标准数据与必要共享类型，但不得暴露修改它们的参数或可变公共对象来改变后续 Run 的规则。
- 保留现有检测支持范围及限制，包括静态 TypeScript/ESLint/Prettier/Vitest/GitHub
  Actions 语义、配置继承、脚本连接、对象发现及预算。
- 不借本次移除可定制要求强行扩大工具、语法、平台或 monorepo 支持声明；未知动态配置仍报告无法确认，而不是猜测缺失或通过。
- 同一输入检查期间无目标命令执行、模块加载、配置求值、安装、构建、网络或修复。
- 问题仍分 missing、mismatch、unconfirmed；输入非法、读取故障、取消等仍是执行故障。输出文档继续采用现有 code/brief/documentation 与 output
  CID 协议。

## R-05: 组合与交付

- 父 Check 固定依赖本标准的准确 CID，通过不可变 imports 与 `bundle: SpaceRef`
  调用；只传对象上下文，不透传或覆盖子政策。
- TypeScript 固定标准是 npm 包项目 Check 的前置；后者复用本 Check，不复制规则或透传政策。父子具体结果与文档的最小组合边界见
  [npm 包项目标准](./Npm-package-standard.md)，不引入广义 preset 政策语言。
- 包继续私有，仅交付标准 CAR/CID 与更新文档；不要求发布作者 npm 包。
- 新模型改变契约与制品身份，需要重建新 CAR 并明确新旧输入不兼容。旧 CAR/CID 与历史已验收文档不被改写或冒充已经迁移。
- 本次不自动改写其他 idea、已发布 Pinboard 内容或外部父 Bundle；如有实际消费者，文档说明需要按新 schema 重建并更新引用。远程上传、pin、外部发布另行授权。

## R-06: 验收场景

1. 对现有合规 fixture 使用仅含 context 的输入，通过；配置内故意有类型错误或失败测试仍不执行目标代码。
2. 分别去掉严格模式、降低覆盖率至 89、断开 lint/test/coverage 门禁或 CI 连接，出现对应具体问题；不能通过任何输入参数放宽。
3. requirements 的空对象、原本有效的局部覆盖、禁用领域、null 和未知政策字段都被 schema/运行入口明确拒绝；无成功形状 fallback。
4. 保留对象 scopes 的定位、根保留、默认发现、越界/链接/预算限制，不把未选范围宣称通过。
5. 真实 Engine 对新 CAR 执行通过、不通过、非法旧输入及读取/执行故障，核对业务结果、文档字节和资源回收。
6. 父 Task 使用 imports 固定该 CAR 的根身份，通过 SpaceRef 传同一对象上下文，得到真实子业务结论；执行故障按上游语义传播。
7. 独立于作者源码/隐藏依赖的 CAR 消费与当前仓库 `pnpm check`
   通过，交付说明准确记录新 CID、固定标准和旧输入拒绝行为。
