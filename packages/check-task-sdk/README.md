# Check Task SDK

基于 `@silvermoon-work/task-sdk@0.2.0-rc.1`
的检查领域组合；不包含第二套运行时或构建器。

## Node.js 支持

SDK 的 `engines.node` 为 `>=22.15.0`。本轮经用户明确授权，将原
`>=22.13` 的最低兼容承诺收紧至 22.15.0，与 monorepo 其他适用代码包
保持最低版本一致；不再承诺 Node.js 22.13 或 22.14。开发环境仍独立读取
仓库根 `.node-version`，不将开发版本当作消费者最低要求。

```ts
// src/contract.ts — 可由编辑器正常解析，无生成类型文件
import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

export const Input = Type.Object({ text: Type.String() });
export const ProblemCode = Type.Union([Type.Literal("text-mismatch")]);
export type Input = Static<typeof Input>;
export type ProblemCode = Static<typeof ProblemCode>;
const contract = createCheckContract(Input, ProblemCode);
export type Result = Static<typeof contract.result>;
export default contract;
```

```ts
// src/main.ts
import { runCheck } from "@silvermoon-work/check-task-sdk";
import contract from "./contract.js";

runCheck(contract, async (input, context, reportProblem) => {
  const node = await context.bundle.root
    .resolve("resources/expected.txt")
    .read();
  if (node.kind !== "file") throw new Error("Missing expected standard.");
  const expected = (await new Response(node.content).text()).trimEnd();
  if (input.text !== expected)
    reportProblem(
      "text-mismatch",
      `Text must equal ${JSON.stringify(expected)}.`,
    );
});
```

## 契约和执行

- `createCheckContract(inputSchema, problemCodeSchema)` 生成上游
  `{ input, result, message, schemas }` 契约；消息 Schema 为 `Never`。
- 问题码必须是非空有限 TypeBox 字符串字面量或字面量 union，采用可移植的小写文件名片段（字母/数字及中间的
  `-`、`_`、`.`，不含 Windows 保留设备名），不能使用任意字符串 Schema。
  `schemas["check-problem-code"]` 是同一问题码 Schema，不维护 YAML 清单。
- `runCheck(contract, callback)` 调用真正的上游 `runTask`；
  `createCheckCallback(contract, callback)` 返回可组合的上游
  `TaskCallback`，不自行启动 Worker。契约模块使用
  `/contracts`，不加载 Worker 运行时。
- 回调参数自动推导输入和问题码。上下文仅含
  `signal/log/progress/bundle/space(cid)/invokeTask`，显式创建新对象；无
  `output`、业务消息或完整 TaskContext。它是 API 分责，不是安全沙箱。
- `reportProblem(code, brief)`
  同步收集问题。未知码、空白 brief 会抛错，即使作者捕获报告错误，本次执行也不能返回正常结果。
- 正常返回且没有问题：`{ pass: true, documentation: "references/check.md" }`。有问题：`{ pass: false, documentation, problems: [{ code, brief, documentation }] }`，每个问题的路径为
  `references/problems/<code>.md`。不通过必有问题，通过没有 `problems`。
- 抛错、子任务故障、取消或文档链接失败保持上游执行故障，不转为正常不通过；已报告的问题不改变这一点。回调结束即关闭报告器，结果及问题列表冻结，迟到调用不能修改结果。

## TargetChecker：作者自己的检测树

`createTargetCheckers(schemas, registry)` 绑定按类型注册的函数，返回
`(parameters, signal, reportProblem) => Promise<void>`。`$root` 的 selector
就是原始参数；各 selector 由对应 TypeBox schema 推导并在调度前校验。
注册函数接收完整的 `{ type, selector }` target，而不是 selector 本身；
映射注册表将各函数的 `type` 字面量与对应 selector 类型绑定。
函数通过本次 Check 回调的闭包使用受限上下文、读取器和探测器，SDK 不包含领域规则。

```ts
import { createTargetCheckers } from "@silvermoon-work/check-task-sdk";

const selectors = {
  $root: Input,
  text: Type.Object({ text: Type.String() }, { additionalProperties: false }),
};
runCheck(contract, async (input, context, report) => {
  const inspect = createTargetCheckers<typeof selectors, ProblemCode>(
    selectors,
    {
      $root: ({ selector: parameters }) => ({
        pass: true,
        targets: [{ type: "text", selector: parameters }],
      }),
      text: ({ selector: { text } }) =>
        text.trim()
          ? { pass: true, targets: [] }
          : {
              pass: false,
              problems: [{ code: "text-mismatch", brief: "文字不能为空。" }],
            },
    },
  );
  await inspect(input, context.signal, report);
});
```

导出 `Target`、`TargetResult`、`TargetProblem`、`TargetChecker`、
`RootTargetChecker`、`TargetCheckerRegistry`
类型。`TargetChecker<Schemas, Code, Kind>`
接收指定 Kind 的完整 target；省略 Kind 时接收 target 联合类型，
`RootTargetChecker<Schemas, Code>` 是 `$root` 的别名。允许同步叶结果或 Promise
结果，编排器统一 await；不改变串行语义。
成功结果只有 `pass: true, targets`，按数组顺序串行深度优先展开；空数组为叶。
失败结果只有 `pass: false, problems`，必须非空，只剪去本分支，随后继续兄弟。
不改变公开 CheckResult、文档/资产链接或上游 Worker 协议。
未知类型、非对象/不符合 schema 的 selector、非法结果、异常、取消及报告器/
协议/清理失败均为执行故障，不能当作业务通过。SDK 不去重 target、不缓存事实、
不调度 DAG 或并行任务；作者须生成有限树，并显式定义局部、共享前置。

## 固定文档 assets

作者可通过第三参数 `{ assets: true }` 为 `runCheck` 或 `createCheckCallback`
启用标准资产交付。默认关闭，已有 Check 输出不变。

```ts
runCheck(contract, inspectProject, { assets: true });
```

Builder 配置通过 `include: [{ from: "assets/**", to: "resources/assets/" }]`
收录作者资产。SDK 在正常通过和不通过时，分别将 Bundle 的 `resources/references`
与 `resources/assets` 链接到 output 的
`references/`、`assets/`；不向回调暴露可写 output 或任意输出路径映射。启用资产交付却缺失资源或链接失败时保持执行故障，不返回正常 Check 结果。

例如 `references/problems/document-mismatch.md` 使用
`[标准 AGENTS.md](../../assets/AGENTS.md)`，消费者从本 Run 的 `output.cid`
读取完整修复内容，无需编码 Check
CID。资产是标准唯一副本，检测与修复读取相同字节；不能把作者源码、秘密或不应公开的资源放入该目录。

Builder 将完整有效参考资源放入 Bundle 的 `resources/references/`；SDK 使用 Space
`link` 将此目录链接到输出 `references/`。整体文档和问题文档均为普通非空 UTF-8
Markdown，无 frontmatter 要求。消费者从 Engine Run 的 `output.cid` 及
`output.result` 业务结果中的相对路径读取文档；SDK 不生成
`result.json`，也不把 CID 写进业务结果。

上游 0.2.0 将宿主的结果与文件包身份统一到
`output: { cid, result }`；Check 回调仍只生成业务结果，不自行添加这层信封。
`invokeTask` 仍返回子任务业务 JSON，但入参已改为真实 `SpaceRef`：

```ts
const childResult = await context.invokeTask({
  key: "child",
  bundle: context.bundle.root.resolve("resources/tasks/child"),
  input: {},
  timeoutMs: 10000,
});
```

外部 Bundle 使用 `context.space(cid).root`。不能传手写
`{sid,path}`、可写输出引用或旧
`{cid,path}`；旧调用会明确失败。父 Bundle 可用 Builder 的 `imports`
固定子根 CID。这只是执行组合，不自动合并子问题码或文档；Check 结果协议保持不变。

Engine 运行要求 Node.js `^22.15.0 || >=23.5.0`。使用配套 Check Task
Builder 构建，不能直接把未绑定的源码作为 Worker 执行。
