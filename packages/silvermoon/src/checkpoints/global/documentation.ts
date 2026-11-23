import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "global",
  title: "全局 Silvermoon 已正确配置",
  description: "检查全局 Silvermoon 安装、个人 skill 链接及用户配置是否有效。",
  instructions: `按下列 Rules 定位实际运行安装、个人 skill 或配置问题，在已有授权范围内修复后重试原命令。
安装、升级、配置或链接修改仍需要相应授权，检查本身不自动修复。
不通过添加项目依赖或复制项目内 skill 绕过设备边界；本检查点不要求项目或 Idea 存在。`,
  rules: [
    {
      code: "global-runtime-ready",
      description:
        "实际运行入口必须是当前 @silvermoon-work/silvermoon 安装的规范 bin，且 PATH 可发现的首个 silvermoon 命令指向同一安装；允许全局链接的开发版本，不要求每次联网查询 registry 最新版。",
    },
    {
      code: "global-skill-linked",
      description:
        "受支持的个人发现路径（.agents/skills/silvermoon 或 .copilot/skills/silvermoon）必须通过有效链接指向当前安装的 canonical skill，不能是副本、失效链接或其他安装的 skill。",
    },
    {
      code: "global-configuration-valid",
      description:
        "个人配置存在时必须可解析、协议版本受支持、字段合法且语言标签有效；协议允许缺省时，配置可以不存在。",
    },
  ],
  output: {
    description:
      "成功后提供本次已经验证的个人语言设置，只在执行内共享，不保存跨执行 readiness 标记。",
    fields: [
      {
        name: "userLanguage",
        description:
          "规范语言标签或 undefined；允许个人配置缺省，后续内容语言按 Idea、项目、用户的优先级决定，不据此推断项目或 Idea 存在。",
      },
    ],
  },
} as const satisfies CheckpointDocumentation;
