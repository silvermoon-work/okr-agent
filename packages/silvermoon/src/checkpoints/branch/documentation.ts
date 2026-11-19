import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "branch",
  title: "分支已正确跟踪并同步 primary",
  description:
    "检查项目配置和分支跟踪关系有效，且 HEAD 与配置的 primary 同步。",
  instructions: `你需要让仓库的 Silvermoon primary 配置与当前分支的跟踪、同步关系满足下列 Rules。需要集成并发历史时采用获授权的普通 Git 操作并保留双方历史，不擅自移动分支或更改 primary 来绕过检查。
远端不可用或观察不确定时明确报告，不将本地旧快照冒充远端最新事实；不自动 pull、merge、rebase 或 push。`,
  rules: [
    {
      code: "branch-silvermoon-config-valid",
      description:
        "项目配置必须存在、可按支持的协议解析，并声明有效的 primaryRepository 与 primaryBranch。",
    },
    {
      code: "branch-primary-present",
      description:
        "配置的远端仓库必须存在指定 primaryBranch；查询失败或不确定不能视作已确认不存在。",
    },
    {
      code: "branch-upstream-aligned",
      description:
        "当前本地分支必须有 upstream，且其远端仓库和分支与配置的 primaryRepository、primaryBranch 一致。",
    },
    {
      code: "branch-primary-synchronized",
      description:
        "HEAD 必须等于本次观察的 primary tip。默认获取配置的远端 primary 并以 FETCH_HEAD 为准；显式本地观察模式读取远端跟踪快照，不代表远端最新状态， 也不证明网络新鲜度。检查不执行 pull、merge 或 rebase。",
    },
  ],
  output: {
    description:
      "提供本次已经核验的仓库配置与 primary 观察，供当前 Idea 观察和最终同步判断复用；包含执行期对象，不是需要序列化的 Task 参数。",
    fields: [
      {
        name: "project",
        description:
          "当前仓库 root 与有效配置对象；用于记录本次观察的配置来源和范围。",
      },
      {
        name: "observed",
        description:
          "本次 HEAD、primary tip、remote、变更事实与 primary 配置；后续据此读取准确快照、核验来源和终态同步，不声明跨执行新鲜性。",
      },
    ],
  },
} as const satisfies CheckpointDocumentation;
