# 检查 TypeScript 项目的基础实践配置

## 问题

TypeScript 项目的基础实践涵盖类型检查、lint、格式、测试、覆盖率及 CI 配置，不能缩减为 tsconfig 检查，也不能与宿主工具链或当前检查成绩混淆。调用方需要可省略、可定制但无歧义的要求描述。

## 结果

为 `check.typescript-project`
交付可配置、具有默认基线与纯归一化入口的项目配置 Check，构建 CAR 发布到 Pinboard，再下载并经真实 Engine 检查本项目。具体要求见
[Requirements.md](./Requirements.md)。

本 Idea 是
[Preset 标准与 Check 组合讨论](../../../../01M75P5ZEP8DSHX6N7QBPJPVJX/outer/inner/ideal/Idea.md)的子议题，以文档关联表达，不新增生命周期字段。

## 边界

1. 面向指定项目目录的基础实践配置，不探测系统安装，不执行项目配置代码、lint、类型检查、测试、构建或 CI。
2. 包含输入契约、normalize、静态配置检测、问题文档与真实 CAR 交付，不建设父子检查组合协议，不发布 npm。
3. 用户授权主 Agent 决定细节并代理全部门禁；采用明确的静态支持边界，无法确认不猜测通过，不修改被检项目以制造通过。

## 验收标准

1. 以配置正反例证明类型检查、lint、格式、测试、覆盖率、门禁及 CI 的配置目标，不运行被检项目代码或检查宿主安装。
2. 任意输入产生明确错误或完整一致的 requirements，默认、局部定制、关闭及跨域冲突均有测试。
3. 准确 CAR 发布到 Pinboard 并重新下载，在当前设备或 office
   ubuntu 经真实 Engine 检查本项目，证明结果、文档及限制。
