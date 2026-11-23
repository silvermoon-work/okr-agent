# Silvermoon Events：统一 Checkpoint 共识模型

## 1. 设计与实现边界

本文是最新目标设计，与
[Idea Check 设计 Spec](./silvermoon-idea-check-design.yaml)
配套，不代表当前运行时或 CAR 已实现。
[原候选](./silvermoon-idea-check-candidate.yaml)仅作设计历史保留。

目标流程分成两个层次：

1. **标准化**：每次观察先检查设备、项目和 Idea 的标准化前提。
   非标准状态先修复，再重新观察；不能绕过标准或修改标准来宣称通过。
2. **Checkpoint 推进**：每个推进 checkpoint 都统一使用
   **Agent submit → 接受方 accept**，随后确认材料与事件同步到 primary。

implementation、deployment 不再用独立 `verify` 事件绕过统一范式。
接受方由项目配置决定：consensus 要求用户明确同意；delegated 允许 Agent
完成验收后自行接受。**Delegation 改变接受权限，不跳过验收或 accept 事件。**

当前源码仍使用事件 `id`、`version: 1`、`signOff.submit`、
`verify.phase/rev`、本阶段材料 SHA-256 摘要和 bootstrap 的固定 `checkCid`。
它已经有配对提交、最终用户验收和固定部署报告，但尚未实现本文的
`accept`、authority、Git tree/blob revision、delegation 配置或 eventSchemaCid。
本文示例不可写进当前日志；不改写历史事件、固定绑定或 CAR。

## 2. 两个层次的边界

### 2.1 标准化前提

前置检查包括运行安装、个人 skill、Git 根/分支/洁净性、primary 配置与同步、
安全数据容器，以及选中 Idea 的 Schema、布局、事件和报告历史合法性。

- 标准化关口不是待用户接受的交付物，不为它们写 submit/accept。
- 无 upstream、脏工作区、损坏文件或事件结构不合法时，先解决对应问题。
- 合法材料改变但与旧提交版本不一致，是正常的推进状态退化，不是数据损坏。
- 两者均通过“修复或更新 → 重新 measure”恢复，Check 本身不自动安装、
  提交、推送、部署或删除内容。

### 2.2 推进关口和默认权限

保留现有有序关口与事件对象映射：

| Checkpoint ID     | Event `object`    | 直接前置 checkpoint | 默认模式      |
| ----------------- | ----------------- | ------------------- | ------------- |
| `requirements`    | `requirements`    | 无                  | consensus     |
| `research`        | `research`        | `requirements`      | consensus     |
| `technical`       | `technical`       | `research`          | consensus     |
| `test-index`      | `cases`           | `technical`         | consensus     |
| `test-cases`      | `tests`           | `test-index`        | **delegated** |
| `implementation`  | `implementation`  | `test-cases`        | **delegated** |
| `deployment`      | `deployment`      | `implementation`    | consensus     |
| `user-acceptance` | `user-acceptance` | `deployment`        | consensus     |

`tests` 是测试用例正文/测试说明，默认 delegated；`cases` 是用例索引，
仍默认 consensus。每关只保存直接前置版本，不保存所有祖先闭包。
祖先关系通过固定链和递归 Git tree 自然绑定。

### 2.3 项目级模式配置（候选）

在现有项目配置中增加可选 `checkpointAcceptance`，键使用 Checkpoint ID：

```yaml
checkpointAcceptance:
  test-cases: delegated
  implementation: delegated
```

- 每个未配置的推进关口使用上表默认值；缺整个字段也采用上述默认值。
- 值只允许 `consensus` 或 `delegated`，未知 ID/值明确报错，不静默回退。
- 只允许配置推进关口，不将标准化前提变成可委托的接受步骤。
- 配置生效以本次已验证、已同步的项目配置为准；改变它是项目政策变更，
  不是 Agent 在等待用户时自行修改的捷径。
- delegation 不授权生产操作、发布、付费或数据删除。

accept 记录 `authority`：

| 当前模式  | 可认可的接受来源     |
| --------- | -------------------- |
| consensus | 仅 `user`            |
| delegated | `user` 或 `delegate` |

`user` 表示真实用户明确接受；`delegate` 表示 Agent 在有效委托下完成验收并接受。
字段是事实记录，不是身份认证。配置由 delegated 收紧为 consensus 后，
旧 delegate accept 不再通过该关口，须取得用户对当前准确版本的接受；
历史行保留，不能把 authority 改成 user。放宽配置也不自动产生 accept。

## 3. Revision：使用 Git 对象，不用事件身份

### 3.1 三种身份

| 名称                       | 用途                                                     |
| -------------------------- | -------------------------------------------------------- |
| Git commit SHA             | 定位材料来源快照或真实受测提交，不作为所有内容的统一版本 |
| Git blob/tree 对象 ID      | 本设计的准确验收内容及直接前置版本                       |
| eventSchemaCid / Check CID | 分别标识事件数据结构与实际执行程序，不是验收内容版本     |

事件使用完整、小写的 Git 对象 ID（SHA-1 为 40 位，SHA-256 为 64 位），
不使用缩写，不加 `sha256:` 前缀。对象必须存在、类型正确且可验证；
仅正则匹配不证明它是有效 Git 对象。

### 3.2 每关的材料范围

| `object`        | 当前验收材料                                                     |
| --------------- | ---------------------------------------------------------------- |
| requirements    | Idea 内 `requirements/` 的全部材料                               |
| research        | Idea 内 `technical/research.md`                                  |
| technical       | Idea 内 `technical/`，排除 `research.md`                         |
| cases           | Idea 内 `tests/cases.json`                                       |
| tests           | Idea 内 `tests/`，排除 `cases.json`                              |
| implementation  | 项目受跟踪交付快照，排除本 Idea 的 `events.jsonl` 和 `evidence/` |
| deployment      | 固定 `evidence/deployment/report.jsonl` 及该关要求的证据附件     |
| user-acceptance | 当前交付的直接前置 deployment revision；有独立体验材料时也纳入   |

前五关和证据材料以 Idea 根为相对路径基准，implementation 以仓库根为基准。
文件路径、Git mode 与原始内容都参与版本；空必需材料、链接、越界或未纳入
候选快照的材料不能冒充有效对象。实现范围包含代码、测试、锁文件、配置和
本 Idea 当前标准文件；不能排除这些文件来掩盖变更。
用户体验材料若有新增/修改必须纳入固定的 `acceptance/` 范围，不能只展示
范围外材料后声称用户已接受完整版本；尚无该目录可用空材料树。

### 3.3 统一版本树

仅记录裸本阶段 blob，无法检测“正文没变但前置已变”。因此每关使用相同结构的
**Git tree revision**：

```text
checkpoint revision (Git tree)
  material/   本关材料的 Git tree，保留范围内路径、mode 和 blob
  upstream/   直接前置 checkpoint 的 revision tree；根 requirements 无此项
```

- 每条 submit.revision 指向上面的完整 tree；材料中的具体文件仍是 Git blob。
- submit.upstream 为直接前置的完整 tree ID；requirements 为 `null`。
- 非根版本树的 upstream entry 必须等于 submit.upstream，不能另外绑定一套祖先。
- 不额外计算自定义 SHA-256，也不把事件、时间或 submit 次数塞进版本树。
- 使用 Git 的对象格式、tree 排序及对象哈希，不用任意 JSON 序列化仿造 Git ID。
- 相同材料、mode 和直接前置对象产生相同 revision。
  祖先材料变化沿树引用传播，即使本关文件没变也会产生新的 revision。
- commit 仅变化于排除的事件/证据时，相关材料树不变，不要求所有关口重签。
  当前范围内的任何文件变化仍使对应 revision 退化。
- 版本树和全部引用对象必须可从已同步的交付材料复原或取得；
  本地存在但其他 checkout 无法取得的 dangling 对象不能算已同步。
  后续实现须解决确定性的对象构造与跨 checkout 获取，不以 `git push` 自动
  携带不可达 tree 为假设。本轮不执行或接入对象写入。

用户验收同样使用版本树：它的 upstream 是 deployment 的完整 revision，
不再使用部署报告 SHA-256 或 tests revision 作为替代。

## 4. 事件通用定义

目标模型有七种 `type`：
`created`、`submit`、`accept`、`setAlias`、`setLanguage`、`abandon`、`resume`。
不再新增目标 `signOff` 或 `verify` 分支；它们仅在当前/历史协议中保留原语义。

每条事件的通用字段：

| 字段   | 必需 | 定义                                             |
| ------ | ---- | ------------------------------------------------ |
| `at`   | 是   | 规范 UTC ISO 时间，如 `2026-11-23T05:00:00.000Z` |
| `type` | 是   | 七种目标事件之一                                 |

没有事件 `id`、`version` 或 `$schema`。事件文件位于当前 Idea 的 `events.jsonl`：

- UTF-8、LF、一行一个完整 JSON，末尾换行；按行顺序回放，不按 at 重排。
- 新行递归按 ASCII 键序规范序列化；不改写、删除或重排历史字节。
- at 不是唯一键；重复提交按内容与依赖归并，不需要事件 ID。
- 日志上限仍为 1 MiB/4096 条，Idea 总容量仍为 16 MiB。
- Schema 拒绝未知字段；未知结构、不可用对象或并发变化明确报告。

以下示例展开以便阅读，`<...>` 是真实观察值的占位符，不是可直接写入的日志。
所有 revision/upstream 必须替换为完整 Git tree ID。

## 5. `created`：创建身份和结构契约

```json
{
  "at": "2026-11-23T05:00:00.000Z",
  "type": "created",
  "idea": "202611230500abcd",
  "eventSchemaCid": "<fixed-events-schema-cid>",
  "language": "zh-CN"
}
```

`idea`、`eventSchemaCid` 必填，language 可选且为规范 BCP 47 标签。
created 是第一条且唯一，idea/at/eventSchemaCid 分别匹配 bootstrap 的
id/createdAt/eventSchemaCid。创建不是接受任何 checkpoint。
固定 Schema CID 约束整份事件日志，Checker 的执行 CID 在报告中另记。
历史 bootstrap.checkCid 不能直接重命名成 eventSchemaCid。

## 6. `submit`：Agent 提交准确验收内容

```json
{
  "at": "2026-11-23T05:10:00.000Z",
  "type": "submit",
  "object": "requirements",
  "revision": "<requirements-tree-id>",
  "upstream": null
}
```

```json
{
  "at": "2026-11-23T05:20:00.000Z",
  "type": "submit",
  "object": "implementation",
  "revision": "<implementation-tree-id>",
  "upstream": "<tests-tree-id>"
}
```

业务字段仅有必需的 object、revision、upstream。非根提交要求直接前置已被有效
accept 且同步。验收内容、revision 和前置版本准确之后才提交。
submit 不是接受，也不表示测试已通过；delegated 关口也必须先 submit。

相同 object/revision/upstream 的重复 submit 幂等归并，不清除已有有效接受。
状态展示取最后追加的时间，但当前候选仍取最后提交的版本，不能让旧版本覆盖
后来不同版本。归并不删除历史，也不跳过实际复测或新的部署轮次。

## 7. `accept`：接受已提交的准确内容

### 7.1 Consensus：用户明确同意

```json
{
  "at": "2026-11-23T05:15:00.000Z",
  "type": "accept",
  "object": "requirements",
  "revision": "<requirements-tree-id>",
  "authority": "user"
}
```

Agent 展示准确材料和版本，取得真实用户 approval/acceptance 后才记录。
评论、沉默、Agent 演示或自验不是用户接受。未同意就等待或修改重新 submit。

### 7.2 Delegated：Agent 完成验收后接受

```json
{
  "at": "2026-11-23T05:25:00.000Z",
  "type": "accept",
  "object": "implementation",
  "revision": "<implementation-tree-id>",
  "authority": "delegate"
}
```

仅在该关有效模式为 delegated、Agent 按标准检查且认为无问题时记录。
实现须实际运行全部所需自动化测试并通过，不能仅“可重现”就接受。
失败、错误、阻塞或未执行时不写 accept，不拿旧接受掩盖本次失败。
delegated 也允许用户亲自接受，记录 authority=user。

accept 的业务字段是 object、revision、authority，不存 submit ID、upstream
闭包、结果数组或报告正文。必须已有同对象、同版本 submit，且当前材料与直接前置
均准确。孤立、前向、迟到的不同版本接受无效。
相同对象/版本/来源的接受幂等；来源不同不能合并成虚构的用户决定。
accept 和 submit 的版本一致不等于已同步，所有关口都须检查 primary。

## 8. 实现、部署与用户验收统一推进

### 8.1 实现（默认 delegated）

完成实现与自动化测试材料 → measure 当前 Git tree → submit(implementation,
upstream=tests) → 真实运行全部测试 → accept(implementation, authority=delegate)
→ 同步 → 重新 measure。

保存测试代码、锁文件与运行入口，不强制复制测试输出或另存实现报告。
真实受测 commit 用于定位运行快照，接受绑定验收范围的 tree。
Check 校验对象和接受事实，不自动执行项目代码，也不能从事件证明测试真实发生。

### 8.2 部署（默认 consensus）

实现通过且同步 → 按已有授权部署 → Agent 实际操作、自验并记录材料 →
submit(deployment, upstream=implementation) → 展示报告及准确交付 →
用户明确接受 → accept(deployment, authority=user) → 同步。

固定 `evidence/deployment/report.jsonl` 仍是 append-only 手工验收材料，
不是一个独立事件通道。report start 的 implementation 在目标设计中
改为当前 implementation checkpoint 的 Git tree revision，而非受测 commit：

```jsonl
{"version":1,"type":"start","implementation":"<implementation-tree-id>"}
{"type":"case","case":"D-01","steps":"实际操作交付入口。","expected":"进入主页。","actual":"进入主页且功能符合预期。","result":"pass"}
```

start 可带非空 context；case 的 steps/expected/actual 必须非空，
result 为 pass/fail/error/blocked/not-run。所有旧行保留，新轮先追加 start，
本轮按 case 取最后尝试，恰好覆盖全部部署用例且全部 pass 才能接受。
必要附件也属于部署材料范围。仅命令退出成功不代表部署验收通过。

追加报告改变 deployment 的 material blob/tree，自然使旧 submit/accept 失效，
不用 verify 或额外报告哈希事件。新轮即使实现内容相同也重新覆盖全部用例。
报告仍限制 1 MiB/4096 行，每轮最多 512 个不同用例。
历史报告 start 的 commit 绑定不能静默改写为 tree；
此含义变更须在后续协议接入时明确兼容/迁移，不按相同长度猜对象类型。

项目若授权 deployment 为 delegated，同样先 submit，Agent 完成验收后可
accept(delegate)；不会取消后续用户体验验收关口。

### 8.3 用户体验验收（默认 consensus）

部署已接受且同步 → submit(user-acceptance, upstream=deployment) →
用户实际操作并反馈 → 明确接受 → accept(user) → 最终同步。

```json
{
  "at": "2026-11-23T06:00:00.000Z",
  "type": "submit",
  "object": "user-acceptance",
  "revision": "<user-acceptance-tree-id>",
  "upstream": "<deployment-tree-id>"
}
```

```json
{
  "at": "2026-11-23T06:10:00.000Z",
  "type": "accept",
  "object": "user-acceptance",
  "revision": "<user-acceptance-tree-id>",
  "authority": "user"
}
```

部署共识审阅交付和自验材料，最终验收确认实际使用体验；默认两者都需用户同意，
但不是一条接受事件跨两关通用。反馈放相关材料，不内嵌验收事件。
项目可明确配置模式，默认不得以 Agent 自验代替用户。

## 9. 每次 measure 与自然退化

按标准化前提、推进关口顺序，逐个计算当前 revision 并检查：

1. 直接前置是否已接受、同步、版本仍有效？
2. 最后候选 submit 的 revision/upstream 是否等于当前对象及直接前置对象？
3. 是否有匹配该对象版本、来源被当前模式认可的 accept？
4. 当前验收条件是否仍满足，材料及有效事件是否已同步 primary？

首个不满足关口是 Agent 当前工作位置：

| 观察                             | 当前动作                                        |
| -------------------------------- | ----------------------------------------------- |
| 标准化失败                       | 修复对应前提，再 measure                        |
| 没有 submit，或版本/前置不匹配   | 修改或准备准确材料，重新 submit                 |
| 有有效 submit，没有可认可 accept | consensus 等待用户；delegated 完成验收再 accept |
| 已接受但未同步                   | 同步准确材料和事件，再 measure                  |
| 全部关口有效并同步               | completed                                       |

**例：需求改变，技术方案正文未改。** requirements material 变化，
requirements revision 变化；research、technical 等的 upstream tree 递归变化。
旧接受留在日志里，但不匹配当前版本，先回 requirements 重新提交和接受，
再逐关推进，不显式写 rollback/reset。

**例：只追加 implementation 的 accept。** events 不在实现材料范围，
implementation revision 不变，不因记录接受而触发重新实现验收。

**例：delegation 收紧。**
revision 未变但旧 authority=delegate 已不满足 consensus，
该关退化到等待用户接受，不要求伪造文件变更或删除旧 accept。

回到完全相同的材料和依赖版本，可复用该版本已有且来源仍有效的内容接受；
仍需 measure 当前实际验收和同步条件，不能据此跳过已知复测失败或新的部署轮次。
无显式 rollback、completed 或 synchronized 事件。

## 10. 元数据与终止事件

### setAlias

```json
{ "at": "2026-11-23T05:01:00.000Z", "type": "setAlias", "alias": "login-flow" }
```

alias 必填，小写字母开头、总长不超过 64，后续只允许小写字母、数字和连字符；
null 表示清除，以最后设置为准，不使用空字符串。

### setLanguage

```json
{ "at": "2026-11-23T05:02:00.000Z", "type": "setLanguage", "language": "zh-CN" }
```

language 必填，为规范 BCP 47 标签或 null。null 清除 Idea 覆盖，
恢复项目 → 用户 → en-US 的回退；修改配置不自动翻译或接受文件。

### abandon / resume

```json
{
  "at": "2026-11-23T07:00:00.000Z",
  "type": "abandon",
  "reason": "目标需求取消，停止推进。"
}
```

```json
{ "at": "2026-11-23T08:00:00.000Z", "type": "resume" }
```

abandon.reason 必填、非空、简短；详细原因写材料。resume 无其他字段。
两者需明确决定，放弃后只能先 resume 再继续其他事实，不能重复放弃或无放弃恢复。
保留事件和材料；恢复后从重新 measure 得到的状态继续，不强行完成或重置全部关口。

## 11. Events Schema 与执行身份

保留前轮已讨论的 eventSchemaCid 边界，但 Schema 的目标分支改为本文七类事件。
Schema 只定义字段形态；checkpoint 顺序、Git 对象类型/范围、delegation
权限、真实用户决定、状态退化和同步规则由 Check 执行，不由 Schema 假装证明。

固定的、自包含 Draft 2020-12 Schema 使用 RFC 8785/JCS → UTF-8 → SHA-256 →
CIDv1(raw 0x55, sha2-256 0x12)，小写无填充 base32。
块存 canonical bytes，无 BOM 或末尾换行。JCS 的字符串、数值和 UTF-16 键排序
约束不能用普通 JSON.stringify 或任意键排序替代。
内部 $ref 仅指向 $defs，不隐式联网取远程依赖；校验环境明确支持 date-time 断言。
Schema CID 不放进自己的定义形成循环，bootstrap/created 在定义之外绑定一次。
Checker 的实际 CID 单独记录；固定 Schema 不等于固定完整生命周期业务规则。

### 单行事件 Schema（目标设计，未接入运行时）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:silvermoon:events",
  "type": "object",
  "properties": {
    "at": { "$ref": "#/$defs/timestamp" }
  },
  "required": ["at", "type"],
  "oneOf": [
    {
      "properties": {
        "type": { "const": "created" },
        "idea": { "type": "string", "pattern": "^[0-9]{12}[a-f0-9]{4}$" },
        "eventSchemaCid": { "type": "string", "pattern": "^b[a-z2-7]+$" },
        "language": { "$ref": "#/$defs/nonempty" }
      },
      "required": ["idea", "eventSchemaCid"]
    },
    {
      "properties": {
        "type": { "const": "submit" },
        "object": { "$ref": "#/$defs/object" },
        "revision": { "$ref": "#/$defs/gitObject" },
        "upstream": {
          "oneOf": [{ "type": "null" }, { "$ref": "#/$defs/gitObject" }]
        }
      },
      "required": ["object", "revision", "upstream"],
      "if": {
        "properties": { "object": { "const": "requirements" } },
        "required": ["object"]
      },
      "then": { "properties": { "upstream": { "type": "null" } } },
      "else": { "properties": { "upstream": { "$ref": "#/$defs/gitObject" } } }
    },
    {
      "properties": {
        "type": { "const": "accept" },
        "object": { "$ref": "#/$defs/object" },
        "revision": { "$ref": "#/$defs/gitObject" },
        "authority": { "enum": ["user", "delegate"] }
      },
      "required": ["object", "revision", "authority"]
    },
    {
      "properties": {
        "type": { "const": "setAlias" },
        "alias": {
          "oneOf": [
            { "type": "null" },
            {
              "type": "string",
              "maxLength": 64,
              "pattern": "^[a-z][a-z0-9-]*$"
            }
          ]
        }
      },
      "required": ["alias"]
    },
    {
      "properties": {
        "type": { "const": "setLanguage" },
        "language": {
          "oneOf": [{ "type": "null" }, { "$ref": "#/$defs/nonempty" }]
        }
      },
      "required": ["language"]
    },
    {
      "properties": {
        "type": { "const": "abandon" },
        "reason": { "$ref": "#/$defs/nonempty" }
      },
      "required": ["reason"]
    },
    { "properties": { "type": { "const": "resume" } } }
  ],
  "unevaluatedProperties": false,
  "$defs": {
    "nonempty": { "type": "string", "minLength": 1, "pattern": "\\S" },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"
    },
    "gitObject": {
      "type": "string",
      "pattern": "^[a-f0-9]{40}(?:[a-f0-9]{24})?$"
    },
    "object": {
      "enum": [
        "requirements",
        "research",
        "technical",
        "cases",
        "tests",
        "implementation",
        "deployment",
        "user-acceptance"
      ]
    }
  }
}
```

Schema 正则不是对象存在性、完整 CID 或规范语言验证。
不删除未知字段以“修复”事件；读取方须额外验证 bootstrap、真实 Git 对象、
原始字节前缀、容量和具体业务条件。

## 12. 历史与后续实现

- 现有 signOff 的 submit-ID 语义、verify 的 commit/报告摘要语义保持历史原样。
- 不把旧 signOff 机械改名 accept，也不把旧 verify 自动当成 delegated accept。
- 当前代码的固定 Check 绑定不自动换成新 Schema 绑定；未知协议明确阻断。
- deployment 报告及 implementation 的目标对象绑定有语义变化，后续须明确
  兼容、对象获取和必要迁移方案后才能构建新 CAR。
- 本文定义默认 delegation，不证明项目当前已采用该配置或任何用户已接受内容。
- 尚未持久化的实际复测失败不能被仅靠旧事件的 checker 独立发现；
  Agent 必须停止推进、修复材料并重新提交验收，不用旧接受覆盖已知失败。

整个闭环是：**标准化 → measure → submit → 按模式验收并 accept → 同步 →
重新 measure**。版本退化发生在观察中，不发生在删历史或手写状态中。
