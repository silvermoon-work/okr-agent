import type { CheckBundleSpec } from "../src/spec.js";

export const validationSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "校验用有序定义",
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
    preconditions: ["`directory` 指向可读取目录。"],
  },
  checkpoints: [
    {
      id: "context",
      title: "上下文",
      description: "核验本地上下文。",
      rules: [{ code: "context-valid", description: "上下文必须可读取。" }],
    },
    {
      id: "scripts",
      title: "脚本定义",
      description: "核验脚本定义。",
      rules: [
        { code: "gate-missing", description: "必须存在有效的脚本定义。" },
      ],
    },
    {
      id: "completion",
      title: "完成",
      description: "核验任务完成条件。",
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
      rules: [{ code: "valid", description: "本地约束必须满足。" }],
    })),
  };
}
