import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "commit-history",
  title: "候选修改符合约束",
  description: "检查候选修改是否保持已有 Idea 身份不变，并只追加已有事件历史。",
  instructions: `你需要按下列 Rules 审核候选相对固定基线的修改，不在这里推进 Idea 或要求仓库同步。遇到身份或历史改写时保留原始资料并修复候选，不通过删除旧事实获得检查通过。`,
  rules: [
    {
      code: "commit-history-deployment-report-append-only",
      description:
        "已有 evidence/deployment/report.jsonl 必须保留基线的原始字节准确前缀，只能追加完整行；不得删除、覆盖、截断或重排，整体 Idea 的明确授权删除例外除外。",
    },
    {
      code: "commit-history-idea-identity-immutable",
      description:
        "候选快照必须保留基线中所有已有 Idea 的 version、id、checkCid 和 createdAt 字段值，不得改写其 bootstrap 身份；只有 allowDelete 中显式声明的既有 Idea 可以整体删除，部分删除不适用；JSON 排版或字段顺序变化不构成身份变化。",
    },
    {
      code: "commit-history-event-history-append-only",
      description:
        "候选 events.jsonl 必须以基线字节为原始 UTF-8 字节的准确前缀，只能追加。staged 和 worktree 以 HEAD 为基线；已提交快照以其第一个父提交为基线；初始化且无既有 Silvermoon 元数据时只核验候选结构。",
    },
  ],
  output: {
    description:
      "成功不新增数据，pass output 为 undefined；只证明候选修改通过本任务的合法性检查，不表示 Idea 完成，也不自动执行 commit。",
  },
} as const satisfies CheckpointDocumentation;
