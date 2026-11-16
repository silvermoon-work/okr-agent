import type { CheckBundleSpec, CheckerDefinition } from "./spec.js";
import { typescriptProjectSpec } from "./typescript-project.js";

const current = structuredClone(typescriptProjectSpec);
const project = current.checkers["project"]!;
const workspace = current.checkers["workspace"]!;
const singleParameters = {
  type: "object",
  properties: {
    projectDirectory: {
      type: "string",
      minLength: 1,
      description: "宿主上的项目绝对根目录。",
    },
    packageJson: {
      type: "object",
      additionalProperties: true,
      description:
        "根 package.json 的已解析对象。只完成接收方前置条件要求的基础校验，不代表名称、依赖、scripts 或其他工程政策合规。",
    },
  },
  required: ["projectDirectory", "packageJson"],
  additionalProperties: false,
};
const monorepoParameters = {
  ...singleParameters,
  properties: {
    ...singleParameters.properties,
    workspace: {
      type: "object",
      properties: {
        packages: {
          type: "array",
          minItems: 1,
          items: { type: "string", pattern: "\\S" },
        },
      },
      required: ["packages"],
      additionalProperties: true,
      description:
        "根 pnpm-workspace.yaml 的已解析对象；只确认 YAML 与 packages 声明结构有效，未验证模式语义、成员集合或其他字段政策。",
    },
  },
  required: ["projectDirectory", "packageJson", "workspace"],
};
const toolDefinitions = [
  { name: "turbo", purpose: "九个根 scripts 的成员同名任务聚合。" },
  { name: "prettier", purpose: "format 与 format-check 共享的格式化工具。" },
  { name: "eslint", purpose: "lint 的执行工具。" },
  {
    name: "typescript-eslint",
    purpose: "TypeScript 类型感知 lint 的工具支持。",
  },
  { name: "vitest", purpose: "test 与 test-coverage 的单次测试执行器。" },
  {
    name: "@vitest/coverage-v8",
    purpose: "test-coverage 的覆盖率 provider，版本需与 Vitest 兼容。",
  },
  {
    name: "typescript",
    purpose: "typecheck 的编译器及类型感知工具的 TypeScript 支持。",
  },
] as const;
const toolCheckers: Record<string, CheckerDefinition> = Object.fromEntries(
  toolDefinitions.map(({ name, purpose }) => [
    `tool-${name}`,
    {
      title: `${name} 工具声明`,
      description: `**工具设计候选，尚未实现。**\n\n**检查对象：** 已传入的根 devDependencies[${JSON.stringify(name)}] 与 workspace catalog / catalogs 中被该声明引用的版本。**用途：** ${purpose}\n\n本节点检查直接开发依赖声明是否存在，以及版本声明能否明确解析；不扫描宿主 node_modules，不运行版本命令、安装工具或查询本机 registry。工具存在不代表对应领域配置正确。\n\n稳定性、Node/peer 兼容性与是否最新需要另行明确可信元数据及新鲜度契约，本轮不凭猜测作结论，也不自动升级。Node.js/pnpm 的实际安装、PATH、registry 和 NRM 属于独立工具链检查，不由这些开发依赖节点代替。`,
      parameter: {
        schema: {
          type: "object",
          properties: {
            projectDirectory: singleParameters.properties.projectDirectory,
            devDependencies: { type: "object", additionalProperties: true },
            workspace: monorepoParameters.properties.workspace,
          },
          required: ["projectDirectory", "devDependencies", "workspace"],
          additionalProperties: false,
        },
        preconditions: [
          "直接父节点已确认 devDependencies 为对象，并传入根声明及已完成基础校验的 workspace 事实。",
          `不假定 ${name} 已声明、版本可解析或 catalog 引用目标存在。`,
        ],
      },
      rules: [
        {
          description: `参考当前项目工具组合，建议将 ${name} 显式声明为根开发依赖，而非只依赖传递依赖或宿主全局安装。工具组合仍为设计候选，不与已确认的九个 script 名称混为同一政策。`,
          problems: [
            {
              code: "workspace-tool-missing",
              description: "缺少对应工具的直接开发依赖声明。",
              when: `devDependencies 中没有 ${name} 自有键。`,
            },
          ],
        },
        {
          description:
            "版本必须为非空字符串，且是明确的受支持 semver 声明，或能从传入 workspace 唯一解析的 catalog 引用；共享版本不要求在成员中重复声明。",
          problems: [
            {
              code: "workspace-tool-version-invalid",
              description: "工具版本声明非法或 catalog 引用无法解析。",
              when: "对应声明不是非空字符串、不是受支持的版本声明，或所引用的 catalog / 版本项缺失、结构非法或不能解析。未知协议不能当作已确认的工具版本。",
            },
          ],
        },
      ],
      children: [],
    },
  ]),
);

export const typescriptProjectDesignSpec: CheckBundleSpec = {
  ...current,
  name: "TypeScript 项目 · Monorepo 下一层设计（未实现）",
  checkers: {
    ...current.checkers,
    project: {
      ...project,
      description:
        "**设计候选，尚未实现此参数交接。**\n\n识别 TypeScript 身份与组织形式，同时读取并完成接收方 preconditions 所需的基础校验，再传递解析事实。不传递 CheckerResult，不要求子节点重读同一文件、重复同一基础校验。\n\n基础有效只表示满足下一层的参数 schema 与语义前置条件，不代表 single repo 或 monorepo 已经通过工程检查。路径、权限、取消、读取变化与预算耗尽仍走执行故障通道。",
      rules: [
        ...project.rules,
        ...workspace.rules.map((rule) => ({
          ...rule,
          description: `**仅对已识别的 monorepo：** ${rule.description}\n\n这是构造 monorepo 参数前的基础校验。失败仍报告 workspace 问题，不改报 TypeScript 身份无效；本节点不通过时不展开 children。`,
        })),
      ],
      children: [
        {
          checker: "single-repo",
          when: "身份为 single repo，且根 manifest 已解析为对象。",
          parameter:
            "构造 `{ projectDirectory, packageJson }`；`packageJson` 为本次读取并完成基础校验的根 manifest 对象，不再让子节点按路径重读。",
        },
        {
          checker: "monorepo",
          when: "身份为 monorepo，根 manifest 与 pnpm workspace 配置均满足接收方的基础前置条件。",
          parameter:
            "构造 `{ projectDirectory, packageJson, workspace }`；传递本次读取并完成基础校验的根 manifest 与 pnpm workspace 对象。这里只保证接收方 preconditions，不保证后续领域规则合规。",
        },
      ],
    },
    "single-repo": {
      ...current.checkers["single-repo"]!,
      description:
        "**参数交接设计候选。** 接收已完成基础校验的根 manifest，不重新读取或重复 JSON 对象校验。single repo 的后续工程规则仍未定义，空规则不代表已完成工程合规检查。",
      parameter: {
        schema: singleParameters,
        preconditions: [
          "直接父节点已确认 TypeScript single repo 身份及根目录只读访问边界。",
          "`packageJson` 是本次读取的根 package.json 所解析的对象，已通过 JSON 语法和对象结构校验；不假定名称、依赖、scripts 或其他字段合规。",
        ],
      },
    },
    monorepo: {
      ...current.checkers["monorepo"]!,
      description:
        "**参数交接设计候选。** 接收根 manifest 与 pnpm workspace 解析事实，按职责展开，不重读或重复前置条件中的基础校验。本节点通过不意味着后代通过。",
      parameter: {
        schema: monorepoParameters,
        preconditions: [
          "直接父节点已确认 TypeScript monorepo 身份及根目录只读访问边界。",
          "`packageJson` 为根 manifest 的已解析对象，JSON 语法和对象结构已通过基础校验；未保证工程政策合规。",
          "`workspace` 来自根 pnpm-workspace.yaml 普通文件，YAML 合法且无重复键或未定义别名，文档为对象，显式包含非空 packages 数组且每项为非空白字符串；未保证模式语义、成员范围或其他全局字段合规。",
        ],
      },
      children: [
        {
          checker: "workspace",
          when: "本节点通过，展开全局工程配置职责。",
          parameter:
            "原样传递 `{ projectDirectory, packageJson, workspace }`；直接父节点保证接收方前置条件，不借助兄弟节点的结果或执行顺序。",
        },
        {
          checker: "packages",
          when: "本节点通过，接收的 workspace 中已具备结构有效的 packages 声明；不依赖全局工程配置分支的检查结果。",
          parameter:
            "构造 `{ projectDirectory, patterns: workspace.packages }`，直接从已接收的配置事实投影，不重读配置，也不从 CheckerResult 获取。",
        },
      ],
    },
    workspace: {
      ...workspace,
      title: "全局工程配置 · 职责节点",
      description:
        "**设计候选，不是当前实现。**\n\n**检查对象：** 已传入的根 `packageJson.scripts` 声明，以及根目录的 `turbo.json` 文件入口。\n\n**本节点检查：** scripts 对象是否存在，以及 `turbo.json` 是否为存在的普通文件。不重复读取根 manifest 或检查 pnpm workspace 基础结构，不负责成员发现、逐包检查，也不执行目标命令。\n\n**下层职责：** 根 Scripts Check 统一检查九个名称的封闭集合与固定 Turbo 命令值；Turbo 内容及开发工具声明由另外两个分支负责。根只聚合，不承载成员实际操作或额外职责。\n\n本节点失败不展开任何子检查，但不影响 monorepo 下并列的成员发现分支。意外 I/O、链接重定向和取消仍是执行故障，不伪装成配置缺失。",
      parameter: {
        schema: monorepoParameters,
        preconditions: [
          "直接父节点保证 `projectDirectory`、`packageJson`、`workspace` 满足 monorepo 接收契约；这些是已读取并完成基础校验的事实，不是检查结果对象。",
          "只假定 workspace 为合法 YAML 对象且 packages 为显式非空的非空白字符串数组；不假定模式语义、匹配结果、依赖或其他工程规则已通过。",
        ],
      },
      rules: [
        {
          description:
            "已传入的根 manifest 必须包含对象类型的 `scripts` 字段；这里只检查声明容器，不检查各值的类型、内容或执行效果。以下问题码为设计稿候选，尚未加入生产契约。",
          problems: [
            {
              code: "workspace-scripts-missing",
              description: "根 manifest 缺少 scripts 声明。",
              when: "`packageJson` 中没有自有字段 `scripts`。",
            },
            {
              code: "workspace-scripts-invalid",
              description: "scripts 声明不是命令映射对象。",
              when: "`scripts` 字段存在，但为 null、数组或其他非对象值。",
            },
          ],
        },
        {
          description:
            "**已确认：** 根目录必须存在普通文件 `turbo.json`。此处只发现约定名称与位置的入口，不读取或解析内容；只有 `turbo.jsonc` 或其他文件名不能替代。",
          problems: [
            {
              code: "workspace-turbo-missing",
              description: "缺少根 Turbo 配置文件入口。",
              when: "根目录的 `turbo.json` 不存在。",
            },
            {
              code: "workspace-turbo-invalid",
              description: "Turbo 配置入口不是普通文件。",
              when: "根目录的 `turbo.json` 为目录等非普通条目；符号链接或重定向按执行故障处理。",
            },
          ],
        },
      ],
      children: [
        {
          checker: "workspace-scripts",
          when: "本节点通过，scripts 已确认为对象；不要求名称或命令值已合规。",
          parameter:
            "构造 `{ projectDirectory, scripts: packageJson.scripts }`，传递已发现的命令映射事实，不重读根 manifest；名称集合与命令值由接收方统一检查。",
        },
        {
          checker: "workspace-turbo",
          when: "本节点通过，根 turbo.json 已确认为普通文件。",
          parameter:
            "构造 `{ projectDirectory, configurationPath }`，其中 `configurationPath` 为根 turbo.json 的宿主绝对路径；此时不保证内容可解析。",
        },
        {
          checker: "workspace-tools",
          when: "本节点通过，可独立展开脚本所需工具的声明检查；不依赖 scripts 内容或 Turbo 内容节点结果。",
          parameter:
            "原样传递 `{ projectDirectory, packageJson, workspace }`，工具检查只使用解析事实，不借助兄弟节点缓存或执行结果。",
        },
      ],
    },
    "workspace-scripts": {
      title: "根 Scripts · 固定 Turbo 聚合接口",
      description:
        "**已确认封闭的九个 Turbo 聚合命令，检查尚未实现。**\n\n**检查对象：** 已传入的根 scripts 命令映射。一个 Check 统一检查名称集合与命令值，不再按九个脚本派生子 Check。\n\n根只聚合成员同名任务，不承担额外根操作。不检查本地脚本入口、固定核心或自定义实现行为，不需要另发公共聚合工具包。成员实际操作、Turbo 任务依赖与缓存策略、共享工具及各领域配置由对应分支检查。本节点通过只证明根聚合接口合规，不代表成员任务存在或已成功执行。",
      parameter: {
        schema: {
          type: "object",
          properties: {
            projectDirectory: singleParameters.properties.projectDirectory,
            scripts: {
              type: "object",
              additionalProperties: true,
              description:
                "已确认为对象的根 scripts；未保证名称集合或命令值合规。",
            },
          },
          required: ["projectDirectory", "scripts"],
          additionalProperties: false,
        },
        preconditions: [
          "直接父节点已确认项目根只读访问范围及 scripts 为对象，并原样传入。",
          "不假定任一必需名称存在、没有额外名称或命令值有效，也不依赖并列 Turbo 或工具分支通过。",
        ],
      },
      rules: [
        {
          description:
            "根 scripts 自有键必须恰好为 `build`、`check`、`clean`、`format`、`format-check`、`lint`、`test`、`test-coverage`、`typecheck`。既不能缺少，也不能增加；生命周期钩子、发布或项目专用命令均不例外。",
          problems: [
            {
              code: "workspace-script-missing",
              description: "缺少约定名称的根 script，指出具体名称。",
              when: "九个必需名称中的任一项不是 scripts 自有键；额外名称不能替代缺少的名称。",
            },
            {
              code: "workspace-script-unexpected",
              description: "根 scripts 存在封闭清单以外的命令，指出具体名称。",
              when: "存在九个允许名称之外的自有键，包括 pre/post 生命周期钩子；与缺少名称分别报告，不猜测拼写意图。",
            },
          ],
        },
        {
          description:
            "对已存在的允许名称，命令必须精确等于 `turbo run <同名任务>`。例如 `build` 只能是 `turbo run build`，`test-coverage` 只能是 `turbo run test-coverage`。只读比较原始字符串，不接受附加参数、空白变体、串联、包装脚本或其他委托，不执行命令。",
          problems: [
            {
              code: "workspace-script-command-invalid",
              description:
                "根 script 不是规定的 Turbo 聚合命令，指出名称、实际值及期望值。",
              when: "允许名称已存在，但其值不是字符串或不精确等于对应的 turbo run <同名任务>。缺少的名称只报告 missing，额外名称只报告 unexpected，避免对同一根因重复诊断。",
            },
          ],
        },
      ],
      children: [],
    },
    "workspace-tools": {
      title: "脚本所需工具 · 设计候选",
      description:
        "**尚未实现，工具组合参考当前项目提出。**\n\n**检查对象：** 已传入的根 packageJson.devDependencies 与 workspace catalog 版本事实。本节点只确认开发依赖声明容器为对象，再按工具展开各自的声明与版本检查；不把根开发依赖中的所有包都列为通用必需工具。\n\n九个根 scripts 统一由 Turbo 聚合。Prettier、ESLint、typescript-eslint、Vitest、coverage-v8 与 TypeScript 是被聚合操作的共享工具候选，不是根 scripts 直接执行的命令。\n\n共享工具只检查根声明，不强迫每个成员重复安装；同一工具供多个命令使用，也只在本分支报告声明问题。具体工具版本、安装状态、领域配置和消费者最低 Node 版本不是由 scripts 名称推导的。",
      parameter: {
        schema: monorepoParameters,
        preconditions: [
          "直接父节点传入已读取的根 manifest 与 workspace 基础事实；不保证 devDependencies 容器或任一工具声明有效。",
        ],
      },
      rules: [
        {
          description:
            "参考当前项目共享开发工具的组织方式，要求根 devDependencies 是对象，之后各工具节点独立判断自己的声明。不重读根 manifest，不执行工具。",
          problems: [
            {
              code: "workspace-tool-declarations-invalid",
              description: "根开发工具声明容器缺失或结构非法。",
              when: "packageJson.devDependencies 缺失、为 null、数组或其他非对象值。",
            },
          ],
        },
      ],
      children: toolDefinitions.map(({ name }) => ({
        checker: `tool-${name}`,
        when: "本节点通过，根 devDependencies 已确认为对象。",
        parameter:
          "构造 `{ projectDirectory, devDependencies: packageJson.devDependencies, workspace }`，不假定对应工具键或版本有效。",
      })),
    },
    "workspace-turbo": {
      title: "Turbo · 内容检查待细化",
      description:
        "**尚未实现，细节规则待讨论。**\n\n**检查对象：** configurationPath 指向的根 `turbo.json` 内容。后续在这里讨论读取解析、配置结构、tasks、dependsOn、outputs 与 cache 等具体要求，不执行 Turbo 或目标配置。\n\n不重复入口名称、位置与存在性校验；父节点没有读取内容，本节点负责内容读取及后续判断。不把现有仓库的全部 Turbo 配置直接当作通用强制政策。",
      parameter: {
        schema: {
          type: "object",
          properties: {
            projectDirectory: singleParameters.properties.projectDirectory,
            configurationPath: {
              type: "string",
              minLength: 1,
              description: "已发现的根 turbo.json 普通文件的宿主绝对路径。",
            },
          },
          required: ["projectDirectory", "configurationPath"],
          additionalProperties: false,
        },
        preconditions: [
          "直接父节点已确认 configurationPath 是项目根 turbo.json 的绝对路径，且入口为允许只读的普通文件。",
          "未保证内容可解析或符合 Turbo schema、任务图或缓存政策；读取期间的意外变化仍作为执行故障。",
        ],
      },
      rules: [],
      children: [],
    },
    ...toolCheckers,
    packages: {
      title: "成员发现 · 设计候选",
      description:
        "**尚未实现，不代表当前检查能力。**\n\n与全局工程配置并列的成员发现与关系职责节点，由 monorepo 直接展开，不以全局工程配置分支通过为前提。按已确认的 pnpm 模式语义发现成员，不强制目录布局；确认成员后在本节点下逐个展开 package 检查。\n\n只负责成员范围及成员关系，不在这里检查每个 package 的工具、scripts、源码或交付。\n\n**待讨论：** 合法模式无匹配、匹配目录缺少 manifest、重复匹配、成员名称冲突与根包归属的处理和问题归属。在这些政策确认前，不承诺最终成员集合，也不预设问题码。",
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
          "直接父节点从已完成基础校验的 workspace 事实中原样传入非空 `packages` 字符串数组作为 `patterns`；不假定模式可解释或成员非空。",
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
