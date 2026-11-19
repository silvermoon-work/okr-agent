import {
  typescriptProjectSpec,
  typescriptProjectDesignSpec,
} from "@silvermoon-work/check-bundle-viewer";
import type { CheckBundleSpec } from "@silvermoon-work/check-bundle-viewer";

export const discussionSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "TypeScript 项目检查（有序讨论 mock）",
  parameter: structuredClone(typescriptProjectSpec.parameter),
  checkpoints: [
    {
      id: "project",
      title: "识别项目",
      description:
        "确认 **TypeScript 项目身份** 与检查范围。这里只讨论定义，不是某次执行结果。",
      rules: [
        {
          code: "typescript-project-invalid",
          description:
            "`projectDirectory` 必须具备可明确识别的 TypeScript 身份与受支持结构。",
        },
      ],
    },
    {
      id: "configuration",
      title: "共享检查配置",
      description:
        "核验项目适用的共享配置；所有检查点读取同一个任务 Target，不构造成员参数。",
      rules: [
        {
          code: "configuration-missing",
          description: "适用的 TypeScript 与测试配置必须存在且可读取。",
        },
      ],
    },
    {
      id: "members",
      title: "成员发现",
      description:
        "对 monorepo 确认 workspace 声明所定义的成员范围，不以固定目录布局代替。",
      rules: [
        {
          code: "workspace-members-invalid",
          description: "workspace 声明必须能够解释为**受支持**的成员范围。",
        },
        {
          code: "workspace-member-missing",
          description: "声明所要求的成员目录必须存在。",
        },
      ],
    },
    {
      id: "documents",
      title: "全局文档",
      description:
        "核验项目文档的存在与基本约定；参考 [TypeScript 文档](https://www.typescriptlang.org/docs/)。",
      rules: [
        {
          code: "document-missing",
          description: "项目必须具备约定的开发与维护说明。",
        },
      ],
    },
  ],
};

export const fixtures: { id: string; label: string; spec: unknown }[] = [
  {
    id: "typescript-design",
    label: "TypeScript Project · 有序工程检查设计（未实现）",
    spec: typescriptProjectDesignSpec,
  },
  { id: "discussion", label: "有序项目定义讨论 · mock", spec: discussionSpec },
  {
    id: "actual",
    label: "TypeScript Project · 身份与 workspace 配置",
    spec: typescriptProjectSpec,
  },
  {
    id: "invalid-duplicate",
    label: "无效定义：重复检查点 ID · mock",
    spec: {
      ...discussionSpec,
      checkpoints: [
        discussionSpec.checkpoints[0],
        discussionSpec.checkpoints[0],
      ],
    },
  },
  {
    id: "invalid",
    label: "无效规则码与 Schema · mock",
    spec: {
      ...discussionSpec,
      parameter: {
        schema: {
          type: "object",
          properties: { path: { type: "not-a-json-type" } },
        },
        preconditions: [],
      },
      checkpoints: [
        {
          ...discussionSpec.checkpoints[0],
          rules: [
            { code: "duplicate", description: "第一条规则。" },
            { code: "duplicate", description: "不允许本检查点内重复规则码。" },
          ],
        },
      ],
    },
  },
  {
    id: "invalid-version",
    label: "不支持的版本 v2 · mock",
    spec: { specVersion: "2.0", name: "无效版本文档" },
  },
];
