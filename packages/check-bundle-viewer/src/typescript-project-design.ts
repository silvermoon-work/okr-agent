import type { CheckBundleSpec } from "./spec.js";
import { typescriptProjectSpec } from "./typescript-project.js";

const current = structuredClone(typescriptProjectSpec);
const workspace = current.checkers["workspace"]!;

export const typescriptProjectDesignSpec: CheckBundleSpec = {
  ...current,
  name: "TypeScript 项目 · Monorepo 下一层设计（未实现）",
  checkers: {
    ...current.checkers,
    workspace: {
      ...workspace,
      description: `${workspace.description}\n\n**设计差异：** 下列成员发现 child 尚未实现。这里建议由本节点先验证配置并取得成员模式，再向下游传递事实；不依赖兄弟节点执行顺序，不把 CheckerResult 当作配置缓存。`,
      children: [
        {
          checker: "packages",
          when: "workspace 配置通过，已取得合法声明结构中的成员模式。",
          parameter:
            "构造 `{ projectDirectory, patterns: configuration.packages }`。父节点负责读取并验证配置后构造参数；`configuration` 是读取事实，不是另一个 checker 的检查结果。",
        },
      ],
    },
    packages: {
      title: "成员发现 · 设计候选",
      description:
        "**尚未实现，不代表当前检查能力。**\n\n按已确认的 pnpm 模式语义发现成员，不强制目录布局。只负责成员范围及成员关系，不在这里检查每个 package 的工具、scripts、源码或交付。\n\n**待讨论：** 合法模式无匹配、匹配目录缺少 manifest、重复匹配、成员名称冲突与根包归属的处理和问题归属。在这些政策确认前，不承诺最终成员集合，也不预设问题码。",
      parameter: {
        schema: {
          type: "object",
          properties: {
            projectDirectory: {
              type: "string",
              minLength: 1,
              description: "已识别 monorepo 的宿主绝对根目录。",
            },
            patterns: {
              type: "array",
              minItems: 1,
              items: { type: "string", pattern: "\\S" },
              description:
                "来自已验证 workspace 配置的 `packages` 声明。仅保证结构，不保证模式语义或匹配结果。",
            },
          },
          required: ["projectDirectory", "patterns"],
          additionalProperties: false,
        },
        preconditions: [
          "`projectDirectory` 已确认为合法 TypeScript monorepo 的可只读根目录。",
          "直接父节点已验证 pnpm workspace 配置，并原样传入非空 `packages` 字符串数组作为 `patterns`；不假定模式可解释或成员非空。",
        ],
      },
      rules: [
        {
          description:
            "**已确认方向，尚未实现：** 以 pnpm workspace 模式语义决定成员范围，不用扫描到的所有 package.json 或固定目录布局替代声明。具体错误条件与问题码待讨论，不把空问题列表理解为无条件通过。",
          problems: [],
        },
      ],
      children: [
        {
          checker: "package",
          when: "成员范围已可靠确定，当前成员目录存在且可只读；具体 manifest 检查尚未进行。",
          parameter:
            "构造 `{ projectDirectory, packageDirectory: member.directory }`，其中 `member.directory` 是已确认成员的宿主绝对目录；不能预先假定 manifest 有效。",
          forEach:
            "对已确认集合中的每个成员展开一次。集合如何去重、是否包含根包以及空集合政策仍待讨论，不能由此边推导。",
        },
      ],
    },
    package: {
      title: "单个 package · 职责边界",
      description:
        "**尚未实现，具体规则待讨论。**\n\n接收已发现的一个成员，后续再定义其 manifest、操作接口、源码与测试、适用配置、依赖声明和 deliverable 检查。成员已发现不代表 package 合规。\n\n这里暂不添加子领域或问题码，也不要求成员重复根工具声明或复制共享配置。根包是否使用本节点、single repo 是否复用本节点仍未确认；当前不增加这两种边。",
      parameter: {
        schema: {
          type: "object",
          properties: {
            projectDirectory: {
              type: "string",
              minLength: 1,
              description: "所属 monorepo 的宿主绝对根目录。",
            },
            packageDirectory: {
              type: "string",
              minLength: 1,
              description: "当前已发现成员的宿主绝对目录。",
            },
          },
          required: ["projectDirectory", "packageDirectory"],
          additionalProperties: false,
        },
        preconditions: [
          "直接父节点已确认 `packageDirectory` 属于成员集合且目录存在、可只读。",
          "保留所属 `projectDirectory` 以解释共享配置；不假定成员 manifest 存在、有效或具备唯一名称。",
        ],
      },
      rules: [],
      children: [],
    },
  },
};
