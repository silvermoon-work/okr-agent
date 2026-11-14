# 交付项描述的设计决策

## 已确定的方向

- Silvermoon 是跨技术栈、面向 Agent 的项目补充描述层，不绑定 Node workspace。
- 项目顶层独立 YAML 声明交付意图，不在 package.json 增加品牌字段。
- 列表字段为 deliverables，每项使用 path 和 type。type 可自定义，通用层只约束命名，不预设各类型必须具有的附加字段；具体要求按需约定。本轮仅约定 npm、cloudflare，IPFS 交付设计暂缓。
- 暂不引入 schemaVersion；结构稳定后考虑 YAML 的 JSON Schema。
- 应用目录可同时容纳 npm 安装型应用和 Cloudflare 线上应用。共享库仍可通过 npm 交付。
- deliverables 必须登记所有对外交付项，不局限于 apps；packages 中对外发布的库也必须登记。
- 私有 Checker 作者包也可以对外交付：构建 CAR，通过 IPFS 并可借助 Pinboard 分发。此类自定义交付项同样需要登记；private: true 不是“不交付”的证据。
- 一个 Cloudflare 应用 Package 对应一个 Workers 部署目标，可含静态资产、API/SSR 和多个 DO 类。共享代码不因被应用使用而成为部署项。
- WebSocket/realtime 是可选能力，不是独立的交付类型。纯静态应用不强制编写 Worker 请求处理代码。
- 描述文件是交付意图的唯一来源；生态配置是实现事实，检查验证一致性，不隐式授权发布。
- 工作拆成两个阶段、两个 Idea：本 Idea 先实际调整 TypeScript Check 及相关标准；第二阶段 cloudflare-project-check 再实现 Cloudflare 专项。当前仍为准备阶段，不据此跳过构想验收。

下例仅展示字段方向，不是已安装配置；文件名称尚未确定：

```yaml
deliverables:
  - path: apps/cli
    type: npm
  - path: apps/web
    type: cloudflare
  - path: packages/sdk
    type: npm
```

## B01: 声明覆盖范围和遗漏语义

这决定 Check 与发布调度究竟把哪些目录视为交付项。

已确认：登记所有对外交付项，包括 apps 中的应用和 packages 中的 npm 库，不仅限于应用。

尚待确认：内部工具、示例或纯内部共享代码是否无需登记，以及是否不添加 type: none。

未登记目录不能被发布调度选中，但不能仅因遗漏就证明其已被明确禁止发布。若目录存在明确发布入口或被 workflow 选择却未登记，应报告未声明交付意图；private 或平台配置文件本身不足以证明发布意图。

需要确认：非交付目录可不登记，还是需要显式标记不交付？不能同时把遗漏解释为“不交付”和“声明缺失”。上述发布调度和缺失报告策略仍是建议，不因覆盖范围已确认而自动生效。

## B02: 首期身份、路径和环境边界

这决定仅凭 path/type 能否唯一定位一次交付。

建议首期每项 path 是仓库根相对的明确目录，不使用 glob；禁止重复和同一目录声明多个交付类型。一个应用对应一个部署单元，不表示只有一个开发/预览/生产环境；环境仍由平台原生配置描述。

使用单包仓库时是否接受 path: .，以及是否允许目录嵌套，需纳入明确的路径规则。文件名称建议 silvermoon.yaml；它不替代或迁移现有 .silvermoon/config.yaml 生命周期配置。与现有 CLI 的接入是后续明确变更，不假定 CLI 已支持新文件。

需要确认：首期保持 path/type 最小模型，不加入稳定 ID、多目标或环境声明；确有标签身份或编排需求时再扩展。

## B04: 类型命名规则

已确认：type 不是封闭枚举，可由使用方自定义。通用描述层不强制每种类型具有某套交付契约或附加字段，具体规则按需约定；本轮只保留 npm、cloudflare 的约定。

IPFS 交付目标可能有多种，尚未仔细设计，本轮不定义 ipfs、check-task 或 pinboard 类型，也不实现相应发布处理。Checker 的例子保留为扩展背景，不作为当前必须实现的验收项。

仍需确定命名规则。建议使用小写 ASCII 字母开头，后续允许小写字母、数字和单个连字符分段，例如 npm、cloudflare、my-target；不引入 namespace 或固定名称清单。此规则尚待确认，不自动改变或归一化用户提供的类型名称。

自定义名称不等于某个 Check 或发布工具已支持该类型，也不授权执行任意命令或发布操作；具体消费者的支持边界应明确说明，不把未知类型错误地解释为 npm 或 Cloudflare。

## B03: 已确认的阶段范围与待细化迁移

这决定声明能否真正成为唯一来源，而不是另一份长期并存的清单。

当前 TypeScript Check 固定资产和 npm publisher 使用既有发布映射与固定质量 CI；通用底座还有多 tsconfig、Workers 测试配置和执行职责的支持边界。新描述文件本身不会解决这些问题。

建议先定义新的交付描述契约及职责边界，再同步迁移 Check 作者标准、固定发布实现和消费者；过渡期必须明确版本边界和冲突处理。不得直接改写受保护的固定核心或让新字段覆盖旧发布保护。

已确认：本 Idea 不只交付设计文档，包含 TypeScript Check 的实际调整及直接相关标准演进、必要迁移。Cloudflare 专项由[第二阶段 Idea](../../../../01M7C4F10CACDE64QM4JZCZPPB/outer/inner/ideal/Idea.md)承接。

仍需细化：旧描述的迁移方式、通用多配置能力在第一阶段的必要范围，以及固定标准升级的准确边界。是否最终独立建立 Cloudflare Check 仍是实现方案选择，不因阶段拆分而自动批准特定包结构。
