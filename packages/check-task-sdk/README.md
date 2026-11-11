# Check Task SDK

基于 `@silvermoon-work/task-sdk@0.1.0`
的检查领域组合；不包含第二套运行时或构建器。

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

Builder 将完整有效参考资源放入 Bundle 的 `resources/references/`；SDK 使用 Space
`link` 将此目录链接到输出 `references/`。整体文档和问题文档均为普通非空 UTF-8
Markdown，无 frontmatter 要求。消费者从 Engine Run 的 `outputCid`
及业务结果中的相对路径读取文档；SDK 不生成
`result.json`，也不把 CID 写进业务结果。

Node.js >=22.13。使用配套 Check Task
Builder 构建，不能直接把未绑定的源码作为 Worker 执行。
