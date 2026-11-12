# TypeScript Project Check

私有 CAR 作者包
`@silvermoon-work/check.typescript-project`，不发布 npm。只读取目标工程配置，不执行、导入或求值目标代码，不探测宿主工具。

```json
{
  "context": { "projectDirectory": "D:\\Projects\\example" },
  "requirements": {
    "testing": { "coverage": { "minimum": { "branches": 80 } } }
  }
}
```

完整输入、默认、支持语法和限制见 [检查参考](references/check.md)。
`src/requirements.ts` 导出纯函数 `normalizeRequirements(unknown)`；非法输入返回
`{ ok:false, error:{path,reason} }`，Check 将非法输入作为执行错误。

```powershell
pnpm --filter @silvermoon-work/check.typescript-project test
pnpm --filter @silvermoon-work/check.typescript-project typecheck
pnpm --filter @silvermoon-work/check.typescript-project lint
pnpm --filter @silvermoon-work/check.typescript-project build
```

构建使用 `check-task-builder`，产物为
`dist\typescript-project.car`。真实 CAR 测试使用标准 Builder、Engine 导入，分别验证通过、不通过和可读取的中文问题文档；不执行 fixture 的类型检查或测试。
