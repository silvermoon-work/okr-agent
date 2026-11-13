# @silvermoon-work/check.typescript-project

检查 TypeScript 项目是否符合固定的长期维护约定，覆盖开发环境、工具依赖、代码检查配置、Agent 操作接口、工作流以及文档结构。支持单包和 pnpm
workspace，并对承担 npm ESM 发布职责的项目检查额外的交付配置。

本包保持 private，通过构建后的 `typescript-project.car` 交给 Task
Engine 执行。检查只读取目标项目，不运行其代码、配置模块、测试、安装或发布命令，也不会自动修改文件。

## 输入

提供执行机上的项目绝对目录：

```json
{ "projectDirectory": "D:\\Projects\\example" }
```

规则由 Check 固定，不接受 `context`、`requirements`、`projectScopes`
或其他额外字段。pnpm workspace 成员根据项目声明发现。

## 检查内容

- **环境**：默认 Node.js 版本、LTS 支持周期、成员运行时要求和 pnpm 版本。
- **工具依赖**：声明、catalog、lockfile 解析版本及 Node.js/peer 兼容性，以及所选版本系列的更新情况。
- **规范与交付**：TypeScript 严格配置、类型感知 lint、格式检查、单次测试、覆盖率门限和适用的 npm
  ESM 产物配置。
- **Agent 接口**：标准 scripts 的实际能力、工作区成员覆盖和根质量门禁连接，不仅检查脚本名称。
- **工作流**：GitHub
  CI 的触发、工具选择、冻结安装与检查顺序，以及适用的 npm 发布保护。
- **文档与结构**：工作区声明、必要文档、固定 Agent 约定和忽略规则。

根 `AGENTS.md`
与随 CAR 交付的[标准文档](assets/AGENTS.md)比较；项目自定义指导放在
`docs/agent-project.md`。README、CONTRIBUTING 与扩展文档仅检查存在、可读及非空，不评审关键词质量。

## 结果

结果包含 `pass` 和检查文档路径；不通过时，`problems`
列出问题码、说明及对应文档路径。问题区分明确缺失、不满足和无法确认，不把未知配置或网络失败当作通过。

前置问题会抑制依赖它的连带报告，其他成员和独立检查继续执行。检查结果中的文档及标准资产通过 Run
output 的 `references/` 和 `assets/` 读取，不依赖作者源码目录。

非法输入、意外 I/O 故障和取消属于执行故障，不会转换为正常的通过或不通过结果。

## 联网与支持边界

Check 查询官方 npm 发行元数据、Node.js 历史发行索引及官方生命周期文件，以确认版本与兼容性；不会读取或修改目标项目的 registry 设置。元数据查询使用固定来源和有界预算，无镜像、旧快照或其他来源回退。

配置检查采用有限静态解析，不执行目标项目。因此检查通过表示支持范围内的配置与连接已被证明，不代表项目实际构建、测试或覆盖率成绩已经通过；无法识别的动态配置会明确报告无法确认。

完整规则、支持语法、网络端点与预算见[检查参考](references/check.md)；npm 发布配置的支持范围见[单包 npm publisher v1](references/npm-publisher-v1.md)。
