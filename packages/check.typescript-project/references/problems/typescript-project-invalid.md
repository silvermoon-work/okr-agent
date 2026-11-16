# 不是合法的 TypeScript 技术栈项目

根目录必须提供可解析为 JSON 对象的普通文件 `package.json`，并存在
TypeScript 依赖声明、tsconfig 配置文件或 TS 源码中的至少一种明确依据。

查看问题说明中的路径和原因，补充或修正项目身份声明。只有身份成立后，
检查才会分流到 single repo 或 monorepo；缺少工具、scripts 或交付配置
不是本问题的判断依据。

本问题只负责身份与分流，不检查依赖版本、配置内容或成员归属。
monorepo 的 pnpm workspace 配置由后续独立检查负责。
