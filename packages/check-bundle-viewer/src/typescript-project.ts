import type { CheckBundleSpec } from "./spec.js";

/** Definition of the ordered project identity and workspace configuration checks. */
export const typescriptProjectSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "TypeScript 项目 · 身份与 workspace 配置",
  parameter: {
    schema: {
      type: "object",
      properties: {
        projectDirectory: {
          type: "string",
          minLength: 1,
          description:
            "宿主上的项目绝对目录；`projectDirectory` 不会作为脚本执行。",
        },
      },
      required: ["projectDirectory"],
      additionalProperties: false,
    },
    preconditions: [
      "调用方提供存在、可读取、未重定向的宿主绝对目录 `projectDirectory`，并允许按只读预算枚举。",
      "路径、权限、取消、读取变化与预算耗尽由执行故障通道处理，不伪装成身份或配置问题。",
    ],
  },
  checkpoints: [
    {
      id: "project",
      title: "识别项目",
      description:
        "核验 TypeScript 项目身份并确定 single repo 或 monorepo 范围；不执行目标代码。",
      rules: [
        {
          code: "typescript-project-invalid",
          description:
            "根 manifest 必须为合法 JSON 对象，且存在 TypeScript 依赖、tsconfig 或 TS 源码证据；monorepo 可读取成员 manifest 中的 TypeScript 依赖声明。根普通文件 `pnpm-workspace.yaml` 或根 manifest 的 `workspaces` 字段标识 monorepo，不按成员数量猜测；本规则不保证 workspace 配置内容合法。",
        },
      ],
    },
    {
      id: "workspace",
      title: "Workspace 配置",
      description:
        "对 monorepo 核验 pnpm workspace 声明；single repo 不适用此配置要求。这里不展开成员、不检查成员名称或目录布局。",
      rules: [
        {
          code: "workspace-configuration-invalid",
          description:
            "Monorepo 根目录必须提供普通文件 `pnpm-workspace.yaml`，根 manifest 的 `workspaces` 不能替代。配置必须为合法 YAML（无重复键或未定义别名）的对象，显式包含非空 `packages` 数组，且每项为含非空白字符的字符串；允许其他全局字段。本规则不保证模式语义或匹配结果，链接重定向与别名预算耗尽仍属执行故障。",
        },
      ],
    },
  ],
};
