# 本地部署验证（第一轮）

本文支持 [Deployment](./Deployment.md) 的 D-S01、D-S02、D-AC01、D-AC02，仅记录本轮新的实际可用性检查；不回写已接受的 Inner World，不表示部署门限已接受，也不表示 npm / registry 交付完成。

## 检查起点及准确输入

检查开始前已确认工作区 clean，`HEAD = origin/main = 5d0e22e2b6b9254bf96aebbd3e398f1cbdbe3d1f`；本轮检查针对当时**已同步**的准确 `deploymentRevision=638c5cd18c5142369973c5e85aa1a628905c5880`。已接受的 inner tree 为 `b4b060f641cabf08fcd5b4b5b129ab6151908690`，事件 digest 为 `4719ac20d8af3e2d9b589f3d79655f1b95f2a0d2`。未更改 canonical Deployment 或任何 inner 文件。

- Node `26.13.1`，pnpm `11.28.12`，Chrome `157.0.8103.51`。
- 沿用两份不可变准确 tarball，未重打包或改写：主包 SHA-256 `766a1fe8db0af60ff00bca5e67a87617551c0d17f55de02232336b45a6994db8`；alias SHA-256 `c6e4a7f8a05c55205848f94a7b7bcd36cc1f56f44c23ee2c6da953612f4f3293`。
- 源码身份：主包 `91ae6878561be0809bb5491c53f3aa0b6a5826f4`，alias `bbd41daf642d7d702547b9bf434291190652a95e`。
- 新 consumer 为本次创建的 `C:\Users\Wei\AppData\Local\Temp\ipfsaw-deployment-20261116-v1`，同时安装准确两包，consumer-only override 把全部主包引用固定到同一 tarball。安装和冻结安装均禁用生命周期钩子并退出 `0`；不依赖主包 registry、workspace 链接或 stub。两包仍为 private；alias 的实际唯一运行时依赖仍为主包准确 `0.1.0-rc.0`，从 alias 的 ESM 上下文解析 `/cli` 后真实路径与 consumer 的准确主包相同。

## 新的真实 JSON / YAML 浏览器检查

[机器结果](./deployment-evidence/deployment-result.json) 记录两场景。JSON 和真正由 `yaml.stringify` 生成的缩进 YAML 各有独立本地文档、应用配置、local Store、前台 alias 进程与 Chrome profile；均经实际安装 alias bin 启动，浏览器打开其本次回环能力 URL。没有更改 sandbox、CSP 或站点隔离，也没有以旧实施预演代替本轮运行。

| 场景 | JSON 与 YAML 的实际结果 |
| --- | --- |
| 首次打开 Check | 正确文档标题进入真实 iframe，`Revision 1`；就绪结果 renderer CID 等于批准 Check CID，未授权文档 API 为 `403` |
| 桌面导航 | 实际点选“单仓项目”；详情从 `project / 识别项目` 变成 `single-repo / 单仓项目`，不是只看首屏 |
| 普通保存 | 写入新标题，真实 iframe 出现新文本，`Revision 2` |
| 暂时缺失 | 同目录移走自有文件，页面 `role=alert` 且旧视图隐藏；恢复文件后 `Revision 4` |
| 坏输入及纠错 | JSON 为 `Invalid JSON syntax at 1:3`，YAML 为 `Invalid YAML (BAD_INDENT) at 2:1`；均隐藏旧视图，纠正后 `Revision 6` |
| 原子替换 | 同目录新文件覆盖受控文档，出现新标题，`Revision 7` |
| 390×844 mobile | 实际打开 dialog，点选“单仓项目”后详情改变且 dialog 关闭、`aria-expanded=false`；再次打开后也验证了独立关闭按钮 |
| 不同 Schema | 切到非 React note renderer，显示 `Note:` 及新标题；证明本轮文件派发不是 Check 硬编码 |
| renderer 故障 | 受控 `explode` 使页面显示 renderer 错误、隐藏旧视图；纠正后恢复 `Revision 10` |
| 缺 renderer 资源 | 显式批准但本地没有块的另一个准确 CID 实际加载失败，页面显示“Renderer content could not be loaded or verified”、隐藏旧视图；改回已存在的 note CID 后恢复 `Revision 13`。这不是把预计 404 当作成功 |
| 返回 Check | 两场景都恢复 Check 文档和标题，`Revision 14` |

本轮 Check CID 为 `bafybeic4n2qhjpk4ygo54gqz5qoeng3fhp2i4y5l2rw7szrxwclj7gceri`；note CID 为 `bafybeibr43ykc5s7hg454e4wy4b73hizxjagiezusp7nbwqsha6thwtvqy`。缺资源测试只使用自建 local Store 与专用配置中的 `bafybeiafzc7pgcssyl3xhus4kai6m22dwmgmlyzgzxryddww4fkizlbtba`，不访问个人内容配置或公网 gateway，不上传源文档。

截图：[JSON 桌面](./deployment-evidence/json-desktop.png)、[JSON mobile](./deployment-evidence/json-mobile.png)、[YAML 桌面](./deployment-evidence/yaml-desktop.png)、[YAML mobile](./deployment-evidence/yaml-mobile.png)。截图由 Chrome 捕获；当前模型不支持图像输入，结论依据真实浏览器 DOM / 协议断言，不声称人工视觉审阅。

## 中断、实际退出与所有权边界

JSON 场景经自有 IPC 在真实子进程中触发 `process.emit('SIGINT')`，alias 实际关闭并返回 `130`；YAML 场景使用受控 `SIGTERM` delivery，实际返回 `143`。均等待 `close`，stdout 仍只有一行就绪 envelope，之后页面显示连接已关闭并隐藏视图，原 HTTP 端口拒绝连接。该 delivery **不是**原生 Windows console Ctrl+C 或 Unix OS signal 测试，没有向宿主 console 广播信号。

两个独立 Chrome 进程均等待到 `close / exit 0`。[进程审计](./deployment-evidence/process-audit.json) 在两场景完成后按本轮专用 profile / 文档路径过滤自有 node / Chrome，数量为 `0`。不停止外部 Kubo daemon，不删除共享缓存、他人 pin 或个人配置。

实际 CLI 进程退出及端口释放，加上准确源码既有 Store 所有权回归，证明本次前台运行不再持有这些资源；不把进程退出伪称成任意第三方 renderer 都完成异步 `dispose`。测试准备用 Store 在启动 CLI 前已显式关闭。

## 质量检查、复现与后续确认

本轮根 `pnpm check` 退出 `0`：格式、依赖序构建、严格类型、typed lint、覆盖率、13 项 release regressions、已登记 npm 包 lint 与脚本检查均完成。ipfsaw 83、viewer 40、TypeScript 项目 665 项测试通过；原有 toolchain 的 4 项明确原生平台跳过保持原样，未移除测试或修改四项 90% 门限。ipfsaw statements `96.97%`、branches `91.76%`、functions `100%`、lines `97.84%`。

本次本机 runner 保留在忽略目录 `packages/ipfsaw/.test-work/deployment-20261116/verify.mjs`，SHA-256 为 `98fbe4c45c9c06741740ed66a889fb1b9a68017ff4302fe344d09c5339d41060`；它是一次性部署验证脚本，不是已接入默认 CI 的跨平台浏览器套件。复跑前准备新的受控文件 / profile（脚本每次自行创建），核验准确 tarball，再使用 consumer 自己的固定依赖与 override：

```powershell
pnpm --dir <consumer> install --ignore-scripts
pnpm --dir <consumer> install --frozen-lockfile --ignore-scripts
$env:IPFSAW_DEPLOYMENT_CONSUMER = '<consumer>'
$env:IPFSAW_DEPLOYMENT_REVISION = '<刚观测且已同步的准确 outer tree>'
node packages/ipfsaw/.test-work/deployment-20261116/verify.mjs
pnpm check
```

脚本在任何浏览器检查前，先断言当前 committed outer tree 等于传入 revision，且 accepted inner tree 未变。本文件和新证据加入 Outer World 会改变其修订；本条为第一轮记录，主 Agent 先独立复核并同步外层证据，再以稳定的新准确 deploymentRevision 做第二轮只读确认，之后才更新 idea-root ledger 的 D 项，不用本条第一轮记录直接勾门限。

本轮未修改主 / alias 源码、manifest、工具配置、锁文件、旧证据、events 或 ledger；没有 stage、commit、push、npm 发布、release tag 或远端 tarball/CAR 上传。registry `npx ipfsaw` 交付与远端准确 SHA CI 不在本次本地部署结论中；门限决定由主 Agent 独立完成。
