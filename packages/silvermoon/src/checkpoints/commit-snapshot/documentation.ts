import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "commit-snapshot",
  title: "候选快照有效",
  description:
    "检查指定候选快照中发生变更的 Ideas 的完整内容，以及配置、文件和协议结构是否有效。",
  instructions: `你需要确认实际候选快照满足下列结构 Rules，不把未暂存的工作区内容混入索引。工作区有改动、缺少 upstream 或 Idea 未获批准都不是本任务的失败理由；取消和意外 I/O 应按执行错误处理。`,
  rules: [
    {
      code: "commit-snapshot-valid",
      description:
        "指定候选快照中发生变更的 Ideas 的 Silvermoon 配置、路径、文件、bootstrap、事件和用例索引必须符合支持的协议及安全、容量约束；暂存区检查只读取索引，不混入未暂存或未跟踪的工作区内容。",
    },
  ],
  output: {
    description:
      "提供本次已经固定的候选及基线内容，供修改合法性检查复用；文件集合包含 Map 和原始字节，只保留在执行内，不自动进入结果、日志或 IPFS。",
    fields: [
      {
        name: "project",
        description:
          "经过结构核验的候选快照，包括配置、Idea 和原始文件集合；staged 仅表示 Git 索引内容。",
      },
      {
        name: "previous",
        description:
          "准确基线 Project 或 undefined；staged/worktree 对应 HEAD，已提交快照对应第一父提交，初始化且没有既有元数据时缺省。",
      },
    ],
  },
} as const satisfies CheckpointDocumentation;
