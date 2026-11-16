import type { CheckBundleSpec } from "./spec.js";

const schema = {
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
};

/** Manually maintained excerpt of the current src/checks definitions, not src-legacy. */
export const typescriptProjectSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "TypeScript 项目 · 当前身份分流与 workspace 配置",
  root: "project",
  checkers: {
    project: {
      title: "识别项目",
      description:
        "对应当前 `check.typescript-project/src/checks/project.ts`。\n\n调用 `identifyRepository(projectDirectory, signal)` 识别项目身份；有效时按 `identity.kind` 选择**一个**仓库分支。这里只描述当前源码，不把旧版完整检查或 mock 当成已实现规则。",
      parameter: {
        schema,
        preconditions: [
          "调用方提供存在、可读取、未重定向的宿主绝对目录 `projectDirectory`，并允许按只读预算枚举。路径、权限、取消和读取预算等异常由执行故障通道处理，不伪装成身份问题。",
        ],
      },
      rules: [
        {
          description:
            "检查 `identifyRepository` 是否返回有效 TypeScript 项目身份。\n\n身份识别读取根 manifest，寻找 TypeScript 依赖、tsconfig 或 TS 源码证据；缺少这些证据时，monorepo 还会读取其他 package manifest 中的 TypeScript 依赖声明。",
          problems: [
            {
              code: "typescript-project-invalid",
              description: "无法识别合法的 TypeScript 项目身份。",
              when: '`identifyRepository` 返回 `kind: "invalid"`，例如根 manifest 缺失、不是合法 JSON 对象，或未发现 TypeScript 依赖、tsconfig 或 TS 源码。不是任意读取异常的兜底问题。',
            },
          ],
        },
        {
          description:
            "身份成立后，根目录存在普通文件 `pnpm-workspace.yaml`，或根 manifest 存在 `workspaces` 字段，就识别为 monorepo；否则识别为 single repo。不按成员数量猜测，不在身份层验证 workspace 内容。",
          problems: [],
        },
      ],
      children: [
        {
          checker: "single-repo",
          when: '`identity.kind === "single-repo"`。',
          parameter: "原样传递 `target`，即 `{ projectDirectory }`。",
        },
        {
          checker: "monorepo",
          when: '`identity.kind === "monorepo"`。',
          parameter: "原样传递 `target`，即 `{ projectDirectory }`。",
        },
      ],
    },
    "single-repo": {
      title: "单仓项目",
      description:
        "对应当前 `src/checks/repositories.ts` 的 `single-repo`。\n\n当前仅检查取消信号，随后返回 `pass: true, children: []`；尚未实现进一步工程规则。",
      parameter: {
        schema,
        preconditions: [
          "`projectDirectory` 已被上游身份识别确认为合法 TypeScript single repo。",
        ],
      },
      rules: [],
      children: [],
    },
    monorepo: {
      title: "Monorepo",
      description:
        "对应当前 `src/checks/repositories.ts` 的 `monorepo`。\n\n确认取消信号后展开 workspace 配置检查。本节点只组织职责，不汇总后代问题；目前没有成员发现或 package 工程检查。",
      parameter: {
        schema,
        preconditions: [
          "`projectDirectory` 已被上游身份识别确认为合法 TypeScript monorepo。",
        ],
      },
      rules: [],
      children: [
        {
          checker: "workspace",
          when: "本节点通过，即取消信号未触发。",
          parameter: "原样传递 `target`，即 `{ projectDirectory }`。",
        },
      ],
    },
    workspace: {
      title: "Workspace 配置",
      description:
        "对应当前 `src/checks/workspace.ts`。\n\n只检查 monorepo 的 pnpm workspace 声明是否存在且结构合法，不执行配置或目标代码。成员发现将遵循 pnpm 模式语义，但本轮尚不展开模式，不检查空匹配、成员 manifest、名称冲突或根包归属，也不强制 `apps/`、`packages/` 布局。",
      parameter: {
        schema,
        preconditions: [
          "`projectDirectory` 已被上游身份识别确认为合法 TypeScript monorepo 根目录；不要求 pnpm workspace 配置已存在或有效，这正是本节点检查的对象。",
          "继承项目根检查的只读宿主访问边界；意外 I/O、链接重定向、读取变化、取消、文件读取或 YAML 别名展开预算耗尽由执行故障通道处理。",
        ],
      },
      rules: [
        {
          description:
            "根目录必须提供普通文件 `pnpm-workspace.yaml`。根 manifest 的 `workspaces` 仅能作为 monorepo 身份依据，不能替代该文件。",
          problems: [
            {
              code: "workspace-configuration-invalid",
              description: "Monorepo 缺少必需的 pnpm workspace 配置普通文件。",
              when: "`pnpm-workspace.yaml` 不存在，或是目录等非普通文件。符号链接不是此 problem 的兜底情况，而是执行故障。",
            },
          ],
        },
        {
          description:
            "配置必须是合法 YAML，键不得重复；无法解析的别名也属于配置问题。",
          problems: [
            {
              code: "workspace-configuration-invalid",
              description: "Workspace YAML 无法解析。",
              when: "YAML 解析器报告语法或重复键错误，或转换时发现未定义别名。超出别名展开预算不是业务问题。",
            },
          ],
        },
        {
          description:
            "配置必须为对象，显式包含非空 `packages` 数组，且每项为含非空白字符的字符串；允许其他全局字段。本轮只验证声明结构，不保证每个字符串都是有效 pnpm 模式或能匹配成员。",
          problems: [
            {
              code: "workspace-configuration-invalid",
              description: "Workspace 成员声明结构非法。",
              when: "文档不是对象，或 `packages` 缺失、不是数组、为空数组，或任一项不是字符串或仅含空白。",
            },
          ],
        },
      ],
      children: [],
    },
  },
};
