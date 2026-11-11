# 当前工具不属于 nvm 当前环境

brief 指明 node 或 npm。nvm 存在不代表当前工具受其管理；npm 必须独立确认，不能从 Node 的结论推断。这里确认当前环境而非历史安装过程。

由管理员使用正确的平台实现（Unix
nvm 或 nvm-windows）安装并选择所需 Node，修复实际入口/PATH 和 npm 指向。不要以系统安装绕过 nvm 要求；registry 切换不能修复管理关系。分别确认工具入口后在相同项目目录复验。
