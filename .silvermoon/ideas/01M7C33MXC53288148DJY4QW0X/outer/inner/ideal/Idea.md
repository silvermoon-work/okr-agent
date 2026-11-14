# 按显式交付项调整 TypeScript 项目检查

## 问题

现有 TypeScript Check 缺少明确的交付意图，不能仅靠 private 或配置文件存在判断发布目标。Silvermoon 需要向 Agent 提供跨技术栈的项目补充信息。

## 结果

以项目顶层独立 YAML 的 deliverables/path/type 登记所有对外交付项，包括应用与库，并实际调整 TypeScript Check 及直接相关标准，使通用质量与 npm 交付检查按职责生效。

## 边界

- 本 Idea 是第一阶段，包含 TypeScript Check 的实现调整及必要迁移；[第二阶段](../../../../01M7C4F10CACDE64QM4JZCZPPB/outer/inner/ideal/Idea.md)承接 Cloudflare 专项，不在本阶段实现其部署、bindings 或 DO 检查。
- 不新增 schemaVersion，不在 package.json 重复声明；type 可自定义，仅施加命名约束，具体要求按需约定。本轮只约定 npm、cloudflare，IPFS 暂缓；声明不授权实际发布。
- 保留只读检查和质量门禁，不通过忽略未知配置或执行目标代码取得通过。

## 验收标准

- TypeScript Check 实际读取交付描述并区分声明缺失与配置冲突；通用描述不将 type 封闭为 npm/cloudflare。
- 普通 TypeScript 项目不承担 Cloudflare 专项；Cloudflare 交付意图不被误判为 npm 交付，也不豁免适用的通用质量要求；不声称已验证 Cloudflare 专项。
- 既有发布映射、标准资产和消费者引用有一致的迁移路径。

具体范围、缺失语义与安全迁移见[设计决策](Decisions.md)。本阶段只进行本地交付验证，不发布或上传制品、不操作 Cloudflare 资源。
