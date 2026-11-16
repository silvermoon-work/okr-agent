# 2026-11-16 实施续接基线

保存新会话需要的已有代码、验证与操作边界，不将这些先前成果
视为本 Idea 已通过任何生命周期门禁。

## 已提交代码

- `d078b4e`：从零建立 TypeScript project 根检查，将旧源码移至
  packages/check.typescript-project/src-legacy，旧参考文档也归档，原回归继续运行。
- `8446a0d`：精简业务结果并迁移 typed content references；同时正常合入
  origin/main 的 Check Bundle Spec Idea 文档历史，没有重写历史。

新入口为 packages/check.typescript-project/src/main.ts；
registry.ts 组合 checks/project.ts 与 checks/repositories.ts；
repository.ts 只负责当前身份事实。生产入口不调用 src-legacy。

当前 TypeScript 身份实现：根 manifest 需为 JSON 对象；四类 dependencies
中的非空 typescript 声明、tsconfig*.json 或 .ts/.tsx/.mts/.cts 文件提供依据。
pnpm-workspace.yaml 普通文件或根 workspaces 字段存在即判 monorepo，
不在根解析 workspace 内容或检查成员合法性。monorepo 可由子包依赖提供身份依据。
具体过滤、链接、预算边界见包 README 与 references/check.md；这些实现细节
不代替后续工程标准讨论。

## Task 协议迁移

已使用发布版本：task-sdk/task-protocol 0.2.0-rc.2，
task-builder/task-builder-cli/task-engine 0.2.0-rc.4，
ipfs-store 0.1.0-rc.3，ipfs-payload 0.1.0-rc.0。
版本由 pnpm catalog 管理，工作区内部依赖保持 workspace:*。

- Task 契约字段为 parameters，不再是 input。
- CheckContext 使用 bundle CID 和 readContent/resolveContent/putContent，
  没有 output space、space() 或 bundle.root。
- Task callback 返回带 ContentRef 的值，由上游生成 cidPaths。
- Engine 当前仍有 output.result；其值为 `{data,cidPaths}`。
  不要在本仓库擅自删掉上游 result 层。
- 文档为直接 CID；外部问题 source 为 `{kind:"bundle",bundleCid,checker,nodeKey}`，
  不再含 outputCid。独立 executeCheck 的本地文档仍是作者相对路径。
- checkerFromBundle 接收真实 `{result:payload}`，验证子契约及 cidPaths，
  保留取消、等待释放和最终来源，不把 raw invokeTask 当执行端口。
- 业务结果没有 protocol/root/nodes/edges；可选 assets 为目录 ContentRef。
  TypeScript CAR 仍启用 assets:true，以交付标准资产。
- context.log 的 message 是 `{key,item,parent?,pass}` JSON，确保现有仅显示
  message 的 CLI 能看到 parent。首次发现决定 parent，根没有 parent。

两包 smoke、Builder 模板、真实子 Bundle 回归和 legacy callback 均已同步。
README-legacy、历史 Ideas 的旧协议描述是历史材料，不应批量重写。

## 已验证成果

提交前本轮完整 pnpm check 退出 0：包括格式、全部构建、类型、lint、
各包覆盖率、13 项发布回归、publint 和 scripts lint。
SDK 89 项、Builder 52 项、Node toolchain 116 项通过且 4 项跳过、
TypeScript project 647 项通过。

两个生产 CAR 均已重建，尚未上传或发布：

- TypeScript：`bafybeiekbq2nu4sapsxiaik5tt4rks4gexwjrk3gac6h6pebgjsixufva4`
- Node toolchain：`bafybeihadsaybxmodez7p6vekw7gejhhbcdoe3jw4pasjz36rr64nwvq5y`

TypeScript CAR 位于 packages/check.typescript-project/dist/typescript-project.car。
新旧 TypeScript 正反样例、直接文档 CID 读取、通配符 cidPaths、子来源、
故障/取消/回收均由真实 Engine 回归覆盖。

另在最新 CLI 的隔离 Server 上对 D:\Code\okr-agent 试跑，确认 pass:true、
直接 documentation/assets CID 和无 parent 根/单 parent monorepo 日志。
隔离实例已停止，其专有数据已清理；未动默认共享 Server。

## 下一会话操作

先通过 Silvermoon 观察本 Idea，阅读 Discussion.md，继续逐层讨论；
本次只是整理交接，不代表已获得构想验收或授权全面实现。

构建：

```powershell
pnpm exec turbo run build --filter=@silvermoon-work/check.typescript-project...
```

在仓库根目录试跑，注意新版是 --parameters，不是 --input：

```powershell
'{ "projectDirectory": "D:\\Code\\okr-agent" }' |
  task-engine run --car .\packages\check.typescript-project\dist\typescript-project.car --parameters - |
  jq "."
```

过程日志：

```powershell
task-engine task logs <返回的taskId> --limit 100 | jq '.data.logs[].message | fromjson'
```

如果更新了 CLI 但默认 Server 仍是旧进程，可能报 invalid_payload；
本轮未重启共享服务。由用户确认无其他任务后再重启，或使用隔离实例验证，
不要自动停止别人正在使用的 Server。

每轮必须构建 CAR 并给用户试跑命令，不用旧 CAR/CID 代表新代码。
后续规范讨论和 deliverable 迁移不应与 Task 上游接口变更混成隐式规则。

## 本轮 workspace 配置迭代

在上述基线上新增 monorepo → workspace 检查：必须提供普通文件
pnpm-workspace.yaml，内容为合法 YAML 对象，显式包含非空 packages 数组，
每项为非空白字符串。失败报告 workspace-configuration-invalid，问题文档
随 CAR 交付。不使用根 workspaces 替代 pnpm 配置，不强制目录布局。
本轮未展开成员模式；空匹配、成员 manifest、名称冲突和根包归属仍待讨论。

新增 read-file.ts 复用身份识别已有的有界读取、重定向防护及读取变化检测。
读取故障、取消、文件预算和 YAML 别名展开预算耗尽仍为执行故障。

验证：聚焦 root.test.ts 49 项通过；完整 pnpm check 退出 0，
TypeScript 包共 665 项测试通过且四项全局覆盖率均满足 90%。
最终 CAR 已在隔离内存 Engine 与现有 CLI Server 中对当前 worktree
实际执行，均返回 pass:true；未重启共享 Server。

本轮 CAR CID：bafybeidbrjmlmaq2nqzcnfpyo3c2x5iqq2yipwdy734cj6xcllb3tzskte。
产物仍位于 packages/check.typescript-project/dist/typescript-project.car。
在当前 worktree 根目录试跑：

```powershell
'{ "projectDirectory": "D:\\Code\\okr-agent.worktrees\\typescript-monorepo-discussion" }' |
  task-engine run --car .\packages\check.typescript-project\dist\typescript-project.car --parameters - |
  jq "."
```

设备级 Silvermoon 位于既有 Node 24 全局安装目录；本轮通过进程内 PATH
前置该目录调用，未重新安装或修改全局设置。当前分支已跟踪 origin/main。
whats-next 确认 Idea 仍为 preparing/unsubmitted；本轮未记录任何生命周期验收。
