# Node.js Toolchain Check

私有 Check Task 作者包 `@silvermoon-work/check.nodejs-toolchain`，交付标准 CAR，
不发布 npm。生产实现按 [docs/spec.yaml](docs/spec.yaml) 执行七个有序检查点；
通过继续、首次业务失败即停止。业务输入不含项目目录、PATH 或 context。

## 设备标准与输入

固定检查 nvm、node、npm、pnpm、nrm。最小默认全局包基线为 `pnpm` 和
`nrm@1.2.6`；固定 registry 为 `npm → https://registry.npmjs.org/`，默认选择
`npm`。
nrm 固定版本源于现有只读启动支持边界，不代表它是最新版本。
基线写在 [policy.ts](src/policy.ts)，不从当前设备或 NRM 设置反推。

默认输入 `{}`，仅允许四个可选参数：

```json
{
  "minimumVersions": { "node": "22.15.0" },
  "defaultPackages": ["typescript"],
  "additionalRegistries": [
    { "name": "company", "url": "https://registry.example.test/" }
  ],
  "defaultRegistry": "company"
}
```

示例不是默认政策。最低版本按任意精度数字段比较；省略下限不跳过工具。
`defaultPackages` 仅接受追加包名，不能覆盖基线版本约束。注册清单为基线与追加项
的并集，同名同 URL 规范化去重，同名不同 URL 拒绝；默认项必须引用合并清单中的名称。
无效输入在探测前拒绝，不从设备上的额外项或当前选择兜底。

| 顺序 | Checkpoint        | 职责                                                    |
| ---- | ----------------- | ------------------------------------------------------- |
| 1    | nvm-installation  | 入口可执行、版本可识别且满足可选下限。                  |
| 2    | node-installation | Node 可执行、版本合格，并确认属于 nvm 管理的安装。      |
| 3    | npm-installation  | npm 可执行、版本合格、独立确认 nvm 管理及与 Node 配对。 |
| 4    | pnpm-installation | 入口可执行、版本可识别且满足可选下限。                  |
| 5    | nrm-installation  | 先验证只读启动身份，再核验可执行性与版本。              |
| 6    | nvm-configuration | 自动重装配置包含固定全局包基线及追加项。                |
| 7    | nrm-configuration | 必需注册名称、URL 和 nrm 当前选择符合期望。             |

Rule code 使用所属 Checkpoint
ID 前缀，brief 区分具体失败事实。同一步可保留多个问题，
前置失败不追加派生问题。安装步骤的成功入口与版本仅通过本次 `outputOf` 共享；
不自动进入日志、业务结果或 IPFS。配置成功不新增数据。

## 环境与只读边界

使用 Task Engine `0.2.2-rc.0`。Node Worker 可以正常读取 `process.env`；
设备环境由受信任的执行宿主决定，不是业务参数，也不扫描父进程补全。
该 Engine 默认使用 Node 原生环境继承，可能包含凭据，**只执行可信 Task**。
本包运行脚本显式使用公开
`workerEnv`，只传所需命名字段，不将整个环境塞入输入或日志。

每次 Run 创建独立设备探测目录并在成功、业务失败或执行错误后清理，
不受目标项目的 .npmrc/workspace 配置覆盖。远程执行只证明远端执行设备，不证明控制机。
只运行固定只读命令，不安装、切换、更新、发布、修改配置或测试网络/认证；
保留原生适配器的启动副作用防护、每命令 10 秒预算、256
KiB 输出上限及实际子进程回收。

nvm-sh 使用设备 `NVM_DIR/default-packages`；nvm-windows v2 读取
`auto_installed_modules`，旧版 1.2.2 没有该原生机制时不通过，不自动升级。
新 Windows v2 读取格式有受控测试，但未据此声明真实 v2 宿主已通过验收。
配置合格不等于已安装全局包，也不保证每次 `nvm use` 都补装。

nrm 只读启动仍仅支持已验证的 1.2.6 标准入口；未知包装入口或其他实现先拒绝，
不执行可能改写配置的未知 CLI。当前选择按 URL 比较，同 URL 别名等价；
不额外查询或推断 npm/pnpm 的实际生效 registry。

## 构建与本机检查

在仓库根执行：

```powershell
pnpm exec turbo run build --filter=@silvermoon-work/check.nodejs-toolchain
pnpm --filter @silvermoon-work/check.nodejs-toolchain smoke
```

默认运行当前执行设备的真实 CAR。标准输出为单份 JSON，包含准确 Bundle CID、
Task/Run 状态及业务报告；业务不通过或执行故障均为非零退出码，不伪装成验收成功。
可用 `--parameters <JSON文件>` 提供上述业务参数，不支持旧项目目录位置参数。
文档引用为真实 CID，脚本验证文档可读及 Run 已回收。

```powershell
pnpm --filter @silvermoon-work/check.nodejs-toolchain smoke --fixture
pnpm --filter @silvermoon-work/check.nodejs-toolchain typecheck
pnpm --filter @silvermoon-work/check.nodejs-toolchain test-coverage
```

`--fixture` 使用自有工具、用户目录及显式 Worker 环境，通过真实 Engine/CAR
验证通过与不通过；不是实际设备或平台兼容性证明。普通测试不依赖个人工具和配置。
macOS/Linux 的 nrm 夹具在重写入口后显式设置执行权限，再建立软链接。
`native-test` 仍显式保留真实已安装工具的原生适配回归，CI 的 smoke 使用受控环境。
该命令直接运行 Vitest；`vitest.native.config.ts` 复用共享配置，仅选择
`test/inspect.test.ts` 并设置
`TOOLCHAIN_NATIVE_TESTS=1`，不影响默认测试与覆盖率命令。

## 文档、历史与制品

Builder 从 Spec 生成 Task 总览与每个 Checkpoint 的 Agent instructions、Rules 和
成功输出文档，不回写源 Markdown；生产文档范围为 `references/device`。
过程日志只记录 checkpoint/pass，失败 references 按 Checkpoint 聚合，不维护逐规则文档。

[src/legacy](src/legacy/) 保留旧输入与两步编排，旧回归仍执行原断言，
仍处于严格 TypeScript、lint 和覆盖率范围，不是生产入口。
原生成熟适配器复用自该目录；它们的既有防护和边界没有因迁移放宽。
`check.fixture.build.yaml` 与 `legacy-smoke.mjs` 只构建历史回归 CAR；
历史平台记录见 [README-legacy.md](README-legacy.md)，不代表新流程验收。
新输入拒绝旧 context/requirements，历史 npm/CAR 不会自动升级，消费方必须重建并固定准确新 CID。
