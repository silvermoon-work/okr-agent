# 基于 Checker 重建 Silvermoon 人机共识与验收流程

## 问题

旧 Silvermoon 的阶段结束 sign off 增加人的检查负担，旧 Guide 架构与当前 Checker 体系脱节。需要让人专注于确认需求、方案及验收约定，让 Agent 自主实施、部署并举证。

## 结果

在本仓库重建 `@silvermoon-work/silvermoon`，以 Requirements、Technical、Test 三套 Spec 形成共识，通过 Checker、Events 和 Evidence 驱动实现及部署验收。详见[协作约定](collaboration.md)、[检查与存储](checker-and-artifacts.md)、[交付边界](delivery-and-open-questions.md)及[技术调研审阅稿](technical-review.md)。

## 边界

- Idea 内容留在 Git；新建于 `.silvermoon/i`，旧 `.silvermoon/ideas` 仅留档、不迁移或消费；取消世界嵌套术语与必备 ledger。
- 保留设备、项目及 primary 整备；修订须重新形成受影响的共识。
- 本 Idea 始终使用旧 Silvermoon 推进；新版本发布后再试用，不提前自举切换。

## 验收标准

- 三套 Spec 的逐轮协作与准确版本确认可追溯，旧确认不能替代新共识。
- 同一 `Check CID + Target` 可反复检查整备、共识和验收缺口，CLI 不维护第二套判断。
- 实现与部署由 Agent 按已确认 Test Spec 举证验收，无结果型人工 sign off。
