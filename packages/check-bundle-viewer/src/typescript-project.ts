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
  name: "TypeScript 项目 · 当前身份分流",
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
        "对应当前 `src/checks/repositories.ts` 的 `monorepo`。\n\n当前仅检查取消信号，随后返回 `pass: true, children: []`；不声称已实现成员发现或工程检查。",
      parameter: {
        schema,
        preconditions: [
          "`projectDirectory` 已被上游身份识别确认为合法 TypeScript monorepo。",
        ],
      },
      rules: [],
      children: [],
    },
  },
};
