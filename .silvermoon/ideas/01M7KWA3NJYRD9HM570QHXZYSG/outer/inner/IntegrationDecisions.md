# Browser Task 配套接入决定

本文是 [Implementation](./Implementation.md) 的实施补充，依据用户明确提供的发布通知与主 Agent 受托审批权，收敛 [验收矩阵](./AcceptanceTests.md) 的 D01–D06。它不是实现通过或部署验收证据，不改变已接受的构想。

## 上游版本与事实来源

用户提供准确发布提交 `b5b698191e144dc496872328fedb34eab39d4614`：

| 包 | 必须核实并锁定的版本 |
| --- | --- |
| `@silvermoon-work/task-protocol` | `0.2.1-rc.1` |
| `@silvermoon-work/task-engine` | `0.2.1-rc.1` |
| `@silvermoon-work/task-builder` | `0.2.1-rc.0` |
| `@silvermoon-work/task-builder-cli` | `0.2.1-rc.0` |
| `@silvermoon-work/task-engine-cli` | `0.2.1-rc.0` |
| `@silvermoon-work/task-sdk` | `0.2.0`，仅供 Node，不在 browser 运行时导入 |

上游 [CI](https://github.com/silvermoon-work/task-engine/actions/runs/44034024589) 及 [发布元数据验证](https://github.com/silvermoon-work/task-engine/actions/runs/44037223204) 由用户提供；不是本仓的宿主验收证明。

本次通知明确取代此前 declaration-only 阻塞：非 Node 使用 explicit 作者入口及保留的 exports，构建输出 `main.mjs`；不带 minVersion，不注入 Node SDK。callback / source.sdk / Node builtins 在非 Node 目标中拒绝。静态依赖可 bundle，资源仍经 include/binary；不假设 Builder 做 CSS import 或 URL 重写。Node Engine 拒绝非 Node 是预期的宿主边界，不要求 Engine 增加浏览器执行器。

实施方先验证上述包的真实公共接口及兼容依赖，只做必要 manifest / catalog / lockfile 更新。无法获取准确版本或接口与通知存在实质差异时报告阻塞，不用旧版本、断言或本地伪协议代替。上游通知没有授权发布 ipfsaw。

## D01：document 就是本次 Task 输入

新 `run --document` 安全解析文件后的值直接作为 Task parameters，由 Bundle 的真实参数契约校验；不由宿主增加统一 `{document,route}` envelope 或隐含字段。

Check 作者入口可以声明 Check 定义本身为参数；另一应用也可以明确声明包含 `document`、`route` 的对象。router 是应用约定，不增加通用路由参数、把正文放进 URL，或把每次前端导航当成新 Task。

显式 CID/CAR 调用不强制输入 `$schema` 以选择 renderer；输入根形状、必需字段和 schema annotation 由真实 Task 参数契约决定。legacy 根位置参数预览的 `$schema` 选择机制保持独立。共享安全解析预算不因放开 legacy 选择约束而消失。

## D02：首版保存后重新启动应用上下文

先采用可证明的最小策略：文档发生真实变化后替换应用页面 / iframe，在新上下文进行一次新的启动调用。每次启动都可以正常返回，不需要永不结束的 Task 或新的 TaskContext 更新 API。

此版本保存文档会重置应用内状态及 router 状态；正常的点击、前进后退导航不触发重新启动。该限制须在帮助 / 文档明确说明，后续如需保留状态再设计应用级更新协议。

旧异步回调不能覆盖最新 revision；解析或校验失败明确展示错误而非成功旧视图；稳定坏输入不重复获取内容或刷屏。legacy renderer 的既有 update 行为不因新增 run 而静默改变。

## D03：新增 run，与已发布入口分路

本轮保留已发布 RC 的 `ipfsaw <document>`、registry 与旧 renderer 格式语义；新增 `ipfsaw run --cid/--car --document` 只接受真正 browser Task。

两条路径必须在帮助与文档中区分，不自动把旧 manifest 当 Task，也不在新 run 校验失败后退回执行另一个协议。尽量共享安全内容 / HTTP 原语，不为兼容复制整个宿主。

不新增包、不改 alias 仓库、不自动改已发布版本的语义或宣布新版本可用。未来发布版本另行确定。

## D04：真实 TaskContext 与宿主限制

精确遵守选定上游公开的 TaskContext 类型和能力语义，不新增 DOM/资源URL/生命周期字段。允许类型级引用 Node SDK，但 browser 产物不得运行时包含 Node SDK、Node builtin 或 Worker 注入代码。

内容访问等已支持方法需实际使用公共 Store / payload 能力，具有真实授权与作用域；其他能力如暂不支持，须按照明确的宿主错误拒绝，不提供空对象、丢弃消息或假成功。实施输出完整的能力支持 / 拒绝表作为审查证据。

保留源文档 1 MiB 的现有安全边界；Task Bundle/CAR 预算以真实公共协议及更严格 Store 约束为准，不能把旧 renderer 的 16 MiB 自动当成新协议限制，也不能为“跑起来”扩大保护。对限制映射的必要新决定先交主 Agent 审查。

## D05：HTTP 就绪不是 Task 成功

CLI 仍只输出一个业务 JSON。浏览器未连接时，成功状态最多表示 HTTP `listening` 并提供受控 URL 和准确 Bundle 身份，不表示启动 Task 已执行或通过。

页面分别展示加载 / 启动、启动完成及故障；只有导出函数完成且结果经真实契约验证，才认为启动调用成功。后续可纠正错误在页面及 stderr 明确呈现，不反复追加 stdout 业务结果。

`--no-open` 保留前台服务和地址，等待用户打开；不为满足退出条件而谎称 Task 完成。错误 envelope、参数名、app/content 目录分责与 Task Engine 风格对齐。

## D06：启动调用与应用会话各自管理

CLI 持有本次 HTTP / Store / 浏览器会话的资源；退出时释放自己拥有的资源。这是关闭宿主 / 应用，不是取消已经完成的 Task。

宿主须有可实际验证的内部应用会话 close 与未完成启动 cancel，不能将关闭函数塞进序列化 Task result 或 TaskContext。close 幂等；已完成调用的旧 cancel 不关闭存活应用或把 Task 改成 cancelled。启动结果与取消以单一终态提交点处理竞态。

只承诺宿主实际能完成的资源清理，不声称所有用户 JS 副作用都能回滚或被独立强杀。复杂后台服务管理不在本轮范围。

## 验证状态

以上是受托实施选择，必须转成对应 CLI/DOC/LIFE/UPD/COMP 用例验证；42 项矩阵及历史 R/P/U/D 标签不会因此自动变成通过。新的协议实际可用、上下文能力、真实 Builder CAR、浏览器展示和资源回收仍需本仓独立证据。
