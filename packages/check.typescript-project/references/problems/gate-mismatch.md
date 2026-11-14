# scripts 接口结构不满足

所有 package scripts 必须为
`node scripts/<同名>.mjs`，名称禁止冒号、命令不带参数。同一个 manifest 的结构问题合并为一条：brief 列出该 manifest 里每个不符的 script（观察值与应为的值）、可改名的冒号名，以及 scripts 顶层没有对应 script 或不是
`.mjs`
的文件，逐项修复即可。其余按 brief 的 manifest 路径、字段、观察值或 SHA256 修复固定入口/必要 lib 字节；共享模块放 scripts/lib/。不要求重复拓扑配置。build 与扩展内部自由，标准动作不可修改实现。静态机制合规不代表本次实际质量成绩或产物已经通过。
