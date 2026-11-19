# Silvermoon 环境前置

核验实际执行机的 Silvermoon 安装、个人 skill 和配置，不查询 registry 最新版。
本检查点的通过输出仅在本次执行内保存有效个人配置，不写入报告或历史。

## environment-runtime

运行入口必须属于当前 `@silvermoon-work/silvermoon` 安装的规范 bin，且 PATH
首个 silvermoon 命令指向它。允许全局链接的开发版本；不得静默替换其他安装。

## environment-skill

个人 `.agents/skills/silvermoon` 或 `.copilot/skills/silvermoon`
必须通过有效链接发现当前安装的 canonical skill，不接受旧副本或其他安装的链接。

## environment-configuration

个人配置允许缺省；存在时必须满足受支持协议和规范语言标签。
修复明确指出的字段后重新检查。配置、安装或链接修改必须有相应授权。
