# TypeScript 项目身份与仓库分流

输入为 `{"projectDirectory":"执行机上的项目绝对目录"}`，不接受额外字段。
检查只读取目标文件，不执行目标代码、配置、脚本或联网查询，不修改目标项目。

## 当前检查树

```text
project
├─ single-repo
└─ monorepo
```

根检查要求普通文件 `package.json` 可解析为 JSON 对象，并具有下列任一依据：

- dependencies、devDependencies、peerDependencies 或 optionalDependencies
  中存在非空字符串 TypeScript 依赖声明。
- 存在 `tsconfig.json` 或 `tsconfig.*.json` 普通文件。
- 存在 `.ts`、`.tsx`、`.mts` 或 `.cts` 普通文件。

存在根 `pnpm-workspace.yaml` 普通文件，或根 manifest 声明 `workspaces`
字段，即分流到 monorepo；否则分流到 single repo。不依据 package 数量猜测
仓库形态，不在根层解析 workspace 内容、验证成员归属或 deliverable。
配置和 TS 文件可位于目标范围内的子目录；monorepo 也可以由子 package 的
TypeScript 依赖提供身份依据。

身份不成立只报告 `typescript-project-invalid`，说明具体原因，不展开子检查。
身份成立只展开一个分支。当前两个分支均为通过的叶节点；报告通过仅证明
本轮身份与分流规则成立，不证明 scripts、tools、packages、deliverable、
文件结构或其他工程标准合规。后续按讨论逐步增加分支规则。

## 执行边界

不跟随符号链接；根目录或读取路径发生重定向时执行失败。扫描跳过
node_modules、.git、.silvermoon、.turbo、dist、coverage，忽略范围内的
TypeScript 文件不构成身份依据。最多枚举 16384 项、64 层目录，
manifest 单文件读取上限 1MiB、总读取上限 16MiB。

非法输入、不可访问目录、意外 I/O、读取期间文件变化、取消及预算耗尽
属于执行故障，不转换为正常 problem 或通过结果。

旧实现仅作为参考和回归基线保留于源码的 `src-legacy/`，不由当前生产入口
执行，其历史规则与参考文档不属于当前制品。
