import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "silvermoon-folder",
  title: "Silvermoon 数据容器有效",
  description:
    "检查 Silvermoon 数据目录、配置文件及 Idea 容器的路径与读取安全性。",
  instructions: `修复下列 Rules 指出的目录或文件类型问题后重试原命令。首个 Idea 创建前 i 目录不存在是正常状态。
这里只处理容器，不扫描、迁移、删除或修复既有 Ideas，不替 CLI 建目录或开始创建事务。
创建、并发复核及失败恢复属于 CLI 写入层职责，不是本检查点的副作用。`,
  rules: [
    {
      code: "silvermoon-folder-path-valid",
      description:
        ".silvermoon 必须是普通目录，不能是符号链接、重定向路径或其他文件类型。",
    },
    {
      code: "silvermoon-folder-config-file-valid",
      description:
        ".silvermoon/config.yaml 必须是普通文件，路径无重定向且大小不超过协议容量限制。",
    },
    {
      code: "silvermoon-folder-ideas-directory-valid",
      description:
        "首个 Idea 创建前 .silvermoon/i 可以不存在；存在时必须是普通安全目录，不能是链接或重定向路径。",
    },
  ],
  output: {
    description:
      "成功不新增数据，实际 pass output 为 undefined；后续仅承接数据容器已经通过本次检查的事实，不保存可跨运行复用的 readiness 标记。",
  },
} as const satisfies CheckpointDocumentation;
