# 无法确认测试配置

配置包含动态表达式、projects/workspace、未知参数、未收录的 import 等未支持形式。brief 会指出具体的字段名（如
`test.hookTimeout`）或 import；检查从不运行这些代码，无法确认不会伪装成通过或缺少配置。同一目录同时存在
`vitest.config.*` 与 `vite.config.*` 时，按 Vitest 的优先级只读取
`vitest.config.*`；同一档位出现多个文件才算有歧义。
