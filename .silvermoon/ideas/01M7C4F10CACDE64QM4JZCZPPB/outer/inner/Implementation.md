# Implementation

## Steps

### I-S01: 确认通用底座接口

以第一阶段已接受实现为基线，在现有 Check 内仅为显式 cloudflare 项接入[有限平台 profile](ideal/Scope.md)，复用文件/声明/项目和诊断机制；不新建包或子 Task 协议。实施前核对 Wrangler、当前 Workers Vitest 插件和 Istanbul 的稳定版本及 Node/peer 兼容，不在准备阶段安装或升级。

### I-S02: 实现平台能力检查

实现静态 Wrangler JSON/JSONC、按能力适用的资产/模块入口/本地 DO 与声明关系检查；为 Cloudflare 成员增加必要的字面量 cloudflareTest 配置及 Istanbul 适配，继续应用通用 strict/lint/coverage 门禁。一个应用 Package 对应一个部署单元，资产/服务端/多个 DO 均可选；不执行目标配置、模块、脚本、生成器或迁移，未知形态准确无法确认。

### I-S03: 验证并交付标准

增加纯资产、显式 API/SSR 入口、多个本地 DO 和不支持形态的受控正反例，覆盖配置/类型/测试职责与失败诊断；同步单一 CAR 的问题文档、标准资产及必要消费副本，运行相关测试和根 check，不发布或上传。

## Acceptance criteria

### I-AC01: 复用边界一致

通过普通 TypeScript、npm/custom 与 cloudflare 交付项回归证明根清单唯一、平台只作用于显式目标，通用质量及 npm 发布保护保留；原输入保持闭合，不增加绕过开关或重复配置。

### I-AC02: 能力检查准确

用纯资产不含 main/binding/plugin、显式服务端入口、同 Worker 多本地 DO 的正例及路径/导出/迁移/声明/Workers coverage 冲突反例验证支持矩阵；证明未知环境/动态配置/远端类不误判通过，配置证据不冒充运行。

### I-AC03: 制品和门禁可验证

通过适用构建、相关测试及根 check 验证新增平台域、可读修复文档与单一 CAR/标准资产一致，源/测试严格检查及四项覆盖率门禁实际保留；记录准确版本/兼容事实和无法取得的证据，不宣称外部消费或线上运行已验证。
