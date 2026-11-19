# Check Task SDK

基于 Task SDK/Protocol 的 Check Task → 有序 Checkpoint → Rule API。
消费者最低 Node 为 `>=22.15.0`；不复制 Engine、编译器或 CAR 实现。
历史 npm/CAR 不会自动升级，新候选必须重建并更新准确 CID。

```ts
import { Type } from "@sinclair/typebox";
import {
  createCheckContract,
  defineCheckpoint,
  failed,
  runCheck,
} from "@silvermoon-work/check-task-sdk";

const Input = Type.Object({ text: Type.String() });
const contract = createCheckContract(Input, Type.Literal("text-mismatch"), [
  "text",
]);
const text = defineCheckpoint({
  id: "text",
  target: Input,
  description: "检查输入文字。",
  rules: [{ code: "text-mismatch", description: "文字必须为 hello。" }],
  check: async (target, context) => {
    context.signal.throwIfAborted();
    return failed(
      target.text === "hello"
        ? []
        : [{ code: "text-mismatch", brief: "文字必须为 hello。" }],
    );
  },
});
runCheck(contract, { checkpoints: [text] });
```

## 执行模型

`defineCheckpoint({id,target,description,rules,check})` 推导 TypeBox TObject
target 和成功 output，提供 `id/target/description/rules/accepts/invoke`。
`check(target,context)` 必须返回 Promise：

- `{pass:true,output}`；output 可为 Map、函数、循环对象等执行期值；
- `{pass:false,problems:[{code,brief},...]}`，必须非空且 code 属于本步声明。

`failed(problems)` 将空数组转为 `{pass:true,output:undefined}`。
规则 code 与 Checkpoint id 是便携小写片段：
`^[a-z0-9]+(?:[._-][a-z0-9]+)*$`，拒绝 Windows 设备名。
同一步内规则码唯一，不同步骤可复用；description/brief 必须非空。

`executeCheck({checkpoints,target,signal,log?})` 严格按数组顺序 await。
Checkpoint id 必须唯一；首个业务失败保留本步全部问题（包括重复 code），
不执行后续步骤。异常、无效结果、日志错误和取消保持执行错误。
每个异步步骤前后检查取消；不以 Promise.race 假装已回收资源。
空列表通过。没有 children、registry、图遍历、隐式分流或跨执行缓存。

`CheckpointContext` 只有只读 `signal` 和 `outputOf(definition)`。
后者只接受本次执行中较早成功的**同一份定义对象**，
拒绝当前、未来和外部定义，调用结束后释放输出映射。返回类型为浅层
`Readonly<Output>`；
不克隆、不序列化、不修改或深冻 output，其原始引用身份保持不变。
业务 target 也不克隆；作者负责避免修改共享输入。
这是类型与能力边界，不是安全沙箱或深层不可变承诺。

`log` 接收 `CheckpointLog`（亦导出为 `ReportNode`）：
`{checkpoint,pass}`。仅这些元数据可进入 Task 过程日志，
不自动输出 target、成功 output 或资源能力。

## 契约、Task 与文档

`createCheckContract(InputSchema,RuleCodeSchema,checkpointIds)` 也可从
`@silvermoon-work/check-task-sdk/contracts` 导入。
规则码必须是非空有限 TypeBox 字符串字面量/union，无重复。
共享 schema 名为 `check-rule-code`、`check-checkpoint-id`；
不再生成旧 `check-problem-code`。

`createCheckCallback(contract,{checkpoints},outputOptions?)`
返回上游 TaskCallback；
`runCheck` 同形并注册 Worker。
checkpoints 也可为 `(context:CheckContext,input) => checkpoints` 的异步工厂。
CheckContext 仅提供
`signal/log/progress/bundle/readContent/resolveContent/putContent/invokeTask`，
用于工厂构造执行期资源能力。输入先通过契约校验；
每步的 id 和全部 rules 必须属于契约声明，允许仅执行契约步骤的一个子集。

独立 CheckReport 始终包含：

```ts
{
  pass: false,
  documentation: "references/check.md",
  references: [{
    checkpoint: "text",
    documentation: "references/checkpoints/text.md"
  }],
  problems: [{ checkpoint: "text", code: "text-mismatch", brief: "文字必须为 hello。" }]
}
```

成功报告的 references 为空，没有 problems。
失败只链接一次失败步骤文档，不按规则或问题复制引用。
没有逐问题 documentation、nodeKey、source 或 level。
Task 适配把 task 文档与 references 文档解析为真实 ContentRef，
从 Bundle 的 `resources/` 读取并检查文件类型。上游 schema 编码器生成准确
cidPaths：`$["documentation"]` 和非空引用数组对应的
`$["references"][*]["documentation"]`。
`{assets:true}` 保留可选 assets ContentRef，检查 `resources/assets` 是目录。
缺文档、缺资源或错误类型均是执行故障。成功 output 从不进入结果或 CID 路径。

Builder 要求 `references/check.md` 和每个已声明 Checkpoint 的文档，
严格大小写、非空有效 UTF-8；不再要求逐 code 的问题文档。
普通参考图片与相对链接资源仍可保留。

## 显式历史兼容入口

归档图实现与其测试保留在
`@silvermoon-work/check-task-sdk/legacy`；
旧 `createCheckContract` 来自 `/legacy-contracts`。
旧 `defineChecker`、图 `executeCheck`、`checkerFromBundle` 和 v2 结果适配
只属于这些明确命名的历史入口，不是默认生产 API。
默认入口不提供 Bundle Checker 适配器；新组合通过 Checkpoint 与明确 Task
资源能力完成，不把旧图 API 伪装成新模型。

## 开发验证

分别运行本包的 `build`、`typecheck`、`test-coverage`、`lint` 和
`lint-package`。旧图/Bundle 测试保持原断言，新测试覆盖顺序、output 身份、
取消、规则错误、契约与真实 ContentRef 文档映射。
