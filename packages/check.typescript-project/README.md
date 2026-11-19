# @silvermoon-work/check.typescript-project

从零迭代的 TypeScript 项目 Check。按 project、workspace 两个有序检查点执行：
先确认项目身份，再对 monorepo 检查 pnpm workspace 配置。
single repo 在 workspace 检查点不要求 workspace 声明。
不会执行旧实现中的工具、scripts 或交付规则。

随包交付的发布标准资产采用各包 `deliverable.yaml` 的 `type` 声明，
发布 tag 使用 `<完整 npm 包名>@<版本>`，手动选择使用完整 npm 包名。
这些资产及旧实现回归已同步迁移；当前生产检查树仍不执行交付规则，
不能将资产更新视为新增了生产检查能力。

## 当前规则

- 根 `package.json` 必须是可解析的 JSON 对象。
- TypeScript 依赖、tsconfig 或 TS 源码中的任一明确依据即可识别技术栈。
- 有 workspace 声明就是 monorepo，否则就是 single repo。
- 身份不成立报告 `typescript-project-valid`，不进入后续检查点。
- monorepo 必须提供合法的 `pnpm-workspace.yaml` 对象，显式包含非空
  `packages` 字符串数组，每项不得为空白；否则报告
  `workspace-configuration-valid`。
- 成员范围不强制 `apps/`、`packages/` 布局；本轮只验证声明结构，
  尚不展开成员模式或检查匹配结果、成员 manifest 和名称冲突。

详细识别和执行边界见[检查说明](references/check.md)。
通过只表示当前已实现规则成立，不表示完整工程合规。

## 改造规格

[docs/spec.yaml](docs/spec.yaml) 使用最新的 Spec v1.0 有序检查点模型，
记录项目身份、workspace 及根工程工具链的增量设计。每步分别声明
description、Agent instructions、正向 Rules 和成功 Context output；
通过继续、不通过即停止，不使用旧图或固定脚本包装器。
项目身份与 workspace 已实现，其余步骤尚未实现；九个根 Turbo 聚合命令已确认，
共享工具组合及版本规则仍为候选。成员、单包工程和其他未细化政策见规格的范围说明。
规格中的 Rule code 尽量采用所属 Checkpoint ID 前缀；运行时、设计样例和参考文档
尚未同步新命名，当前运行结果仍使用原规则码。
该文件不参与当前 CAR 构建，也不表示生产 Check 已增加这些能力。

## 构建与运行

在仓库根目录构建本包和依赖：

```powershell
pnpm exec turbo run build --filter=@silvermoon-work/check.typescript-project...
```

在本包目录通过本地 Task Engine 运行构建后的 CAR：

```powershell
pnpm smoke dist\typescript-project.car D:\Projects\example
```

命令输出 JSON，包含准确 Bundle CID、业务结论、问题及 cidPaths。
保留输入 `{"projectDirectory":"执行机上的项目绝对目录"}` 和
通过/不通过的业务结构。通过包含 `pass:true` 与 documentation 直接 CID，
本包还交付 assets 目录 CID；失败增加
`problems`，每条指出 checkpoint、规则码及实际情况；`references` 按失败检查点
聚合文档。通过时 references 为空。不输出当前 level、nodes、edges 或 root。
过程日志只记录顺序检查点及结果，不记录成功输出。检查只读、不联网、不执行目标代码。
Task 输出为 `output.result = {data,cidPaths}`，不再有 output
space 或 output.cid。

## 迭代入口与旧实现

- [项目检查点](src/checks/project.ts)确认身份并输出仓库形态事实。
- [workspace 检查点](src/checks/workspace.ts)读取前置成功输出并验证适用规则。
- [有序列表](src/checkpoints.ts)显式组合检查点。
- [旧源码](src-legacy/)仅作为参考，原回归测试仍指向它。
- [旧说明](README-legacy.md)记录历史完整规则，不代表当前实现能力。

`check.build.yaml` 通过 Check Task Builder 构建新生产入口；
`check.fixture.build.yaml` 通过上游 Task Builder 构建旧实现的确定性回归，
源码和参考资源均指向归档目录，显式使用 SDK legacy 入口而非当前协议。
每次修改后重建 CAR，不能用旧 CID 代表新实现。
