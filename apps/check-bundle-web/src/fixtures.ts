import { typescriptProjectSpec } from "@silvermoon-work/check-bundle-viewer";
import type {
  CheckBundleSpec,
  CheckerDefinition,
  ChildDefinition,
} from "@silvermoon-work/check-bundle-viewer";

const projectSchema = {
  type: "object",
  properties: {
    projectDirectory: {
      type: "string",
      minLength: 1,
      description: "目标项目的**绝对目录**，对应 `projectDirectory`。",
    },
  },
  required: ["projectDirectory"],
  additionalProperties: false,
};
const packageSchema = {
  type: "object",
  properties: {
    packageDirectory: {
      type: "string",
      description: "**已发现**成员的绝对目录，来自 `member.directory`。",
    },
  },
  required: ["packageDirectory"],
  additionalProperties: false,
};
const checker = (
  title: string,
  description: string,
  preconditions = [
    "`projectDirectory` 指向调用方已确认存在且允许读取的项目目录。",
  ],
): CheckerDefinition => ({
  title,
  description,
  parameter: { schema: projectSchema, preconditions },
  rules: [],
  children: [],
});
const edge = (
  target: string,
  when: string,
  parameter = "沿用 `{ projectDirectory }`。",
  forEach?: string,
): ChildDefinition => ({
  checker: target,
  when,
  parameter,
  ...(forEach ? { forEach } : {}),
});

export const discussionSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "TypeScript 项目检查（讨论 mock）",
  root: "project",
  checkers: {
    project: {
      ...checker(
        "识别项目",
        "确认 **TypeScript 项目身份**，再选择单仓或 monorepo 分支。\n\n这里讨论的是定义与职责，不是某次执行的结果。源码当前实现范围请切换到「真实 Check」示例。",
      ),
      rules: [
        {
          description:
            "项目身份必须可以明确识别。\n\n> 问题由本节点报告，不汇总后代检查结果。",
          problems: [
            {
              code: "typescript-project-invalid",
              description: "无法识别合法的**项目身份**。",
              when: "`projectDirectory` 对应的身份依据不足，或不满足支持的结构。",
            },
          ],
        },
      ],
      children: [
        edge("single-repo", "合法 **single repo**。"),
        edge("monorepo", "合法 **monorepo**。"),
      ],
    },
    "single-repo": {
      ...checker(
        "单仓项目",
        "检查单个 package 的工程约束。\n\n这里只展示 mock 定义，不执行项目脚本。",
        ["`projectDirectory` 已被确认为合法的 TypeScript single repo。"],
      ),
      children: [edge("config", "配置适用范围已确认。")],
    },
    monorepo: {
      ...checker(
        "Monorepo",
        "从全局配置与成员 package 两条职责分支展开检查。",
        ["`projectDirectory` 已被确认为合法的 TypeScript monorepo。"],
      ),
      children: [
        edge("workspace", "全局范围成立。"),
        edge("packages", "workspace 声明可读取。"),
      ],
    },
    workspace: {
      ...checker(
        "全局配置",
        "检查 workspace 范围内的工具、操作接口、文档及共享配置。",
      ),
      children: [
        edge("tools", "环境检查范围已确认。"),
        edge("scripts", "脚本上下文可用。"),
        edge("documents", "文档范围已确认。"),
        edge(
          "config",
          "共享 **TypeScript** 配置适用范围已确认。",
          '`{ projectDirectory, configuration: "tsconfig" }`。',
        ),
        edge(
          "config",
          "共享 **测试** 配置已发现。",
          "`{ projectDirectory, configuration: config.name }`。",
          "逐个已发现的 `config` 展开；同一父节点可有多条不同边。",
        ),
      ],
    },
    tools: checker(
      "工具与环境",
      "检查开发工具声明。\n\n- 核对版本范围\n- 核对共享工具来源\n\n条件不会作为 shell 命令执行。",
    ),
    scripts: checker(
      "根 scripts",
      '检查工程操作接口及固定入口，**不执行**项目脚本。\n\n```json\n{ "check": "node scripts/check.mjs" }\n```',
    ),
    documents: checker(
      "全局文档",
      "检查 workspace 文档的存在与基本约定。\n\n文档链接示例：[TypeScript 文档](https://www.typescriptlang.org/docs/)。",
    ),
    config: {
      ...checker(
        "共享检查配置",
        "同一份 checker 定义被多个父节点引用，也可以被同一父节点以不同参数展开。\n\n这**不是**运行结果复用，也不代表只执行一次。",
      ),
      parameter: {
        schema: {
          ...projectSchema,
          properties: {
            ...projectSchema.properties,
            configuration: {
              type: "string",
              description: "当前配置的逻辑名称，例如 `tsconfig` 或 `vitest`。",
            },
          },
        },
        preconditions: [
          "`projectDirectory` 与共享配置的适用范围已由直接父节点确认。",
        ],
      },
      rules: [
        {
          description: "共享配置满足当前讨论的约束。",
          problems: [
            {
              code: "configuration-missing",
              description: "目标配置**缺失**。",
              when: "参数指定的 `configuration` 无法读取。",
            },
          ],
        },
      ],
    },
    packages: {
      ...checker(
        "成员发现",
        "从 `projectDirectory` 读取 workspace 声明，发现成员，再构造成员检查参数。\n\n**只负责成员范围的确认**，不在这里检查每个 package 的工程配置。",
        [
          "`projectDirectory` 已被识别为合法的 TypeScript monorepo 根目录。",
          "读取上下文已限定在 `projectDirectory` 对应的项目范围内。",
        ],
      ),
      rules: [
        {
          description:
            "> 以下问题由成员发现负责报告；不是对后续成员检查结果的汇总。",
          problems: [
            {
              code: "workspace-members-invalid",
              description: "成员声明无法解释。",
              when: "workspace 声明不能解析为**受支持**的成员范围。",
            },
            {
              code: "workspace-member-missing",
              description: "成员目录不存在。",
              when: "`member.directory` 指向的预期 package 目录不存在。",
            },
          ],
        },
      ],
      children: [
        edge(
          "package",
          "成员已发现，目录存在。",
          '将 `member.directory` 作为 `packageDirectory`：\n\n```json\n{ "packageDirectory": "<member.directory>" }\n```',
          "对每个已确认的 `member` 展开一次，例如 `apps/web`、`packages/core`。",
        ),
      ],
    },
    package: {
      ...checker(
        "成员包",
        "以 `packageDirectory` 为对象，展开成员自身的声明、操作接口与交付检查。\n\n这里只展示定义，不生成某次运行的参数实例。",
      ),
      parameter: {
        schema: packageSchema,
        preconditions: [
          "`packageDirectory` 指向已经发现且确认存在的 workspace 成员目录。",
        ],
      },
      children: [
        edge("manifest", "成员对象已建立。", "沿用 `{ packageDirectory }`。"),
        edge(
          "deliverable",
          "成员对象已建立。",
          "沿用 `{ packageDirectory }`。",
        ),
        edge(
          "config",
          "成员所属 workspace 已确认。",
          "`{ projectDirectory: member.workspaceRoot }`。",
        ),
      ],
    },
    manifest: {
      ...checker("Package 声明", "检查成员自身的 package 声明。"),
      parameter: {
        schema: packageSchema,
        preconditions: ["`packageDirectory` 对应已发现的成员。"],
      },
    },
    deliverable: {
      ...checker("交付声明", "讨论成员自身的交付类型及对应专项要求。"),
      parameter: {
        schema: packageSchema,
        preconditions: ["`packageDirectory` 对应已发现的成员。"],
      },
    },
  },
};

const invalidCycleSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "无效循环引用（mock）",
  root: "alpha",
  checkers: {
    alpha: {
      ...checker("定义 Alpha", "无效循环示例。"),
      children: [edge("beta", "文档条件 A。")],
    },
    beta: {
      ...checker("定义 Beta", "无效循环示例。"),
      children: [edge("alpha", "文档条件 B。")],
    },
  },
};

export const fixtures: { id: string; label: string; spec: unknown }[] = [
  { id: "discussion", label: "项目定义讨论 · mock", spec: discussionSpec },
  {
    id: "actual",
    label: "真实 Check · 当前身份分流",
    spec: typescriptProjectSpec,
  },
  {
    id: "invalid-cycle",
    label: "无效定义：循环引用 · mock",
    spec: invalidCycleSpec,
  },
  {
    id: "invalid",
    label: "无效引用与 Schema · mock",
    spec: {
      ...discussionSpec,
      root: "unknown-root",
      checkers: {
        broken: {
          ...checker("无效定义", "仅用于错误演示。"),
          parameter: {
            schema: {
              type: "object",
              properties: { path: { type: "not-a-json-type" } },
            },
            preconditions: [],
          },
          children: [edge("unknown-child", "仅为说明文本。")],
        },
      },
    },
  },
];
