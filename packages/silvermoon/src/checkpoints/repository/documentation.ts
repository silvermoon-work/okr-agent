import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "repository",
  title: "仓库在可继续工作的状态",
  description: "检查仓库根目录有效、HEAD 关联分支，且工作区没有未提交内容。",
  instructions: `保留所有已有修改，通过普通且获授权的 Git 操作整理候选并提交；不得通过删除、隐藏或重置改动来取得通过。
本检查点不解析 Silvermoon 配置或 Idea 内容，不自动执行 stage、commit、push 或 clean；修复后重试原命令。`,
  rules: [
    {
      code: "repository-root-valid",
      description:
        "repoRoot 必须是可安全读取且有有效 HEAD 的 Git 仓库根目录，不能是重定向路径或仓库子目录。",
    },
    {
      code: "repository-branch-attached",
      description: "当前 HEAD 必须关联本地分支，不能处于 detached HEAD 状态。",
    },
    {
      code: "repository-worktree-clean",
      description:
        "工作区必须无已暂存、未暂存或未跟踪的改动，Idea 草稿和事件也必须已提交；检查本身不执行 stage、commit、push 或 clean。",
    },
  ],
  output: {
    description:
      "为后续检查建立准确的仓库定位与起始提交，不把 Git 状态推断成生命周期批准。",
    fields: [
      {
        name: "root",
        description:
          "已验证的 Git 仓库根目录；后续文件和 Git 观察仅在该范围进行。",
      },
      {
        name: "head",
        description:
          "本次观察开始时的准确提交 ID；后续用于校验观察期间仓库没有变化，不可跨执行缓存。",
      },
    ],
  },
} as const satisfies CheckpointDocumentation;
