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
        "仅历史 idea.json 契约的已有 evidence/deployment/report.jsonl 保留原始字节前缀，整体授权删除除外。新平级文件夹协议不要求固定报告、报告 append-only 或机器结果真实性。",
    },
    {
      code: "commit-history-idea-identity-immutable",
      description:
        "新平级协议保留 created 的 idea、at、eventSchemaCid 身份及原始事件字节；历史契约保留原 bootstrap 的 version/id/checkCid/createdAt，不能静默替换 Schema 或执行 CID。只有 allowDelete 中显式授权的既有 Idea 可整体删除，部分删除不适用。",
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
