import type { CheckBundleSpec } from "./spec.js";

/** Definition of the ordered project identity and workspace configuration checks. */
export const typescriptProjectSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "TypeScript 项目 · 身份与 workspace 配置",
  description:
    "只读核验目标目录的 TypeScript 项目身份与 single repo / monorepo 范围；对 monorepo 核验 pnpm workspace 配置。不执行目标代码，不检查成员布局或工程工具政策。",
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
  },
  checkpoints: [
    {
      id: "project",
      title: "识别项目",
      description:
        "核验 TypeScript 项目身份并确定 single repo 或 monorepo 范围；不执行目标代码。",
      instructions:
        "只读核对根 manifest、TypeScript 身份证据及 workspace 声明。指出不符的文件和字段，修正后重新检查；不要执行目标代码，也不要用成员数量猜测分类。",
      output: {
        description:
          "成功时将项目分类提供给本次执行的后续检查点；这是输出契约说明，不是某次执行结果。",
        fields: [
          {
            name: "kind",
            description:
              "`single-repo` 表示单仓项目，`monorepo` 表示存在 workspace 身份声明；后续 workspace 检查据此判断是否适用。分类不保证 workspace 配置内容合法。",
          },
        ],
      },
      rules: [
        {
          code: "typescript-project-valid",
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
      instructions:
        "读取前序项目分类。single repo 无需 workspace 配置；monorepo 按 Rules 核对根 pnpm-workspace.yaml 的普通文件类型、YAML 对象及 packages 数组，报告准确字段，不执行成员命令。",
      output: {
        description:
          "成功输出为 `undefined`，不向 Context 提供额外数据；single repo 不适用时同样如此。",
      },
      rules: [
        {
          code: "workspace-configuration-valid",
          description:
            "Monorepo 根目录必须提供普通文件 `pnpm-workspace.yaml`，根 manifest 的 `workspaces` 不能替代。配置必须为合法 YAML（无重复键或未定义别名）的对象，显式包含非空 `packages` 数组，且每项为含非空白字符的字符串；允许其他全局字段。本规则不保证模式语义或匹配结果，链接重定向与别名预算耗尽仍属执行故障。",
        },
      ],
    },
  ],
};
