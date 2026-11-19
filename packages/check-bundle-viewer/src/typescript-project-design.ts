import type { CheckBundleSpec, CheckpointDefinition } from "./spec.js";
import { typescriptProjectSpec } from "./typescript-project.js";

const tools = [
  {
    id: "turbo",
    name: "turbo",
    purpose: "九个根 scripts 的成员同名任务聚合。",
  },
  {
    id: "prettier",
    name: "prettier",
    purpose: "format 与 format-check 的共享格式化工具。",
  },
  { id: "eslint", name: "eslint", purpose: "lint 的执行工具。" },
  {
    id: "typescript-eslint",
    name: "typescript-eslint",
    purpose: "TypeScript 类型感知 lint 支持。",
  },
  {
    id: "vitest",
    name: "vitest",
    purpose: "test 与 test-coverage 的单次测试执行器。",
  },
  {
    id: "vitest-coverage-v8",
    name: "@vitest/coverage-v8",
    purpose: "覆盖率 provider，版本需与 Vitest 兼容。",
  },
  {
    id: "typescript",
    name: "typescript",
    purpose: "typecheck 编译器及类型感知工具支持。",
  },
];

const toolCheckpoints: CheckpointDefinition[] = tools.map(
  ({ id, name, purpose }) => ({
    id: `tool-${id}`,
    title: `${name} 工具声明`,
    description: `**设计候选，尚未实现。** 核验根开发依赖 \`${name}\` 及其 catalog 版本解析；用途：${purpose}`,
    instructions: `设计讨论时逐项说明根开发依赖 \`${name}\` 的声明和版本解析如何满足 Rules；检查尚未实现，不执行、安装或升级工具，不声称已通过。`,
    output: { description: "尚未实现，未定义成功输出数据；此处不是执行结果。" },
    rules: [
      {
        code: "workspace-tool-declared",
        description: `根 \`packageJson.devDependencies\` 必须有 ${name} 自有键，不以传递依赖或宿主全局安装替代；不要求成员重复声明。`,
      },
      {
        code: "workspace-tool-version-valid",
        description:
          "版本必须为非空字符串，且是受支持的明确 semver 声明，或能从 workspace catalog / catalogs 唯一解析的引用；未知协议、缺少引用目标或非法结构不能视为有效版本。不扫描 node_modules、不执行工具、不安装或查询本机 registry；稳定性、最新版本及 Node/peer 兼容性须另定可信元数据与新鲜度契约，不凭猜测自动升级。",
      },
    ],
  }),
);

export const typescriptProjectDesignSpec: CheckBundleSpec = {
  ...structuredClone(typescriptProjectSpec),
  name: "TypeScript 项目 · 有序工程检查设计（未实现）",
  description:
    "工程检查设计候选：在项目身份与 workspace 配置之后讨论根 scripts、Turbo 入口与共享开发工具声明。新增工程检查尚未实现；只展示设计，不执行工具或声称项目已通过。",
  checkpoints: [
    ...structuredClone(typescriptProjectSpec.checkpoints),
    {
      id: "workspace-entry",
      title: "全局工程配置入口",
      description:
        "**设计候选。** 对 monorepo 核验根 scripts 容器与 `turbo.json` 入口；不提前检查命令值或 Turbo 内容，也不执行目标命令。",
      instructions:
        "设计讨论时分别核对 scripts 容器和 turbo.json 文件，列出缺失或类型不符处；尚未实现，不执行目标脚本或据文件存在推断工程已通过。",
      output: { description: "设计候选，尚未实现；成功输出数据待定义。" },
      rules: [
        {
          code: "workspace-scripts-present",
          description: "根 manifest 必须包含自有字段 `scripts`。",
        },
        {
          code: "workspace-scripts-object",
          description:
            "`scripts` 必须为命令映射对象，不能是 null、数组或其他非对象值；名称与命令值留给下一检查点。",
        },
        {
          code: "workspace-turbo-present",
          description:
            "根目录必须存在准确命名的 `turbo.json`，不接受 `turbo.jsonc` 或其他文件名替代。",
        },
        {
          code: "workspace-turbo-file",
          description:
            "`turbo.json` 必须为普通文件，不能是目录等条目；链接重定向、意外 I/O 和取消属于执行故障。此处不读取内容，Turbo 解析、tasks、dependsOn、outputs 与 cache 等具体政策仍待讨论。",
        },
      ],
    },
    {
      id: "workspace-scripts",
      title: "根 Scripts · 固定 Turbo 聚合接口",
      description:
        "**已确认封闭的九个 Turbo 聚合命令，检查尚未实现。** 根只聚合成员同名任务，不承载额外根操作；命令匹配不证明成员任务存在或成功执行。",
      instructions:
        "设计讨论时按 Rules 对照命令名和准确命令值，分别解释缺失、额外和不匹配项；尚未实现，不运行这些命令来替代声明核对。",
      output: { description: "尚未实现，未提供实际成功输出数据。" },
      rules: [
        {
          code: "workspace-script-required",
          description:
            "根 scripts 必须包含 `build`、`check`、`clean`、`format`、`format-check`、`lint`、`test`、`test-coverage`、`typecheck` 九个自有键，缺少时指出具体名称；额外名称不能替代。",
        },
        {
          code: "workspace-script-allowed",
          description:
            "根 scripts 只允许这九个名称，不允许额外命令，包括 pre/post 生命周期钩子、发布及项目专用命令；指出每个额外名称，不猜测拼写意图。",
        },
        {
          code: "workspace-script-command-standard",
          description:
            "每个已存在的允许名称，其字符串值必须精确等于 `turbo run <同名任务>`，例如 `test-coverage` 只能是 `turbo run test-coverage`；不接受附加参数、空白变体、串联或包装脚本。只读比较并指出名称、实际值与期望值，不执行命令；缺少和额外名称分别报告，不重复诊断命令值。不检查本地 .mjs 入口或固定核心，也不需要公共聚合工具包。",
        },
      ],
    },
    {
      id: "workspace-tools",
      title: "脚本所需工具 · 设计候选",
      description:
        "**尚未实现，工具组合参考当前项目提出。** 只核验根开发依赖容器，不从 scripts 名称推导消费者最低 Node 版本或工具安装状态。",
      instructions:
        "设计讨论时先确认 devDependencies 容器，再逐项讨论工具声明；不安装依赖，不把声明存在当成本机工具已就绪。",
      output: { description: "尚未实现，未定义成功输出数据。" },
      rules: [
        {
          code: "workspace-tool-declarations-valid",
          description:
            "根 `packageJson.devDependencies` 必须为对象，不能缺失、为 null、数组或其他非对象值；随后按顺序核验各工具声明，不要求成员重复安装共享工具。Node.js/pnpm/PATH/registry/NRM 的实际环境由独立工具链 Check 负责。",
        },
      ],
    },
    ...toolCheckpoints,
  ],
};
