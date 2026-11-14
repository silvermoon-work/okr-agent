# 声明跨技术栈交付项并支持 Cloudflare 应用检查

## 问题

现有 TypeScript Check 缺少明确的交付意图和 Cloudflare 支持，不能仅靠 private 或配置文件存在判断发布目标。Silvermoon 需要向 Agent 提供跨技术栈的项目补充信息。

## 结果

以项目顶层独立 YAML 的 deliverables/path/type 登记所有对外交付项，包括应用与库，作为交付意图的唯一来源；通用 TypeScript 检查与 Cloudflare 专项按职责协作。

## 边界

- 一个 Cloudflare 应用交付单元对应一个 Workers 部署目标，可含静态资产、服务端代码和多个 DO 类；realtime 是能力，不是另一交付类型。
- 不新增 schemaVersion，不在 package.json 重复声明；原生配置继续负责实现，声明不授权实际发布。
- 保留只读检查和质量门禁，不通过忽略未知配置或执行目标代码取得通过。

## 验收标准

- npm、Cloudflare 及 Checker CAR/IPFS 等自定义交付意图明确，能区分声明缺失与配置冲突。
- 普通 TypeScript 项目不承担 Cloudflare 专项；Cloudflare 项目不豁免适用的通用质量要求。
- 既有发布映射、标准资产和消费者引用有一致的迁移路径。

## 下一步

逐项确认[设计中的阻塞决策](Decisions.md)，覆盖范围已确定，当前明确自定义交付类型及非交付目录与遗漏语义。
