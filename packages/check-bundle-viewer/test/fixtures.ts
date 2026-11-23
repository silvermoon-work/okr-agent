import type { CheckBundleSpec } from "../src/spec.js";

export const validationSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "校验用有序定义",
  description:
    "测试定义：只读核验本地 **上下文**、脚本与任务完成条件，不是执行结果。",
  parameter: {
    schema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "目标 **目录**，对应 `directory`。",
        },
      },
      required: ["directory"],
    },
  },
  checkpoints: [
    {
      id: "context",
      title: "上下文",
      description: "核验本地上下文。",
      instructions:
        "读取目标 **目录**，逐项核对上下文；无法读取时报告原因并重新检查。",
      output: {
        description: "测试定义：计划供后续检查点使用的上下文，不是执行结果。",
        fields: [
          {
            name: "directory",
            description: "已核验的 **目录**，供后续只读检查使用。",
          },
        ],
      },
      rules: [{ code: "context-valid", description: "上下文必须可读取。" }],
    },
    {
      id: "scripts",
      title: "脚本定义",
      description: "核验脚本定义。",
      instructions: "只读核对脚本定义，列出缺失或不符项，不执行脚本。",
      output: {
        description: "测试定义：成功时不提供额外数据（`undefined`）。",
      },
      rules: [
        { code: "gate-missing", description: "必须存在有效的脚本定义。" },
      ],
    },
    {
      id: "completion",
      title: "完成",
      description: "核验任务完成条件。",
      instructions: "核对当前完成事实，不以手写状态代替验收结果。",
      output: {
        description: "测试定义：成功时不提供额外数据（`undefined`）。",
      },
      rules: [
        { code: "context-valid", description: "最终上下文必须保持有效。" },
      ],
    },
  ],
};

export function orderedSpec(): CheckBundleSpec {
  return structuredClone(validationSpec);
}

export function longSpec(): CheckBundleSpec {
  return {
    ...orderedSpec(),
    name: "长有序列表布局回归",
    checkpoints: Array.from({ length: 12 }, (_, index) => ({
      id: `step-${String(index + 1)}`,
      title: `检查点 ${String(index + 1)}：需要完整阅读的长标题 / ${"LongUnbrokenCheckpointName".repeat(3)}`,
      description: "核验当前检查点的本地约束。",
      instructions: "布局 mock：展示独立的 Agent 指示，不执行实际检查。",
      output: { description: "布局 mock，未实现，不提供执行结果。" },
      rules: [{ code: "valid", description: "本地约束必须满足。" }],
    })),
  };
}
