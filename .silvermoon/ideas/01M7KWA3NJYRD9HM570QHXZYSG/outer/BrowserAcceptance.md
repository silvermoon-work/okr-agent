# Browser Task 本地交付验收

## 交付身份与范围

代码提交：`5b13e1701fdab959d91cd8095e109d8ccb66cb5a`。实现门限已对准确 inner revision 单独记录；本报告服务于 [Deployment](./Deployment.md) 的本地交付验证。

本轮只交付源码与本地候选，不发布 npm / tag、不上传 IPFS、不改无 scope alias 仓库。源码保留已发布主干版本号 `0.1.0-rc.1`，**不表示全局已安装 RC.1 含新 run 功能**。用户需从本源码构建或使用获授权的准确候选试跑。

```powershell
pnpm exec turbo run build --filter=@silvermoon-work/ipfsaw
node packages\ipfsaw\dist\bin.js run --car packages\ipfsaw\dist\check-task.car --document packages\ipfsaw\dist\check-task.json --no-open
```

使用者的内容来源继续服从正式共享 Task Store helper。验收实际使用同一配置机制下独立受控的 local backend，不读取或改写个人配置、不声称验证了用户的 Kubo/远端节点。应用 data-dir 与 content-data-dir 分责保持一致。

本轮真实 Check Task CAR 根：

```text
bafybeifl7pv4bc7rwrq7tsnjujlzcevsuzzsp6afs52t3stqcljhe52mca
```

本地候选 tarball 的 SHA-256：

```text
fab2ec25fd0f5b2730fdbb894b0895e18eb250866186aa0877235137a1f2befc
```

准确包内容、72 个源码/构建文件一致性、独立消费者、strict publint 及根检查的实施证据见 [Verification](./inner/Verification.md)；不是 registry 或远端 CID 可获取性声明。

## 已有真实浏览器证据

主 Agent 而非实现 subagent 独立完成：

| 场景 | 结果与边界 |
| --- | --- |
| `run --car` | 标准 Builder 生成的 browser/main.mjs Task，从本地 CAR 加载，真实校验原始 YAML 参数 |
| `run --cid` | 将同一 CAR 只导入验收自己的 local Store 后按相同 CID 打开，展示和交互相同；不借 registry、不联网兜底 |
| document | 不带 `$schema` 仍能传入真实 Task schema，安全 Markdown/字段代码渲染；错误 specVersion 隐藏旧应用、报告参数错误 |
| 启动完成 | 浏览器显示 Started 后依然可点击成员节点，Task 调用完成与应用存活分离 |
| 取消与关闭 | 启动中 cancel 能移除未交付页面；启动返回后 cancel 无效；独立 close 才移除已运行应用 |
| 文件与路由 | 保存后新 revision 重启应用并重置选中状态；独立作者 fixture 的内部 hash 导航保留 runId，不重新启动 |
| 原生桌面 | 1280px Chrome 宿主中 1265px iframe，32px 单行树，无横向页面溢出，叶节点无 Children，Parents 正确 |
| 原生 mobile | 390px Chrome 宿主中 375px iframe，默认详情，navigation pane 为真实 modal，焦点包含于侧栏、选择节点后返回详情 |
| 刷新 | 同一 tab reload 后保留 origin-bound history 能力，重新启动成功，不重复暴露 fragment |
| 控制失败 | 模拟 cancel/close 的真实 HTTP 503，页面区分“未确认”和“已关闭”，不吞错误或伪报资源回收 |
| 隔离消费者 | 只有准确本地 tarball 与生产依赖，无源 workspace 链接；从安装包自带 runtime/CAR 在原生 Chrome 重做交互、刷新及关闭 |
| 退出 | 消费者的公共 main 在受控 SIGTERM 事件后返回 143，端口已关闭，stdout 只有一个业务 JSON；不是跨平台 OS 信号投递的泛化证明 |

原生截图保存在本会话的 `browser-task-acceptance` 附件；opaque iframe 的截图取自真实 Chrome compositor，不通过取消隔离来“修好截图”。

## 本地部署复核方式

此报告和部署契约同步到 primary 后，对同一未改源码再复核：

1. 独立受控内容配置下的 HTTP 就绪、标准 browser Task 参数和实际页面启动。
2. 源码或准确消费者保持同一 CAR 根；Started 后仍可导航，完成后 cancel 不关闭，独立 close 成功。
3. 停止本次启动的服务和浏览器，检查端口及源码状态；不终止用户已有服务。

这些是本地使用验收，不把源码单元测试或上游发布 CI 替代为浏览器证明。未验证 Cloudflare 部署；旧 registry renderer 与 Node Worker 仍有各自语义，不把通用运行目标扩大到它们。

## 已知使用限制

- 首版保存会重启应用，应用内状态和 router 状态重置；普通前端导航不重启。
- 当前 context 提供实际 scoped read/resolve；写入、子 Task、消息和日志等能力明确拒绝，不能称为任意 Task 的完整通用浏览器执行器。
- iframe / CID 不是任意代码可信或绝对沙箱的证明；只应显式加载信任的包。
- 新功能仍未发布，独立 alias 的更新发布由用户另一个 session 管理。
