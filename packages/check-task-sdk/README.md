# Check Task SDK

基于 Task SDK/Protocol 0.2.0-rc.2 的检查图组合，不复制 Engine 或 Builder。
消费者最低 Node 仍为 `>=22.15.0`，开发 Node 独立读取 `.node-version`。

当前业务结果仅包含 **`pass`、`documentation` 和失败时的 `problems`**。
检查图不进入结果；过程通过 Task `context.log` 输出。旧 callback/reporter、
`createTargetCheckers`、`$root` 和 `{type,selector}`
不再是当前入口；作者须迁移、重建 CAR 并使用准确新 CID。
这不代表历史 npm RC/旧 CAR 已升级，也不自动发布或远程上传。

## 定义与入口

```ts
// src/contract.ts
import { Type } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";
export const Input = Type.Object(
  { text: Type.String() },
  { additionalProperties: false },
);
export default createCheckContract(Input, Type.Literal("text-mismatch"));
```

```ts
// src/main.ts
import { defineChecker, runCheck } from "@silvermoon-work/check-task-sdk";
import contract, { Input } from "./contract.js";
const registry = {
  text: defineChecker({
    target: Input,
    check: (target, signal) => {
      signal.throwIfAborted();
      return Promise.resolve(
        target.text === "hello"
          ? ({ pass: true, children: [] } as const)
          : ({
              pass: false,
              problems: [
                { code: "text-mismatch", brief: "文字必须为 hello。" },
              ],
            } as const),
      );
    },
  }),
};
runCheck(contract, { registry, root: "text" });
```

- `defineChecker({target,check})` 绑定 TypeBox 对象 schema 与
  `(target,signal) => Promise<CheckerResult>`，自动推导 target，不执行检查。
  pass 返回 children，fail 返回非空 problems，两者不能混用；空 children 为叶。
- `CheckItem<Registry>` 为 `{checker,target}` 的异构判别联合。
  组合/执行入口检查 child 名称与参数关联，不把 registry 扩宽成丢失键的 Record，
  不用宽泛断言绕过约束。
- 名称采用 `^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$`，区分大小写，无保留根名。
  同一函数/CID 的不同名称仍是不同身份。使用静态 object；
  `mergeCheckerRegistries(a,b)` 在覆盖前拒绝重名，不使用会丢失冲突的 spread。
- `runCheck(contract,{registry,root,limits?},{assets?})` 绑定 Task
  input 为根 target。
  `createCheckCallback` 同形，返回上游 TaskCallback，不自行启动 Worker。
  root 必须存在，输入必须符合 Task 和根 schema。
- 独立 `executeCheck({registry,root:{checker,target},signal,limits?})`
  返回业务 CheckReport，不启动 Worker。可选 `log(node)` 接收节点过程。
  一次调用一个执行范围，无跨执行缓存。
- registry 也可为 `(context,input) => registry` 的执行期工厂；
  input 已验证并深冻，context 只有
  `signal/log/progress/bundle/space/invokeTask`，无 output 或完整 TaskContext。
  signal 包含图内故障取消，工厂初始化也在执行预算内。
  这是能力分责，不是安全沙箱。

按项目、配置、工具等职责组织模块，不强制每叶一个文件。
读取器和事实 Promise 缓存属于本次执行；问题、成员 scope、清理状态属于节点调用，
不得共享“当前问题数组”。需要多项前置时显式读取固定事实或组合前置，
不直接递归调用其他注册 Checker。

## 身份、遍历与停止

target 根为普通或 null 原型对象，内部为有限 JSON 值。
对象插入顺序不影响身份，数组顺序影响；`-0`/`0` 同值；
字符串保留原 UTF-16 序列，不归一化 Unicode、路径大小写或斜杠。
拒绝 getter/Proxy/symbol 键、非枚举额外字段、自定义原型、稀疏/扩展数组、
undefined、函数、bigint、非有限数字和循环。共享引用但非环按值接受。
不执行 toJSON，不补默认值、转换或丢字段。

安全复制 → schema 验证 → 冻结 → 规范编码 → 登记去重 → 入队；
完整规范字符串为键，实际调用使用同一受保护值，不受原对象后续修改影响。
身份不含 signal、Run ID 或队列状态。

FIFO 有界并发不设整层屏障。共享节点、自环和回边只调用一次。
首次发现决定节点唯一 parent，后续重复发现不改写它；根节点没有 parent。
这是过程的生成树，不保存完整 edges，也不实现全父 join。
fail 只剪掉本节点新 child，独立分支继续。
问题按节点键与局部顺序排列，不按 code/brief 跨节点去重。
领域共享根因由明确配置/事实节点局部拥有。

节点完成后以 `{key,item,parent?,pass}` 发给 `log`，Task 入口使用
`context.log({level:"info",message:JSON.stringify(node)})`，确保仅展示日志
message 的 CLI 也能读取完整生成树节点。日志只描述本节点结论，
不等于所有后代通过；并发执行时 parent 取首次发现者，不保证日志完成顺序。
日志调用抛错和取消保持执行故障。宿主日志容量和可用性由 Task 的日志
receipt/state 表达，不改变业务结论。日志目标与记录冻结，不泄漏可修改的执行状态。

默认 limits：concurrency=4、nodes=4096、children=16384、
targetBytes=65536、encodingBytes=16 MiB、depth=64、values=16384、
resultBytes=16 MiB、problems=16384、timeoutMs=60000。
配置必须为有界正安全整数，并发硬上限 64；重复项仍计入尝试/编码预算。
Task 集成另检查公共 Protocol 的 **完整结果 65,536 字节**上限，
超限为执行故障，不返回截断报告。

预取消零调用；中途 abort/故障/预算耗尽停止出队和 child 展开，传递在途 signal，
等待真实退出及清理。正常协作 AbortError（cause 是本 signal.reason）
不是额外清理故障，其他执行/清理错误完整保留。
不以 Promise.race 早退宣称回收。预算不是任意 JS 的强杀期限；
不响应 signal 的代码可能阻止调用结束。

## 业务结果与文档

`createCheckContract` 生成
`{parameters,result,message,schemas}`，message 为 Never。
本地问题码仍为有限 TypeBox 字符串字面量/union，使用便携小写文件名片段，
禁止 Windows 设备名；Builder 检查准确本地问题 Markdown。

独立 `executeCheck` 的本地 documentation 是作者相对路径。
Task callback 返回 `{pass:true,documentation:ContentRef}`；
不通过返回 `{pass:false,documentation:ContentRef,problems:[...]}`。
fail 有非空 problems，pass 无 problems。结果不包含 protocol、root、nodes、
edges，过程只出现在日志。
问题含 code、brief、documentation、当前 nodeKey，以及：

- `source:{kind:"local",checker,nodeKey}`：code 必须属于本地契约，
  文档来自 Bundle 的 `resources/references/problems/<code>.md`，Task
  返回该文件的直接 ContentRef。
- `source:{kind:"bundle",bundleCid,checker,nodeKey}`：
  code 属于原子 Bundle，文档为子结果中的直接内容引用，没有 outputCid；
  source.nodeKey 定位原问题，外层 nodeKey 定位叶适配节点。嵌套适配保留最终来源。

整体文档解析 Bundle 的 `resources/references/check.md`。
第三参数 `{assets:true}` 在业务结果增加 assets ContentRef，引用 Bundle 的
`resources/assets` 目录。通过 `resolveContent/readContent` 核验资源存在及类型；
缺资源、取消或读取故障保持执行故障。不再创建 output space 或复制/链接资源。

Engine 的 `output.result` 为 `{data,cidPaths}`，没有 output.cid。
documentation 与可选 assets 使用 ContentRefSchema，Task SDK 根据 schema
自动生成 cidPaths；问题文档使用 `$["problems"][*]["documentation"]`，
不逐个枚举数组下标。不手写 payload 或伪造本报告自身 CID。
普通非空 UTF-8 Markdown 及相对资源保留，不抓取所有链接。
读取端口必须覆盖 Engine 输出块，不能只读原始 Bundle CAR：
公开 MemoryStore.readContentBlock 可与 CAR block port 组合供 IpfsStore 读取。
不要把秘密或不应公开的作者资源放入 references/assets。

## Check Bundle 叶适配

`checkerFromBundle({bundleCid,contract,port})` 接受准确不可变 CID 和明确子契约，
返回普通 CheckerDefinition。最小调用方端口为：

```ts
interface CheckExecutionPort {
  execute(request: {
    bundleCid: string;
    input: JsonObject;
    signal: AbortSignal;
  }): Promise<{ result: unknown }>;
}
```

调用方用公开 Engine submit/getRequestStatus 追踪 preparing，
取消时 cancelTask，再 await waitForTaskRelease，成功也等待释放，
从 getTask/getRun 的真实 output 返回 envelope。
不得丢失执行/取消/释放失败，不关闭调用方共享 Engine/IpfsStore。
端口负责授权与宿主政策；CID 不是授权。SDK 不依赖完整 Engine。

适配器先用明确子契约验证真实 result payload 及 cidPaths，再验证业务结果、
问题身份、来源、文档 CID 及非空问题；
子 pass 变为空 children，子 fail 保留问题及文档来源。
**不导入/再次执行子图，不支持跨 Bundle children**。
带图字段的旧 check-report/v2、任意 Task JSON、缺 envelope 或伪本地 code
明确拒绝。适配必须提供明确子契约和真实 output envelope；仅有 pass
不能证明来源可信。当前制品须重建，历史 CAR 不自动升级。

Task SDK 0.2.0-rc.2 的 invokeTask 只返回解码业务值，参数无单次 signal/cancel，
无法满足图内兄弟故障取消和 output 来源。因此 **没有 Worker 自动绑定**；
raw CheckContext 在类型和运行时都不是端口。普通子 Task 调用使用
`{key,bundle,path?,parameters,timeoutMs}`，不等于本适配器、不自动合并子问题。
真实宿主取消、释放和来源读取由 Builder 集成测试覆盖。
