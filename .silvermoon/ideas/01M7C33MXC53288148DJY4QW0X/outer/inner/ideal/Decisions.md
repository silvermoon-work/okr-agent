# 交付项描述的设计决策

## B01: 唯一交付意图与遗漏语义

仓库根独立文件 `silvermoon.yaml` 的 `deliverables` 列表是对外交付意图的唯一来源；每项有 `path` 和 `type`。它跨技术栈，不要求所有交付项属于 Node workspace，不修改或替代 `.silvermoon/config.yaml` 生命周期配置，也不假定当前 Silvermoon CLI 已支持该文件。

登记所有对外交付项，包含应用和 npm 库；内部工具、示例、内部共享代码无需登记，不增加 `none` 类型。未登记不代表明确禁止交付，但不能被发布调度选中。明确发布入口、发布映射或 workflow 选择未登记目录时，报告交付声明缺失，不替它补声明。`private: false`、`wrangler` 文件、普通构建/包校验接口本身都不能证明交付意图；`private: true` 也不能证明没有其他交付方式。

无交付项目可以省略文件或声明空列表；有明确发布入口而缺文件/条目时不可据此通过。单独存在的配置不作为缺声明错误的依据。必填字段缺失归为缺失；重复、非法声明和已确认的配置矛盾归为不匹配；无法静态确认的发布选择或配置关系应明确无法确认，不推测通过。

## B02: 最小身份与路径

`path` 是仓库根相对、使用 `/` 分隔的明确现存目录；单包仓库可用 `.`。拒绝绝对路径、盘符、反斜杠、空段、`.`/`..` 子段、尾分隔符、glob、重复路径和同目录多类型。不得经符号链接逃出检查根，无法确认安全边界时不继续选择。

嵌套目录可以分别登记，但只选择各自目录，不递归继承交付意图；父项与子项不得导致同一交付包被重复选择。Node 消费者将登记目录与真实根包/工作区成员精确匹配；非 Node 自定义项不因此被冒充为 Node 包。一个 Cloudflare 应用 Package 代表一个 Workers 部署单元，不代表只能有一个环境；环境仍由平台原生配置管理。

不增加通用稳定 ID、namespace、环境清单或编排层，不在 `package.json` 复制交付意图；本轮无 `schemaVersion`，未来再为 YAML 提供 JSON Schema。

## B03: 开放类型与首期支持

`type` 满足 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`，例如 `npm`、`cloudflare`、`my-target`；不归一化非法名称。通用层不封闭类型枚举，也不要求不同类型拥有同一套附加字段。自定义类型的合法声明不等于任一消费者已支持其交付协议；消费者必须明确支持边界，既不回退 npm，也不执行声明中的命令。

首期只约定 `npm` 与 `cloudflare`。npm 可包含安装型应用与库，仍须通过适用的 npm 交付和发布保护；Cloudflare 项不承担 npm exports、npm 产物映射或 publint 要求。Cloudflare 应用可仅有静态资产，也可含服务端/API/SSR、多个 DO 类；realtime/WebSocket 不是独立类型，纯静态应用不强制写 Worker handler。

私有 Check 作者包可能通过 CAR/IPFS 对外交付，但本轮不设计 `ipfs`、`check-task` 或 `pinboard` 类型，不为它们创建发布处理器。实际迁移清单不得漏掉明确已知的此类交付意图，也不得把未设计协议伪装成已支持；如需登记，只使用使用方明确选定的自定义名称并说明协议未验证。

## B04: 第一阶段必须落实的调整

实际修改 TypeScript Check 的只读识别、npm 专项适用范围、标准资产、当前仓库消费副本及直接相关文档/测试；不只交付描述文档。所有适用代码和测试继续承担 strict TypeScript、type-aware lint、格式、单次测试、含未测试源码的覆盖率及项目明确的四项阈值。普通 TypeScript 与 Cloudflare 交付项保留通用质量门禁。

只调整交付识别所直接需要的职责传递；不在第一阶段引入通用多 tsconfig 图解释、Workers 测试运行器、bindings/DO 配置或部署检查。当前静态配置能力无法确认的形态继续明确无法确认，不因为声明 `cloudflare` 就豁免或宣称专项成功。[第二阶段](../../../../01M7C4F10CACDE64QM4JZCZPPB/outer/inner/ideal/Idea.md)再按实际底座确定专项设计；不预先批准独立包或组合接口。

## B05: 旧发布映射的单一来源迁移

现有 `scripts/lib/release-packages.mjs` 静态数组与受支持的旧 `release.config.json` 均不能与新清单长期并行决定发布目标。新版标准将 npm 交付项选择统一改为 `silvermoon.yaml`；npm 的既有标签身份迁入该条目专用的 `packageId` 字段，不增加通用 deliverable ID，真实 npm 名称始终读取对应 manifest。`packageId` 沿用已有包 ID 命名及唯一性规则，只服务既有 `<package-id>-v<version>` 标签，不从目录名重新猜测或改名。

例如现有 `check-task-sdk` 原样迁移为：

```yaml
deliverables:
  - path: packages/check-task-sdk
    type: npm
    packageId: check-task-sdk
```

`packageId` 不是 Cloudflare/自定义类型的共同要求。旧映射中的 `name` 必须先与真实 manifest 核对；迁移保留每个 npm 项的准确目录、包名和包 ID，冲突/缺失必须修正后再切换，不能静默丢项、重命名标签或改成按 `private` 推断。旧版本消费者保持其既有版本边界；新版不隐式兼容回退旧清单。新旧选择数据同时存在时报冲突；旧模块如保留路径兼容，只能是新清单的只读投影，不再保留独立目标数组；旧 profile 的重复目标字段移除。第一阶段必须同步新版固定发布器、Check 静态验证、调度、workflow 选择及本仓库消费副本，使之共同遵守唯一来源。

已有 `core`、`check-task-sdk`、`check-task-builder` 的 ID/name/path 映射必须保持。声明 npm 而 manifest 为 private 仍拒绝 npm 发布，不能因显式交付意图绕过保护。保留单包显式授权、准确版本/提交、main 祖先与准确 SHA CI 全矩阵/聚合门卫、不可变标签、RC 连续性、已存在版本/依赖检查、Trusted Publishing、单次 pack 后验证并发布同一 tarball 等既有保护。固定标准的本次演进只服务已批准的范围，不允许任意改写可信发布核心。

## B06: 阶段与证据边界

准备阶段仅形成契约与未勾选的下游种子；父代理负责 ideal/inner/outer 审批，提交准备就绪不等于接受，也不授权实现。构想接受后第一阶段必须实际实现并通过相关回归及根 `check`。

两个阶段的部署均仅验证本地候选、样例和本地产物的可追溯性，不要求 npm 发布、外部消费者或线上运行。不得发包、发版、推送发布标签、上传 IPFS/Pinboard、部署或迁移 Cloudflare 资源；普通生命周期提交与非强制同步 primary 不属于发布。静态检查器不执行目标仓库脚本、模块、配置或 hook；检查器自身受控测试和本仓库获准质量门禁不等同于执行被检查项目代码。

本次准备只读核对发现：`src/convention.ts`、`publisher-profile.ts`、`release-evidence.ts` 与 `assets/npm-publish.mjs` 仍依赖 `private`/manifest 特征及旧映射；`assets/commands.mjs` 的 publint 调度也依赖这些特征。迁移应同时覆盖作者标准和 `scripts/lib/` 消费副本，避免只换识别器却继续误选发布目标。这是可行性定位，不是实现完成证据。

准备验证（2026-11-14）：根 `pnpm check` 退出 0，现有格式、构建、类型、lint、覆盖率、13 项发布回归及包校验均通过；未修改实现或阈值。实际 Node 为 `26.13.0`，与 `.node-version` 的 `26.13.1` 不一致，pnpm 为固定的 `11.28.12`；该结果不冒充固定 Node 下的验证，未改共享机器全局配置。构建仅生成本地忽略产物，未发布或上传。
