import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "pre-commit",
  title: "提交前自动检查 Silvermoon 候选",
  description:
    "检查 Git 实际使用的 pre-commit hook 会校验暂存候选并阻止非法提交。",
  instructions: `通过 \`git rev-parse --path-format=absolute --git-path hooks\`
定位 Git 实际使用的 hooks 目录，再追加 pre-commit 文件名，
避免 Git 提前解析文件符号链接；尊重 core.hooksPath 与 linked worktree。
检查本身只读文件，不执行 hook，也不自动修改 Git 配置或安装 hook。
用户授权配置后，保留已有逻辑，采用下列可验证的 shell 前缀：

\`\`\`sh
#!/bin/sh
# BEGIN Silvermoon check-changes
silvermoon check-changes --staged --audience agent || exit $?
# END Silvermoon check-changes
\`\`\`

已有兼容的 sh hook 可在此前缀后保留原脚本正文；不能覆盖或丢弃原逻辑。
若原 hook 使用其他解释器或 hook manager，先明确集成方式，不擅自转换。
非 Windows 设备须为 hook 设置执行权限。配置后的 hook 使用设备级 silvermoon，
不使用项目依赖或源码路径。失败必须向 Git 返回非零，不能使用 || true、
后续命令或只检查工作区来掩盖暂存候选失败。
若 hook 作为仓库文件管理，按普通授权流程提交并同步后重试原命令。
`,
  rules: [
    {
      code: "pre-commit-hook-configured",
      description:
        'Git 根据有效配置（包括 core.hooksPath）解析到的 pre-commit 必须存在， 为有界 UTF-8 常规文件而非符号链接，非 Windows 平台还必须可执行。 文件必须使用 LF（Windows 上也接受规范化后的 CRLF），以下列四行及末尾换行开始： "#!/bin/sh"、"# BEGIN Silvermoon check-changes"、 "silvermoon check-changes --staged --audience agent || exit $?"、 "# END Silvermoon check-changes"。前缀后允许保留已有 shell 逻辑。 不执行或推测任意脚本、注释、条件分支、间接 wrapper 或 hook manager 的等价性；其他集成形式返回明确的配置缺口，不视作已经验证。 缺失、无效内容或不可执行是不通过；意外 I/O、取消和并发变更是执行错误。',
    },
  ],
  output: {
    description:
      "成功输出为 undefined；不安装、执行 hook 或记录跨执行就绪状态。",
  },
} as const satisfies CheckpointDocumentation;
