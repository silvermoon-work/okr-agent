import type { CheckBundleSpec } from "../src/spec.js";

export const validationSpec: CheckBundleSpec = {
  specVersion: "1.0",
  name: "校验用合成定义",
  root: "member-context",
  checkers: {
    "member-context": {
      title: "上下文",
      description: "合成的校验 fixture，不映射作者源码。",
      parameter: {
        schema: {
          type: "object",
          properties: { directory: { type: "string" } },
          required: ["directory"],
        },
        preconditions: ["`directory` 指向可读取目录。"],
      },
      rules: [],
      children: [
        {
          checker: "member-scripts",
          when: "上下文可用。",
          parameter: "沿用 `directory`。",
        },
      ],
    },
    "member-scripts": {
      title: "脚本定义",
      description: "合成的叶节点。",
      parameter: {
        schema: {
          type: "object",
          properties: {
            directory: {
              type: "string",
              description: "目标 **目录**，对应 `directory`。",
            },
          },
          required: ["directory"],
        },
        preconditions: ["`directory` 已确认存在。"],
      },
      rules: [
        {
          description: "检查定义。",
          problems: [
            {
              code: "gate-missing",
              description: "定义缺失。",
              when: "没有定义。",
            },
          ],
        },
      ],
      children: [],
    },
  },
};

export function graphSpec(): CheckBundleSpec {
  const leaf = structuredClone(validationSpec).checkers["member-scripts"]!;
  const edge = (checker: string) => ({
    checker,
    when: "文档条件",
    parameter: "文档参数",
  });
  return {
    specVersion: "1.0",
    name: "共享 DAG",
    root: "root",
    checkers: {
      root: {
        ...leaf,
        title: "入口",
        children: [edge("left"), { ...edge("right"), forEach: "已发现成员" }],
      },
      left: { ...leaf, title: "左分支", children: [edge("shared")] },
      right: {
        ...leaf,
        title: "右分支",
        children: [edge("shared")],
      },
      shared: {
        ...leaf,
        title: "共享节点",
        parameter: { schema: { type: "object" }, preconditions: [] },
        rules: [{ description: "无问题的说明规则", problems: [] }],
      },
      detached: { ...leaf, title: "未引用定义", rules: [] },
    },
  };
}

export function deepSpec(): CheckBundleSpec {
  const count = 12;
  return {
    specVersion: "1.0",
    name: "深层定义布局回归",
    root: "level-1",
    checkers: Object.fromEntries(
      Array.from({ length: count }, (_, index) => {
        const depth = index + 1;
        return [
          `level-${String(depth)}`,
          {
            title: `第 ${String(depth)} 层：需要完整阅读并区分的长标题 / ${"LongUnbrokenCheckerName".repeat(3)}`,
            description: "合成的深层单链，不映射业务检查。",
            parameter: { schema: { type: "object" }, preconditions: [] },
            rules: [],
            children:
              depth < count
                ? [
                    {
                      checker: `level-${String(depth + 1)}`,
                      when: "父节点通过。",
                      parameter: "沿用参数。",
                    },
                  ]
                : [],
          },
        ];
      }),
    ),
  };
}
