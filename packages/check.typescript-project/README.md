# @silvermoon-work/check.typescript-project

从零迭代的 TypeScript 项目 Check。当前可运行版本只检查项目身份，
并分流到 single repo 或 monorepo；两个分支暂时为通过的叶节点。
不会执行旧实现中的工具、scripts、交付或配置规则。

## 当前规则

- 根 `package.json` 必须是可解析的 JSON 对象。
- TypeScript 依赖、tsconfig 或 TS 源码中的任一明确依据即可识别技术栈。
- 有 workspace 声明就是 monorepo，否则就是 single repo。
- 身份不成立报告 `typescript-project-invalid`，不展开分支。

详细识别和执行边界见[检查说明](references/check.md)。
通过只表示当前已实现规则成立，不表示完整工程合规。

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
`problems`；不输出 protocol、nodes、edges 或 root。过程节点及其唯一 parent
通过 Task `context.log` 记录。检查只读、不联网、不执行目标代码。
Task 输出为 `output.result = {data,cidPaths}`，不再有 output
space 或 output.cid。

## 迭代入口与旧实现

- [根 checker](src/checks/project.ts)定义根问题与分流。
- [仓库分支](src/checks/repositories.ts)用于逐步增加 single repo /
  monorepo 规则。
- [registry](src/registry.ts)显式组合 checker。
- [旧源码](src-legacy/)仅作为参考，原回归测试仍指向它。
- [旧说明](README-legacy.md)记录历史完整规则，不代表当前实现能力。

`check.build.yaml` 通过 Check Task Builder 构建新生产入口；
`check.fixture.build.yaml` 通过上游 Task Builder 构建旧实现的确定性回归，
源码和参考资源均指向归档目录。每次修改后重建 CAR，不能用旧 CID 代表新实现。
