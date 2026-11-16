# 类型检查证据缺失

成员缺少 TypeScript 依赖或独立 tsconfig.json 配置。请为源码和测试建立可静态确认的类型配置；固定 typecheck/必要 lib 使用 noEmit，准确内容和拓扑由 gate 领域检查。不以最近编译通过替代静态配置，也不运行目标代码补证。
