# 固定 TypeScript 与 npm 项目标准交付初版

## Steps

### D-S01: 准备独立 CAR 消费

在不依赖作者源码的环境消费两个准确新 CAR，仅使用公开 Task 工具及显式授权的检查对象；若组合扩展依赖新版 SDK，先明确可用的精确依赖，发布另行授权。

### D-S02: 验证对象输入与组合

以独立 TypeScript/npm 项目验证顶层 projectDirectory 输入、通过、不通过、旧 context/projectScopes/requirements 拒绝和真实组合调用，核对父子具体问题、输出文档与资源回收。

### D-S03: 记录身份与迁移边界

记录新 CID、统一单目录输入、声明驱动范围及旧 context/projectScopes/requirements 的不兼容行为；不改写旧 CAR、历史验收或未经授权的外部引用。

## Acceptance criteria

### D-AC01: 独立消费可复现

实际结果证明没有作者源码或 workspace 隐含解析也能运行新 CAR。

### D-AC02: 标准与对象边界可观察

真实 Engine 证明单目录输入可用、旧包装及筛选/政策输入失败，父子直接传同一对象且范围不被缩减，文档可读且 Run 回收。

### D-AC03: 交付身份与范围真实

准确 CAR/CID 与迁移说明持久可用，不将本地验证声称为外部发布、pin 或未验证平台支持。
