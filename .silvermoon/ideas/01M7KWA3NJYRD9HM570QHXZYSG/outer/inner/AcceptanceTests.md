# Browser Task 宿主验收测试规格

关联：[Implementation](./Implementation.md) / [Design](./ideal/Design.md)。本文件是首次编制的测试计划，**不是执行记录、审批或通过证明**。首次编制时没有运行以下产品测试，没有新增收集中的 skip/todo/失败用例或 browser 实现。后续已确定的配套版本与方案见 [IntegrationDecisions](./IntegrationDecisions.md)，实际证据及未完成项见 [Verification](./Verification.md)；表内原始 R/P/U/D 标签不会自动升级为通过。

## 开工条件与状态

首次编制时的安装包为 Protocol/SDK `0.2.0-rc.2`、Builder `0.2.0-rc.4`，当时固定 node/worker.cjs，确实阻塞。用户后来提供的完整 browser 配套发布已取代该历史阻塞；准确新版本、explicit ESM 入口与不使用 Node SDK 的接入方式以 IntegrationDecisions 为准。上游就绪不等于本仓的宿主 / 制品 / 浏览器验收已通过。

状态列：**R** = 已有可运行的旧行为回归，本轮未运行，不证明 browser Task；**P** = 已规划的新断言，尚无可执行用例；**U** = 被上游 browser 契约阻塞；**D** = 被明确设计决策阻塞。组合状态表示保留已有回归、另加新用例仍阻塞。所有新 browser 端到端用例均以 E01 通过为前提，即使其状态只标 D。表内 ID 固定，不随未来测试函数或文件重命名改变。

方法：单元 = 受控输入/端口断言；集成 = 真实本地文件、HTTP、公共 Store/Builder；真浏览器 = 实际 iframe、布局、网络和交互，不能由 jsdom 替代；制品消费者 = 获授权后安装准确候选包、无 workspace 链接。下表文件路径以仓库根为基准，`H` 表示 `packages\ipfsaw\test\`，`V` 表示 `packages\check-bundle-viewer\test\`；拟新增文件不是当前存在的文件或已承诺的公开 API。

| ID | 前提 / 输入 / 操作 | 可观察的预期与证明方法 | 落点 / 状态 |
| --- | --- | --- | --- |
| E01 | 用户供应/批准准确公共 browser Protocol、SDK、Builder 版本和支持说明；核对 exports、声明、构建目标和运行入口 | 能用官方合法声明及作者入口构建并在浏览器启动；记录版本、锁文件解析、API 原文位置及一个真实启动结果；不能靠断言、node 伪装或复制运行时通过。版本需更新时先由父会话决定，再安装 | 新增 `H\task-bundle.test.ts` 与真实浏览器记录；U |
| E02 | 核对与选定版本配套的 Task Engine CLI 实际 root/run help、公共配置 helper 和错误行为 | 记录准确 CLI 版本、帮助输出及对照；只复用本任务确认的选项/语义。前期主会话已通过工作区命令核查 Task Engine root/run/server-start/config 帮助，确认 run 来源互斥、app/content 目录分责、stdout JSON 与错误退出 1。该记录可作基线；仍需核查将来选定的 browser 配套版本，不因某个 Engine 库包无 bin 就推断 CLI 不存在 | `H\cli.test.ts`、`H\lifetime.test.ts`；P/U |
| E03 | 父会话明确下节 D01–D06；将选定方案、准确上游接口和预期写入对应参数化用例 | 所有条件分支有唯一适用条件，不把互斥迁移/更新方案同时要求为通过；未决项仍报告阻塞。证据为决策引用和可执行断言，不是新增虚构 SDK | 本规格及后续测试；D |

### 必须显式确定的最小决策

- **D01 参数映射**：直接文档作为 parameters，还是约定 envelope/选择机制；`{document, route?}` 仅示例。同时确定显式 source 是否以及何时需要 `$schema`，初始 route 的来源和合法性。不得因旧解析器要求对象+$schema 就默认为全部 Task 的输入约束。
- **D02 保存协议**：应用级更新通道及其确认/版本语义，或替换页面后重新调用启动 Task；二者都必须满足 UPD 不变量。不得增加 TaskContext 回调或保持启动 Task 永不结束；若选重启，须明确路由保留与有状态应用影响。
- **D03 RC 迁移**：保留旧根位置入口且与 `run` 分路、显式兼容开关/过渡版本，或经批准的破坏性新版本迁移；确定旧 registry 配置处理。历史 `0.1.0-rc.0` 本身不变，不预设永久兼容或直接删除。
- **D04 能力与限额**：按真实上游逐项决定支持/拒绝和错误契约、资源所有权；对齐 Task Bundle/Store/宿主限制及隔离授权传递。旧 renderer 限额不是自动适用的 Task 协议。新 `run` 不默认把文档、秘密或能力写进 URL/日志；旧 URL fragment 能力的兼容处理归 D03。
- **D05 就绪与输出**：区分 HTTP listening、浏览器启动成功及启动 Task 返回；确定唯一业务 JSON 的成功时点/字段、未打开浏览器时的行为、成功后异步错误的 stderr/页面呈现和退出策略。不得把 listening 宣称为 Task 成功，也不擅自沿用旧结果字段。
- **D06 页面所有权**：明确可观察的 app-close 宿主动作、单页关闭与 CLI 存活关系、关闭/取消竞态的终态提交点和有限等待策略。不通过 context 新字段或序列化函数 handle 暴露关闭能力。

## CLI、配置与文档（I-AC02；Design §5、§7）

所有 CLI 样例均以合法真实 browser Bundle 和隔离文档为前提；`CID`、`CAR` 是同一构建的两种来源。新结果字段/错误码以 E02/D05 最终契约为准，不在规格中杜撰。

| ID | 前提 / 输入 / 操作 | 预期输出 / 副作用 | 方法、复用 / 状态 |
| --- | --- | --- | --- |
| CLI01 | 分别运行 `ipfsaw run --cid CID --document doc.yaml`、`ipfsaw run --car local.car --document doc.json`；空 registry | 两路选中同一 Bundle CID，实际启动所选文档；不要求 schema registry 预绑定，不访问其 schema URL，不被 registry 中另一 CID 覆盖 | 单元+集成；扩展 `H\cli.test.ts`、`H\lifetime.test.ts`；U |
| CLI02 | 表驱动：两 source 都无/都有、缺 document、缺 option value、坏 CID、CAR 不存在、未知选项、额外位置参数、重复 source 参数 | 非法输入不启动页面或执行代码；用法错误 stdout 单行 `{ok:false,error:{code,message}}`，stderr 诊断、退出 1。重复参数显式拒绝，不能静默换源；CAR 读取失败归真实错误类别 | 单元；扩展 `H\cli.test.ts`；P/U |
| CLI03 | 对 run 设置 app `--data-dir`、独立 `--content-data-dir` 和受控 `--ipfs-gateway`；组合环境/config/default；有效及坏共享配置 | app 路径只管理 app 状态；后两项传给同一共享配置 helper 的 `dataDir`/`gateway`，依 backend 实际语义生效；原配置仍校验，override 不掩盖损坏。按 E02 核定优先级断言，不写 Engine 实例目录或个人配置 | 单元+集成；扩展 `H\config.test.ts`、`H\cli.test.ts`、`H\lifetime.test.ts`；R/D |
| CLI04 | 成功启动、参数/解析/启动失败、成功输出后清理失败；捕获双流和退出码 | business stdout 恰一行 JSON，分别 ok/data 或 ok:false/error；日志只在 stderr；失败 1；就绪后清理失败不得再发第二 envelope，应 stderr+非零退出。成功含义按 D05，不是仅 HTTP 可连接 | 单元+集成；扩展 `H\cli.test.ts`；R/D |
| CLI05 | root/run `-h/--help`、root `--version`；空参数行为按现有入口与 D03；重复调用 main | 帮助/版本为 stdout 文本、0、无内容读取/配置初始化副作用；main 返回码、不主动 process.exit，信号监听器不累积；不新增 server/history/queue/async 空壳 | 单元；扩展 `H\cli.test.ts`、保留 `H\bin.test.ts` 直接委派；R/P |
| CLI06 | 子进程在加载/启动/成功后分别接收 SIGINT、SIGTERM；受控 opener 慢关闭/失败 | 分别 130/143；等待自有 HTTP、Store、opener 和加载任务退出，移除监听器/升级计时器；opener 失败明确警告，不泄露内部秘密、不产生第二业务结果；不能把成功后的信号称为取消完成 Task | 集成+子进程；扩展 `H\lifetime.test.ts`、`H\cli.test.ts`；R/U |
| DOC01 | YAML/JSON 正常、非循环共享 alias；坏 UTF-8/JSON、多 YAML 文档、重复键、未知 tag、NaN/Inf、循环 alias、展开炸弹、深嵌套、目录/缺文件/错扩展；边界与 +1 | 安全解析接受合法内容并有界拒绝危险内容；源及展开 JSON 1 MiB 的现有保护不消失；不输出原始秘密文本，不取 schema 网络资源。根类型与 `$schema` 是否必须另按 D01/Task 契约测试，不沿袭为全局限制 | 单元+文件集成；复用/拆分 `H\document.test.ts` 的安全解析与旧 registry 断言；R/D |
| DOC02 | 以 D01 选定映射 M 和真实 schema S 参数化：S 接受 M(doc)、缺 required、错类型、未知字段、引用 schema、合法/非法 cidPaths；运行 | callback 精确收到 M(doc)，不注入隐藏字段；非法 parameters 在用户代码前拒绝，schema/payload 编解码按公共契约；显式 source 不擅自加 `$schema`，不构造未经约定的 envelope | 单元+真实 Bundle 集成；扩展 `H\document.test.ts`，新增 `H\task-host.test.ts`；D/U |
| DOC03 | 按 D01 传入合法/非法初始 route；启动后点击、后退/前进导航；文档含秘密 sentinel | route 只在约定位置初始化；后续导航不重新调用启动 Task；地址栏、历史 URL、网络 URL、stdout/stderr 无文档 sentinel/秘密/新 run 能力；文档通过已授权非 URL 通道传递 | 真浏览器+流/请求捕获；新增验收记录，扩展 `H\browser.test.ts` 的边界断言；D/U |

## 标准 Bundle、context 与隔离（I-AC01；Design §3、§4、§8）

| ID | 前提 / 输入 / 操作 | 预期输出 / 副作用 | 方法、复用 / 状态 |
| --- | --- | --- | --- |
| BND01 | 官方 browser 目标构建含真实入口、CSS/字体/图片和 text 资源的 Bundle；分别 CID、CAR 启动并读取资源 | 元数据真实声明 browser，经官方 validator；两路内容/启动结果相同、样式和资源可用；Node 不 import 执行应用；不要求假的 worker.cjs 或 ipfsaw.renderer.json | Builder/Store 集成+真浏览器；新增 `H\task-bundle.test.ts`；U |
| BND02 | 输入合法 node Bundle、未知 runtime、旧 renderer-only CAR、带旧字段但无合法 Task 声明、非法/不支持协议版本 | `run` 显式拒绝且不执行；通用上游 validator 可以接受 node，但 ipfsaw browser 运行资格仍拒绝 node；旧入口是否可独立执行仅按 D03，不自动回退伪装 Task | 单元+集成；新增 `H\task-bundle.test.ts`，旧 `H\bundle.test.ts` 留作 legacy；U |
| BND03 | 真实 Builder imports 指向已固定子根 CID，嵌套目录、text/binary assets；离线从父 CAR 导入后读取原 DAG 路径 | 子根 CID 与原始块不改，完整 DAG 可达；不展开后重打包成不同根，不上传；删除受控原内容副本后仍可仅凭完整 CAR 运行 | Builder/公共 Store 集成+真浏览器资源读取；新增 `H\task-bundle.test.ts`；U |
| BND04 | 缺声明/入口/assets/import 块、错误根类型、畸形/截断 CAR、多根/重复块等按真实上游 CAR 规则参数化；修改块字节不改 CID | 公共验证器/Store 按实际规则接受或拒绝；所有不完整或校验失败输入不得启动成功，清理 reader scope；不能发明与真实 CAR 规则冲突的 blanket 拒绝规则 | 集成；复用 `H\bundle.test.ts` 缺/错块方法，新增 Task 用例；R/U |
| BND05 | manifest/schema 无效、远端 script/CDN 依赖、未支持 URL scheme、越界资源定位；合法内容引用对照 | 按官方声明、构建和宿主授权规则明确失败，不临时安装/npm 联网修复；合法受支持资源能加载。不可把旧 renderer 路径规则不加区分套给标准 imports | 单元+集成+真浏览器网络捕获；新增 `H\task-bundle.test.ts`；U |
| CTX01 | 作者 callback 用真实上游 TaskCallback/TaskContext 编译；调用时记录实际公开成员，尝试访问 container/assetUrl/onClose；用全局 document 挂 DOM | 编译不增 context，运行时不注入这三项或隐藏替代 context；DOM 来自本 iframe/browser realm。公共合法字段/可选项按选定上游校验，不把 `Object.keys` 相等当能力证明 | 类型检查+真浏览器；新增 `H\task-host.test.ts`；U |
| CTX02 | 对选定上游公开 context 的实际能力逐项调用（例如该版本存在的内容读写、子 Task、消息、progress、log），各测授权、拒绝、失败、取消；使用真实 payload/content 引用 | 每个已支持项返回可验证实际效果/结果与正确 scope；不支持项按 D04 明确失败，无空对象/假成功/静默丢弃。字段和可选项以准确公共版本为准，不把本规格的例子扩展成 context 新要求，也不因共享类型就宣称能力已实现 | 集成+真浏览器；新增 `H\task-host.test.ts`；D/U |
| CTX03 | 合法 schema 结果、错类型/缺字段结果、函数 handle、不合法 message/payload/reference；callback 同步抛错或 reject | 合法结果按官方 schema/payload 语义完成；非法结果/消息被明确拒绝；关闭函数不混入序列化结果；调用方收到安全故障，清理自有资源，无未经校验的成功 envelope | 单元+真实 Task 集成；新增 `H\task-host.test.ts`；U |
| SEC01 | 错 Host、外部/null Origin、缺/错能力；另一 iframe 的握手、错 source/port、重放旧 revision；合法请求对照 | loopback 绑定、Host/Origin、来源和权限检查保留；只有批准页面可收文档，opaque app 无权读宿主文档接口，不开放任意 CID/file proxy、目录列表；旧 HTTP 403/404/405 用例可复用，新增端点按实际协议断言 | 集成+真浏览器；扩展 `H\preview.test.ts`、`H\browser.test.ts`；R/U |
| SEC02 | 绝对路径、`..`、编码穿越/分隔符、query、foreign CID、未批准 asset；尝试网络/表单/顶层导航/同源数据读取 | 非授权路径无泄露；不可变 assets 的 CORS 不扩展到文档 API；sandbox/CSP 按 D04 对真实 browser SDK 的必需能力最小授权，不无理由放宽或为修复失败关闭隔离；真浏览器证明请求被阻断 | 单元+HTTP集成+真浏览器；扩展 `H\bundle.test.ts`、`H\preview.test.ts`、`H\browser.test.ts`；R/D |
| SEC03 | 对每项选定限制测试 L−1/L/L+1；更严格 caller Store；慢客户端、并发连接、慢清理/挂起加载 | 限制内真实成功、超限显式有界失败且无资源累积；不得降低上游/Store 约束。旧基线是 manifest 64 KiB、逻辑 renderer/reader 各 16 MiB、2048 files、8 SSE、500 ms dispose、4 待销毁上下文；Task 对应限额需 D04 对照，不自动强加旧 16 MiB 或把旧 dispose 当 Task 协议 | 单元+集成压力边界；扩展 `H\bundle.test.ts`、`H\preview.test.ts`、`H\browser.test.ts`；R/D |
| SEC04 | 测试固定独立 app/content config、受控 local Store；坏配置、离线缺块、Kubo 配置；监测写入/HTTP/上传端口 | 不读写个人目录/Store，不改 userStore 配置、不加公网 fallback；缺块明确失败；CAR 导入不产生隐式远程上传，backend 不支持时在副作用前拒绝；关闭自有而非 caller Store，不停 Kubo/删缓存/pins | 集成；扩展 `H\lifetime.test.ts`、`H\bundle.test.ts`、`H\preview.test.ts`；R/U |

## 调用完成、取消与文件更新（I-AC02；Design §5、§6）

用可控闸门暂停真实启动 callback/内容读取，不靠任意 sleep 猜竞态。闸门只用于测试调度，不定义新的公开 Task API。真浏览器动作由外部测试控制，启动 Task 不返回函数 handle。

| ID | 前提 / 输入 / 操作 | 预期输出 / 副作用 | 方法、复用 / 状态 |
| --- | --- | --- | --- |
| LIFE01 | callback 挂载可交互按钮后返回合法普通结果；等待宿主观察启动完成，再点击按钮并导航 | 本次调用已 resolve、取消订阅/调用资源已释放、无 pending 启动；页面仍存活且点击改变 UI；应用活着不是 Task 继续 running。不能仅靠页面存在或类型断言证明 | 真实 SDK 集成+真浏览器；新增 `H\task-host.test.ts` 与验收记录；U |
| LIFE02 | 加载前已取消、读块中取消、callback 执行中取消，分别释放闸门 | 未完成启动有一个取消终态；不再报告成功、不保留部分页面/监听器/reader；等待实际异步资源结束，不因后端以普通 Error reject 漏清理；context.signal 按公共契约传播 | 单元+集成+真浏览器；扩展 `H\preview.test.ts` 的取消回收，新增 Task 测试；U |
| LIFE03 | LIFE01 已完成后发出同一启动调用的 cancel；另一次通过 D06 独立 app-close 动作关闭 | completed 调用不重新变 cancelled，不 abort 已完成启动 signal 来实现关闭；cancel 不关闭当前应用；独立 close 才移除页面/会话资源，重复 close 幂等 | 集成+真浏览器；新增 `H\task-host.test.ts`，扩展 `H\lifetime.test.ts`；D/U |
| LIFE04 | 取消与成功闸门按“取消先/完成先/同轮排队”控制，重复确定性调度；同时收到旧启动成功 | 以 D06 的单一终态提交点判胜负，恰一次结果；取消胜则无应用残留，成功胜则应用继续且旧 cancel 不误关；旧回调不覆盖当前会话，没有双 envelope/未处理 rejection | 单元确定性竞态+真浏览器抽样；新增 `H\task-host.test.ts`；D/U |
| LIFE05 | 页面创建后入口/样式加载失败、挂部分 DOM 后抛错、错误结果、启动超时；完成后再出现异步 UI 错误 | 启动失败不报告成功，部分资源清理且安全故障可见；完成后的错误不倒改 Task 终态，按 D05 在页面/stderr 呈现、无第二业务 envelope；不保证任意恶意脚本自动回滚 | 集成+真浏览器；扩展 `H\browser.test.ts` 的 CSS/异步错误测试，新增 Task 生命周期测试；U/D |
| LIFE06 | 单独关 app/page、CLI 正常退出/信号、启动中退出；自有 opener 报 error 但稍后 close、Store close 失败、caller Store 同时可用 | D06 约定的会话动作独立可观察；自有 HTTP/端口/监听器/计时器/reader/opener 被释放，caller Store 仍可读；清理失败明确上报，重复清理幂等，无假称插件必定优雅退出 | 集成+真浏览器/子进程；扩展 `H\cli.test.ts`、`H\lifetime.test.ts`、`H\preview.test.ts`；R/D |
| UPD01 | 初次合法 A，普通保存 B、同路径原子替换 C、短暂缺失后 D、非法 JSON 后合法 E | 最终仅展示最新有效内容；缺失/非法阶段有明确非成功状态，不保留看似当前的旧视图；恢复无需手工重启 CLI。投递/重启具体机制按 D02，不能伪装无穷启动 Task | 文件/HTTP集成+真浏览器；扩展 `H\preview.test.ts` 的 save/replace/recovery；R/D |
| UPD02 | A 启动/更新未完成时写 B/C，故意让旧 A 成功或失败晚于 C；快速连续写入、切换合法 Task 输入 | 旧成功/错误均不能覆盖新修订；最终 C 及其状态稳定可见；过期页面不抢焦点，不累积上下文/调用。无须每个中间写入都启动，但不得丢最后有效修订 | 确定性集成+真浏览器；扩展 `H\preview.test.ts` 的旧内容异步提交、`H\browser.test.ts` 的 revision 用例；R/D |
| UPD03 | 同一坏文档/缺块保持多个轮询周期；随后真实保存修复；同内容重复保存 | 无重复错误风暴/无限重读 Store/重复启动；真正修订触发重试并恢复，次数有可观测上界，页面不反复闪烁；不预设尚未决定的 debounce 毫秒值 | 单元受控时钟+集成；扩展 `H\preview.test.ts` unchanged failed inputs 用例；R/D |
| UPD04 | 依据 D02 选定协议：合法/非法/乱序更新确认，或重启时保留/重置路由；更新中 close/cancel | 只测试批准分支：通道按真实 schema/授权/修订处理，或旧页面释放后独立新启动；导航本身不启动 Task；旧启动的 cancel 不误伤已交接应用。不得新增 onUpdate/onClose context 或把普通 result 当 handle | 集成+真浏览器；新增 `H\task-host.test.ts`，扩展 `H\browser.test.ts`；D/U |

## Check 作者示例、迁移与交付证据（I-AC03；Design §2、§7、§8）

已有 `V\spec.test.ts` / `V\viewer.test.tsx` 是严格 DAG/组件行为主回归；`V\browser.ts` mock 了 matchMedia、dialog 和 rAF，不能证明 iframe 初始媒体查询、真实焦点或布局。`V\renderer.test.tsx` 只证明旧 mount/update/dispose ABI，不能重标为标准 Task 测试。

| ID | 前提 / 输入 / 操作 | 预期输出 / 副作用 | 方法、复用 / 状态 |
| --- | --- | --- | --- |
| VIEW01 | 首个 Check 作者源使用真实公共 browser Builder/SDK，复用现有 viewer；准确 CAR/CID 两路启动同文档 | 不复制 UI 或手写冒充 Task 的 renderer；两路展示相同身份/文档/资源，桌面截图+交互和构建版本/CID 可追溯；不是宿主预置 fixture 下拉框 | 新增作者入口的集成测试及真浏览器记录；复用 `V\spec.test.ts`；U |
| VIEW02 | 桌面足够容纳的 viewport，选定含共享 DAG、重复 parent edge、叶节点的真实定义；展开/切换节点 | 导航行计算高度 32px、单行紧凑标题、详情独立滚动；Parameters 从 schema 直接字段与 preconditions 展示、不推导隐藏组合字段；Problems 表格；空 Children 隐藏；Parents 按 children 每条边推导且重复边稳定保留 | 复用 `V\viewer.test.tsx` 紧凑导航/参数/Parents 用例；仅补缺口；32px/滚动/溢出用真浏览器 bounding box、computed style 和截图；R/U |
| VIEW03 | Markdown 含段落、表格、代码围栏、行内代码、引号、HTML、javascript/data link、远程 image、`${expression}`；共享菱形 DAG 与循环/缺引用对照 | 合法 Markdown/代码/引号可读且惰性；raw HTML/危险链接/远程图片不执行/不请求，schema JSON 保持字面值；共享 DAG 接受，循环拒绝且无正常导航伪成功；不执行 checker/说明表达式 | 复用 `V\spec.test.ts`、`V\viewer.test.tsx`；仅补 quote 缺口；真浏览器检查网络和无脚本副作用，不在 host 重写整套 UI 测试；R/U |
| VIEW04 | mobile viewport 新页面，iframe 初始 hidden 再显示；选节点、Escape、关闭/重开、桌面↔mobile resize；覆盖初次 matchMedia/rAF 时序 | 初次可见就采用 mobile pane，无桌面树闪现/裁切或必须 resize 才恢复；原生模态开闭、焦点陷阱/还原、选择后详情焦点正确，Escape 有效；resize 保留选择/折叠且移除陈旧 modal 状态 | 复用 `V\viewer.test.tsx` mobile 用例；真浏览器实际 iframe+viewport+键盘验收，不以 jsdom 的 showModal mock 替代；R/U |
| COMP01 | D03 若选保留兼容或显式 gate：用旧根位置 document、旧 renderer CAR/config、registry 命令和直接 React 文档；再运行新 run | 旧入口按明确路由/gate 保持承诺行为，旧无 `$schema` 的直接 React 用法不变；新 run 不把旧 ABI 当 Task；无歧义 format/source 选择，显式 source 不强制 registry；帮助和警告说明边界 | 条件用例：复用全部旧 `H` 与 `V\renderer.test.tsx`，扩展 `H\cli.test.ts`；D |
| COMP02 | D03 若选批准的破坏性版本迁移：旧 CLI/config 输入、文档化迁移步骤、新命令对照 | 新版本在执行前给可操作迁移错误，不静默解释成不同程序/覆盖原配置；显式迁移可复现；准确已发布 `0.1.0-rc.0` 行为不被改写为新协议。此分支不同时要求新版本永久支持旧 ABI | 条件用例：扩展 `H\cli.test.ts`、`H\config.test.ts`；D |
| COMP03 | 获授权后以准确候选包版本/提交/tarball 标识安装到仓库内隔离消费者目录，无 workspace 链接；同一真实 Builder CAR，CID 在受控本地 Store；另以授权取得的准确 RC.0 对照 | 已交付 files/exports/bin 实际可用，main/alias 薄委派不二次 npx；CID/CAR 展示一致；按选定迁移策略验证，不读取被排除历史目录或重建其制品。记录安装来源、Node、包版本、CAR CID/哈希、命令、双流、退出码；不安装/运行未知升级、不上传、不发布 | 制品消费者+真浏览器；将来新增 `H\task-consumer.test.ts` 或外部验收记录，RC 对照非当前新 Task 证明；D/U |
| QUAL01 | 前置和决策已满足，实现完成；先运行相关现有/新增测试与类型/格式/lint，再根 `pnpm check` | 所有真实结果逐项关联 ID，四项全局 90% 不变、未测源码仍计入；准确 Node `.node-version`（当前 26.13.1）和 packageManager（当前 pnpm 11.28.12），不抬高最低 engines 22.15.0；不以 skip/缩 include/弱化门禁过关 | 既有 targeted Vitest 与固定脚本、根 check；P/U |

## 执行顺序、隔离与证据格式

1. 先完成 E01–E03；上游缺失时停在规格，不生成假 browser Bundle、猜测 exports 或复制 Worker 到浏览器。D01/D02/D03/D04/D05/D06 的批准分支应写进相应测试输入与预期，然后才把 U/D 转为可执行用例。
2. 先复跑受影响的现有回归，再为新增真实行为写红测试、实施、跑针对性绿测试。优先复用 `H\helpers.ts` 的仓库内 `.test-work` 隔离/回收；其 `rendererFixture()` 只能留作 legacy，新增 Task fixture 必须由真实上游 Builder 生成。不使用个人配置，不自动访问 gateway/Kubo/registry；如确需其他临时消费目录，遵循仓库指导并先确认准确路径与访问许可，不访问或换路径绕过已有组织排除。需要服务的试验必须显式授权并受控；现有集成中的 loopback HTTP 不是外部服务。
3. 不因本规格新建工具、依赖、测试 runner 或 source 文件。未来针对性执行沿用文档命令，例如 `pnpm --filter @silvermoon-work/ipfsaw exec vitest run --root . --config ../../vitest.config.ts test/cli.test.ts test/document.test.ts`；覆盖变动后运行原 typecheck/lint/test-coverage 及根 check。真实浏览器和制品消费者由父会话安排，不把 DOM-only/mock 成功计为其通过。
4. 每条执行记录至少包含：ID、状态（未运行/阻塞/通过/失败）、准确提交和公共依赖版本、选定 D 分支、输入/文档标识、Bundle/CAR CID、运行命令、预期与实际差异、stdout/stderr/退出码或浏览器证据、资源回收结果。敏感内容不进 URL/日志/证据；以受控 sentinel 证明无泄露。失败不得隐藏，阻塞不得标通过。

本轮只校验本文件与 Implementation 的本地链接、ID 定义/引用和编辑范围；不运行根产品门禁，不创建生命周期事件、提交、远端制品或发布操作。
