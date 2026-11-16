# Monorepo workspace 配置无效

Monorepo 必须在根目录提供普通文件 `pnpm-workspace.yaml`。文件必须是合法
YAML 对象，显式包含非空 `packages` 数组，且每项为非空白字符串。

根据问题中的路径和原因修正配置。例如：

```yaml
packages:
  - apps/*
  - packages/*
```

这里的目录仅是示例，不是固定布局要求。后续成员发现遵循 pnpm 的成员模式
语义；当前版本尚未检查模式匹配结果、成员 manifest 或名称冲突。
根 `package.json` 的 `workspaces` 可用于识别 monorepo，但不能替代 pnpm 配置。
