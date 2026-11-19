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
    rules: [
      {
        code: "workspace-tool-missing",
        description: `根 \`packageJson.devDependencies\` 必须有 ${name} 自有键，不以传递依赖或宿主全局安装替代；不要求成员重复声明。`,
      },
      {
        code: "workspace-tool-version-invalid",
        description:
          "版本必须为非空字符串，且是受支持的明确 semver 声明，或能从 workspace catalog / catalogs 唯一解析的引用；未知协议、缺少引用目标或非法结构不能视为有效版本。不扫描 node_modules、不执行工具、不安装或查询本机 registry；稳定性、最新版本及 Node/peer 兼容性须另定可信元数据与新鲜度契约，不凭猜测自动升级。",
      },
    ],
  }),
);

export const typescriptProjectDesignSpec: CheckBundleSpec = {
  ...structuredClone(typescriptProjectSpec),
  name: "TypeScript 项目 · 有序工程检查设计（未实现）",
  checkpoints: [
    ...structuredClone(typescriptProjectSpec.checkpoints),
    {
      id: "workspace-entry",
      title: "全局工程配置入口",
      description:
        "**设计候选。** 对 monorepo 核验根 scripts 容器与 `turbo.json` 入口；不提前检查命令值或 Turbo 内容，也不执行目标命令。",
      rules: [
        {
          code: "workspace-scripts-missing",
          description: "根 manifest 必须包含自有字段 `scripts`。",
        },
        {
          code: "workspace-scripts-invalid",
          description:
            "`scripts` 必须为命令映射对象，不能是 null、数组或其他非对象值；名称与命令值留给下一检查点。",
        },
        {
          code: "workspace-turbo-missing",
          description:
            "根目录必须存在准确命名的 `turbo.json`，不接受 `turbo.jsonc` 或其他文件名替代。",
        },
        {
          code: "workspace-turbo-invalid",
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
      rules: [
        {
          code: "workspace-script-missing",
          description:
            "根 scripts 必须包含 `build`、`check`、`clean`、`format`、`format-check`、`lint`、`test`、`test-coverage`、`typecheck` 九个自有键，缺少时指出具体名称；额外名称不能替代。",
        },
        {
          code: "workspace-script-unexpected",
          description:
            "根 scripts 只允许这九个名称，不允许额外命令，包括 pre/post 生命周期钩子、发布及项目专用命令；指出每个额外名称，不猜测拼写意图。",
        },
        {
          code: "workspace-script-command-invalid",
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
      rules: [
        {
          code: "workspace-tool-declarations-invalid",
          description:
            "根 `packageJson.devDependencies` 必须为对象，不能缺失、为 null、数组或其他非对象值；随后按顺序核验各工具声明，不要求成员重复安装共享工具。Node.js/pnpm/PATH/registry/NRM 的实际环境由独立工具链 Check 负责。",
        },
      ],
    },
    ...toolCheckpoints,
  ],
};
