# TypeScript 项目身份与 workspace 配置

输入为 `{"projectDirectory":"执行机上的项目绝对目录"}`，不接受额外字段。
检查只读取目标文件，不执行目标代码、配置、脚本或联网查询，不修改目标项目。

## 有序检查点

```text
1. project：确认 TypeScript 项目身份，输出 single-repo 或 monorepo 事实。
2. workspace：复用身份输出，仅对 monorepo 验证 pnpm workspace 配置。
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

身份不成立只报告 `typescript-project-invalid`，说明具体原因，不进入后续检查点。
身份成立后进入 workspace 检查点；single repo 不要求 workspace 声明。monorepo
要求根 `pnpm-workspace.yaml` 是合法 YAML 对象，
显式包含非空 `packages` 数组，每项为非空白字符串。缺少文件、不是普通
文件或声明结构非法时报告 `workspace-configuration-invalid`，不回退到
manifest 的 `workspaces`。意外 I/O 和链接重定向仍为执行故障。

成员发现将遵循 pnpm 的模式语义，不限定 `apps/`、`packages/` 布局；
本轮尚不展开成员模式，不检查空匹配、成员 manifest、名称冲突或根包归属。
报告通过仅证明当前身份、分流及适用的 workspace 声明结构成立，不证明
scripts、tools、packages、deliverable、文件结构或其他工程标准合规。

通过业务结果为
`{pass:true,documentation:"文档 CID",references:[],assets:"标准资产目录 CID"}`，
不通过时增加非空 `problems`，包含规则码、brief 和 checkpoint。
references 为失败检查点集中提供完整规则文档，不在每个问题内重复文档。
业务结果没有当前 level、nodes、edges 或 root。过程日志只记录检查点及通过状态，
不序列化执行内的成功输出。
Task SDK 按 ContentRefSchema 生成 `{data,cidPaths}`，数组文档路径使用通配符。
文档直接按 CID 读取，不再拼接 output
space 路径；独立执行器的本地文档仍为作者路径。

## 执行边界

不跟随符号链接；根目录或读取路径发生重定向时执行失败。扫描跳过
node_modules、.git、.silvermoon、.turbo、dist、coverage，忽略范围内的
TypeScript 文件不构成身份依据。最多枚举 16384 项、64 层目录，
manifest 单文件读取上限 1MiB、总读取上限 16MiB。
workspace 配置单文件上限为 1MiB，YAML 别名展开预算为 32。

非法输入、不可访问目录、意外 I/O、读取期间文件变化、取消及预算耗尽
属于执行故障，不转换为正常 problem 或通过结果。

旧实现仅作为参考和回归基线保留于源码的 `src-legacy/`，不由当前生产入口
执行，其历史规则与参考文档不属于当前制品。
