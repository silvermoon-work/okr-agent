# Browser Task 宿主设计与上游边界

本文支持 [Idea](./Idea.md)，记录本轮确认的方向和待确定接口，不表示当前 RC 已支持目标命令。上一个 [ipfsaw Idea](../../../../01M7HWQH6D0HX0GTWEGMC9A1PH/outer/inner/ideal/Idea.md) 已 completed，保留其已交付历史；本 Idea 跟进新的宿主模型，不改写旧验收。

## 1. 核心决策

不再推进独立的 Content-Addressable JS Bundle 新格式，复用 Task Bundle 的入口、运行要求、资源、契约与不可变依赖能力。Task Bundle 的交付抽象与 Task Engine 的 Node Worker 执行方式分开。

Task Engine 与 ipfsaw 是同层的宿主组件，不是 ipfsaw 必须先通过 Engine 提交一个 Worker 任务：

```text
Task Bundle / Task SDK / Task Builder
                 |
       +---------+----------+
       |                    |
 Task Engine             ipfsaw
 Node Worker           Browser Web App
```

renderer 是启动 Web App 的 Task，不再依赖单独的 `ipfsaw.renderer.json` 和 `{mount,update,dispose}` 作为新的长期包协议。已有 RC 仍采用该旧 renderer 接口；迁移方式需显式设计，不能先假装旧格式等于 browser Task。

## 2. 包与实施范围

- 宿主、加载器及需要的适配先放现有 `@silvermoon-work/ipfsaw`，开发完成后再考虑拆包。
- Check 前端仍复用现有 viewer，不复制 UI、Markdown 或 DAG 校验逻辑；它可以是首个 browser Task 作者示例。
- 不在本次预先增加通用 JS Bundle SDK、浏览器宿主独立包或新的服务管理平台。
- 独立无 scope alias 继续只委派公共 CLI；不在本仓新增无 scope workspace，不擅自修改 alias 仓库。

## 3. runtime 与上游前提

在浏览器页面 / iframe 中启动 Web App 的 Task 应声明 `runtime.type: browser`，不应为通过现有校验伪装成 node。使用 browser 运行环境不等于 Task Engine 应接受或执行它；各宿主只接收自己支持的目标。

本会话核查的已安装版本为 Task SDK/Protocol `0.2.0-rc.2`：

- `TaskBundleDeclaration.runtime.type` 只接受 `"node"`。
- 包入口固定 `"worker.cjs"`。
- `runTask()` 实现直接引用 `node:worker_threads`、`parentPort` 和 `workerData`，并需要 build-locked binding。

这些是已核查安装版本的事实，不是对上游所有未来版本的推断。不能照搬它到浏览器，不能只修改 YAML、使用宽泛断言或本地绕过校验来冒充支持。

用户已明确“我会协调”，由用户协调 task-engine 上游：

1. browser Task Bundle 的合法声明及浏览器入口。
2. Builder 的浏览器目标、依赖与 assets 构建，以及现有契约绑定能力。
3. 不绑定 Node Worker 的入口注册 / 调用支持。
4. 不改变既有 TaskContext 定义的浏览器宿主注入方式。

本仓在准确版本或受支持接口明确后对接，不擅自改 task-engine 仓库、不复制其运行时。上游就绪的实际版本、模块格式和 exports 作为实施前置证据记录。

## 4. 宿主与 TaskContext

保持 TaskContext 原定义，不增加 `container`、`assetUrl`、`onClose` 等浏览器专属字段，也不通过第二个伪 context 回避此约束。

浏览器 Task 通过环境已有的 `document` 创建挂载节点，DOM 属于 browser runtime 的能力，不属于 TaskContext 的新协议。示意：

```ts
async function start(
  parameters: Parameters,
  context: TaskContext,
): Promise<Result> {
  context.signal.throwIfAborted();
  const element = document.createElement("main");
  document.body.append(element);
  // 在本 browser 上下文中挂载应用，返回符合真实契约的可序列化结果。
}
```

这是职责示意，不是新增公开 SDK 签名。优先复用上游的 TaskCallback、契约和入口注册，不提前发明 `runWebApp`。原有内容访问等 context 能力必须按真实协议提供；不支持的能力策略需明确验证，不能成功形状的空实现或静默默认。

宿主负责创建并持有页面 / iframe、校验 Bundle、加载资源、传入启动参数并接收结果。Task 不在 Node 中 import 执行浏览器代码。现有隔离、明确授权 CID、Host/Origin、内容预算及文档只读等保护不因改名为 Task 而自动消失。

## 5. parameters、document 与 router

- CLI 的 `--document` 指向本地文档，由 ipfsaw 读取并安全解析。
- Task parameters 由宿主构造，并以 Bundle 的真实参数契约校验，不等于必须来自 URL。
- router 初始位置可以作为启动参数的一部分；后续导航由前端管理，不需要每次重新运行启动 Task。
- 不把文档正文、隐私数据或会话能力默认塞进 URL。

例如业务输入可以是 `{document, route?}`，但这是讨论示例，尚未确定所有 browser Task 的统一参数 envelope。是直接将文档作为 parameters，还是定义带 document 和初始路由的输入，需要与上游及 Check 首个实际契约一起确认，不能擅自两边各定一套。

首次加载、保存后文档更新及页面路由是三个不同动作。继续保留持续预览的用户目标，但后续更新通过何种应用通道传递、何时重启页面尚待设计；不能用“启动 Task 一直不结束”或给 TaskContext 加 DOM 方法解决。

## 6. 启动完成、cancel 与应用关闭

```text
加载/校验 -> 调用启动 Task -> 应用启动就绪 -> Task 返回
                              |
                              +-> Web App 继续存活
```

- Task 完成表示这次启动调用完成，不等于销毁它创建的页面或所有副作用。
- cancel 针对未完成的加载 / 启动过程；不是停止已经启动的 Web App。
- 启动成功后，Web App 及其宿主资源的关闭由应用会话 / 页面容器管理。
- 不能把普通结果包装成函数 handle 或声称所有副作用能自动回滚。
- TaskContext 的取消信号不应用作已启动应用的长期关闭信号。

实施时明确就绪与所有权交接点、取消和成功竞态、失败资源处理、页面关闭及 CLI 退出的关系。宿主可以在启动完成后继续运行服务，但这不是 Task 仍处于 running。浏览器优雅清理策略单独设计，不靠扩展 TaskContext。

## 7. CLI 对位 Task Engine

用户确认以 Task Engine 的命令结构与公共语义为基线，业务输入由 `--parameters` 改为更明确的 `--document`：

```powershell
ipfsaw run --cid <bundle-cid> --document .\check.yaml
ipfsaw run --car .\check-renderer.car --document .\check.yaml
```

| 项目 | 确认方向 |
| --- | --- |
| `run` | 显式子命令，不再只依赖根位置文档参数 |
| `--cid` / `--car` | 恰好一个，指定 browser Task Bundle；本地 CAR 也须完整校验 |
| `--document` | 本地文档，支持的 YAML/JSON 范围及安全读取继承/明确迁移 |
| `--data-dir` | 应用自身状态目录，不是 Task Engine 的目录，也不是内容 Store 目录 |
| `--content-data-dir` | 与 Task Engine 相同的共享 local Store 覆盖语义 |
| `--ipfs-gateway` | 缺失内容读取来源，不暗加公网 fallback |
| 配置 / I/O | 对位配置优先级、帮助、stdout 业务 JSON、stderr 日志及退出行为 |
| registry | 可保留 Schema 到 CID 的快捷选择，不是显式 CID/CAR 调用的前置条件 |

对位不是复制没有业务语义的空壳：不预设后台 server、任务历史、队列、Worker 强杀或 `--async`。这些选项只有出现对应需求才引入。帮助、错误 envelope、就绪结果和停止方式须按实施时核查的 Task Engine 契约保持一致，而不是凭旧记忆猜测。

显式指定 Bundle 时不必依赖文档 `$schema` 选择包；文档是否仍需某个 schema 字段，由该 Task 的参数契约决定。registry 自动选择流程与显式选择流程不能互相覆盖。

现有 RC 已公开根位置参数与专用 renderer 格式，因此实现前必须说明：哪些继续兼容、哪些分版本迁移、如何区分旧 renderer 和 browser Task。新目标尚未确定所有兼容策略，不静默破坏已安装 RC 用法，也不假称目标 CLI 已可运行。

## 8. 验证边界与未决项

实施前需核实：

- 上游准确 browser 协议/SDK/Builder 版本与入口形式。
- document 到 parameters 的实际映射及结果契约。
- TaskContext 所有能力的实现/拒绝语义，且无新增字段。
- 保存更新、路由、关闭及启动取消的实际调用边界。
- 已发布 RC 的兼容策略和新版本范围。

验收使用真实 Builder 构建的 browser Task CAR，而不是用旧 renderer manifest 冒充；准确 CID 与本地 CAR 两条路径都要真实浏览器验证。包含 text/assets/import、参数验证、启动失败/取消、返回后应用存活、关闭、文件更新，以及 Check viewer 的桌面和移动导航。

本 Idea 的文档和轻量下游计划不表示这些验证已完成，也不授权 npm 发布或远端制品上传。
