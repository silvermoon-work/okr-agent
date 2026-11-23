# Silvermoon Events：定义、材料引用与示例

## 1. 本轮设计：内容版本驱动的最小 Event 模型

本轮 review 的设计约定：

- `submit.upstream` 只保存直接前序的准确内容 revision，不保存完整版本向量。
  前序对象由 `object` 唯一确定：research 的前序是 requirements，
  technical 的前序是 research，依此沿单链追溯。
- 八种事件 created、submit、signOff、verify、setAlias、setLanguage、
  abandon、resume 共用一份全局 Events JSON Schema，以 `type` 区分事件结构。
  每条事件不携带 `id`、`version` 或 `$schema`；
  Schema CID 只在创建时绑定，不在后续事件重复。
- `signOff` 确认 `object + revision`，不是某次 submit 的事件身份。
  相同内容及依赖的重复 submit 幂等归并，不重置已有确认。
- 五个共识 revision 同时绑定本阶段材料和直接上游 revision；
  沿单链递归覆盖依赖上下文，不增加事件 ID 或完整版本向量。
- Idea 固定 eventSchemaCid，锁定整份事件日志的数据契约，不锁某个 Checker 实现。
  Checker CID 单独标识实际执行程序，记录在检查结果中；
  Schema CID 不代替生命周期业务规则的版本或执行身份。

**设计与实现边界：** 单链 upstream 已在当前源码和新构建的 Idea CAR 中实现；
取消事件 ID、移除事件级 version、按内容确认、重复归并、递归 revision 和 Schema
CID 绑定
是本轮设计调整，尚未接入运行时或 CAR。
当前运行时仍要求每条事件包含 id 和 `version: 1`，
signOff 引用 submit ID，五个 revision 只计算本阶段材料。
bootstrap 和 created 仍以 checkCid 固定 Check Bundle，尚不支持 eventSchemaCid。
不能直接写入本文的目标模型示例。
本轮不修改用例索引和部署报告的 version 字段，它们仍保持 `version: 1`。

submit 与 signOff 将提交待审与用户确认分开，单链追溯前序内容版本；实现记录实际通过自动化测试的
准确提交，部署记录固定 append-only JSONL 手工报告，最后单独请求用户体验验收。
目标 Idea Check 要求完整内容确认链和验收，不将旧事件自动算作新标准通过。

旧结构的 signOff、verify 和用例索引仍可读取，纯旧结构库归约保持原语义；
已有事件、Idea 固定 Check CID 和历史 CAR 不自动迁移。开始配对记录后不能追加旧式
signOff 或 verify。全局安装不会因源码构建自动更新，使用前核对实际安装版本和 CAR。

本文主文描述本轮目标设计，旧格式仅在附录作历史解释。
实际运行时字段以源码为准，当前检查规格见
[Idea Check Spec](./silvermoon-single-checker.yaml)。
[最新 Idea Check 设计 Spec](./silvermoon-idea-check-design.yaml)
与本文目标模型对齐，供 ipfsaw review，不表示运行时已实现。
[原设计候选](./silvermoon-idea-check-candidate.yaml)仅作为设计历史保留。

## 2. Event 与文件各自负责什么

> Event 记录发生了什么、针对哪个对象，以及所引用材料的准确版本；
> 文件保存报告、证据、反馈和分析等详细内容。

| 内容                                                             | 放在哪里                           |
| ---------------------------------------------------------------- | ---------------------------------- |
| 创建、提交待确认、用户确认、验证记录、别名或语言变化、放弃与恢复 | 事件日志                           |
| 需求、调研、技术方案、用例索引、测试说明                         | 对应材料文件                       |
| 自动化测试代码、依赖锁定、运行入口                               | 实现和测试材料，不另存实现报告     |
| 部署手工用例的操作、预期、实际结果及完成情况                     | 固定部署报告文件                   |
| 用例明确要求的日志、截图等附件                                   | Idea 内的安全普通文件              |
| 用户反馈、分析、整改说明                                         | 相关材料文件，不塞入“验收通过”事件 |

事件并不总是使流程向前。例如，一次失败的验证也是需要保留的事实；
新的验证失败可能使当前阶段不再满足通过条件。

### 几种“版本”不要混淆

| 字段或概念                                          | 含义                                                     |
| --------------------------------------------------- | -------------------------------------------------------- |
| Events JSON Schema                                  | 统一的事件结构定义，不是 Idea 的内容版本                 |
| 报告或用例索引的 `version`                          | 对应文件的结构版本，本轮不调整                           |
| `submit.revision`                                   | 本阶段材料与依赖的准确版本；用户验收时为部署报告摘要     |
| `submit.upstream`                                   | 直接前序内容 revision；需求根节点为 `null`               |
| `signOff.object` / `signOff.revision`               | 用户明确接受的对象与内容版本，不引用事件                 |
| `verify.rev`（配对，implementation）                | 实际通过自动化测试的完整 Git 提交 ID                     |
| `verify.rev`（配对，deployment）                    | 固定部署报告原始文件字节的 SHA-256 摘要                  |
| `state.implementation` / `state.deployment`（配对） | 直接采用有效实现提交 / 部署报告摘要，不再另算集合        |
| `eventDigest`                                       | 整份事件日志的摘要，用于观察和并发核对，不是验收报告版本 |
| `eventSchemaCid`                                    | Idea 固定使用的 Events JSON Schema CID，标识数据契约     |
| 检查结果中的 Check CID                              | 实际执行的 Check Bundle，不是事件格式或项目代码版本      |

## 3. 所有事件的通用约定

每个 Idea 在 `.silvermoon/i/<Idea ID>/events.jsonl` 保存自己的事件。

| 字段   | 必需 | 定义                                               |
| ------ | ---- | -------------------------------------------------- |
| `at`   | 是   | 规范 UTC ISO 时间，例如 `2026-11-20T07:40:00.000Z` |
| `type` | 是   | 八种支持的事件类型之一，配对 新增 `submit`         |

文件约定：

- UTF-8、LF，每行一个完整 JSON 对象，末尾必须有换行。
- 所有行按 bootstrap 固定的 Events JSON
  Schema 校验，不声明 id、version 或 $schema。
  仅 created 记录同一 eventSchemaCid，后续事件不重复携带 Schema 标识。
- 新事件递归按 ASCII 键序排序后序列化为单行 JSON。
- 按日志行顺序回放，不按 `at` 重排。
- `at` 只记录事实时间，不是唯一键、顺序编号或确认对象。
  重复 submit 在状态计算中归并，保留最后追加行的时间用于展示，不修改历史行。
- 不允许未声明的额外字段；不支持的结构或 Schema 明确报错，不猜测或降级。
- 已有事件的原始字节必须保留，只能在末尾追加。
- 当前日志上限为 1 MiB、4096 条；配对 设计保留这些限制。
- 事件记录事实，不证明用户身份，也不自动授权部署、发布或其他操作。

**以下 JSON 为便于阅读而展开，且都是独立示例，不是可直接拼接的日志。** `<...>`
是占位符，必须替换为真实观察值；其中摘要应是
`sha256:` 加 64 位小写十六进制。示例中的 Idea
ID、时间和 CID 不构成实际操作授权。
事件没有 ID；created.idea、bootstrap.id、Git 提交 ID 和用例 ID 仍各有独立用途。

## 4. `created`：Idea 被创建

创建时记录初始身份，并固定该 Idea 的 Events JSON Schema，不固定 Checker 实现。
bootstrap 保存 eventSchemaCid，created 记录同一初始绑定；
读取方先从 bootstrap 取得 Schema，再解析整份事件日志。

| 业务字段         | 必需 | 定义                                      |
| ---------------- | ---- | ----------------------------------------- |
| `idea`           | 是   | Idea ID                                   |
| `eventSchemaCid` | 是   | 与 bootstrap 一致的固定 Events Schema CID |
| `language`       | 否   | Idea 初始内容语言，使用规范 BCP 47 标签   |

```json
{
  "at": "2026-11-20T07:40:00.000Z",
  "type": "created",
  "idea": "202611200740abcd",
  "eventSchemaCid": "<fixed-event-schema-cid>",
  "language": "zh-CN"
}
```

约束：

- 必须是第一条事件，而且只能出现一次。
- `idea`、`eventSchemaCid`、`at` 必须分别匹配 bootstrap 的
  `id`、`eventSchemaCid`、`createdAt`。
- eventSchemaCid 对本 Idea 的整份日志固定；Schema 升级不静默更换已有绑定。
  Checker 实现更新不自动改变该 CID，也不自动迁移历史事件。
- Idea ID 的 UTC 分钟部分也必须匹配创建时间。
- 创建不代表需求已确认，更不代表 Idea 已完成。

## 5. `submit` / `signOff`：提交与用户确认分开

### 5.1 五个共识对象与唯一直接前序

| `object`       | 对应材料范围                     | 直接前序对象   |
| -------------- | -------------------------------- | -------------- |
| `requirements` | `requirements/` 全部材料         | 无，根节点     |
| `research`     | `technical/research.md`          | `requirements` |
| `technical`    | `technical/`，排除 `research.md` | `research`     |
| `cases`        | `tests/cases.json`               | `technical`    |
| `tests`        | `tests/`，排除 `cases.json`      | `cases`        |

材料范围摘要绑定路径和内容；不能只签主文档、忽略范围内附件。
事件只存表中直接前序的 revision，不同时存前序对象名或全部祖先的 revision。

#### revision 同时绑定材料与依赖

五个共识对象使用以下确定性定义：

```text
files = 按路径 ASCII 排序的 [相对路径, sha256(文件原始字节)] 列表
revision = sha256(UTF-8(canonical({ object, files, upstream })))
```

canonical 是递归按 ASCII 键序排列的紧凑 JSON，摘要均使用 `sha256:` 前缀。
files 包含本对象范围内的全部材料；requirements.upstream 为 null，
其余对象的 upstream 是直接前序按同一规则计算的 revision。
时间、submit 次数和事件日志不参与 revision。

因此，正文不变但任一祖先内容改变时，revision 也沿单链改变；
相同材料、相同依赖才是同一待确认版本。
只填充 tests 中的用例正文不会改变 cases 的 revision，因为它不依赖后续对象。
用户验收直接使用部署报告摘要，交付绑定见 5.4，不套用这五个对象的材料摘要公式。

### 5.2 Agent 先提交，等待用户信号

`submit` 表示 Agent 已准备好准确版本，请用户 review；不代表用户同意。

| 业务字段   | 必需 | 定义                                             |
| ---------- | ---- | ------------------------------------------------ |
| `object`   | 是   | 本次提交的阶段                                   |
| `revision` | 是   | 材料与依赖的准确版本；用户验收阶段为部署报告摘要 |
| `upstream` | 是   | 直接前序内容 revision；根节点为 `null`           |

单链为：

```text
requirements <- research <- technical <- cases <- tests <- user-acceptance
```

每个箭头只绑定直接前序的内容 revision，不重复完整 revision 向量。
非空值为 `sha256:` 加 64 位小写十六进制；`object` 唯一决定它属于哪个前序阶段。
材料范围为 5.1 的五个范围，`upstream` 是单个摘要或 `null`，不是对象映射。
根节点示例：

```json
{
  "at": "2026-11-20T07:42:00.000Z",
  "type": "submit",
  "object": "requirements",
  "revision": "<requirements-rev>",
  "upstream": null
}
```

其余阶段只绑定一个直接前序，例如研究提交：

```json
{
  "at": "2026-11-20T07:50:00.000Z",
  "type": "submit",
  "object": "research",
  "revision": "<research-rev>",
  "upstream": "<requirements-rev>"
}
```

研究提交前，上述需求版本须已获 signOff 并同步。
technical 只保存 research revision，cases 只保存 technical revision，
tests 只保存 cases revision。
checker 按事件顺序核对提交时的直接前序已确认，
并按 5.1 的递归规则计算当前材料及上游 revision。
完整上下文由单链摘要绑定，不依赖某次请求的身份或另存的祖先向量。

#### 重复 submit 的幂等归并

- 同一 Idea 内，object、revision、upstream 全部相同的 submit 是同一内容提交。
  重复出现时只更新该版本的最后提交时间；不重置已有 signOff，不要求再次确认。
- 归并只作用于 reducer 状态和展示，不删除、重排、覆盖或格式化已有日志。
  最后提交时间取最后追加行的 at，不按时间戳重新排序或生成唯一键。
- 每个对象的当前候选版本仍由最后一条 submit 决定，
  不能用较早版本的归并结果覆盖后来提交的不同版本。
- 不同字节但语义近似的材料不自动归并；revision 可以检测准确内容及依赖是否相同，
  不能代替用户判断语义等价。
- 该幂等规则仅针对内容提交和确认，不用于跳过实现复测、部署新轮次或用户实际体验。

### 5.3 `signOff` 确认对象的准确内容版本

先记录 submit，再向用户展示其准确材料、revision 和依赖并等待信号。
**仅在用户明确接受后**追加 signOff：

```json
{
  "at": "2026-11-20T07:45:00.000Z",
  "type": "signOff",
  "object": "requirements",
  "revision": "<requirements-rev>"
}
```

| 业务字段   | 必需 | 定义                       |
| ---------- | ---- | -------------------------- |
| `object`   | 是   | 用户确认的对象             |
| `revision` | 是   | 用户明确接受的准确内容版本 |

不携带 submit、upstream、decision 或事件 ID。
五个共识 revision 自身覆盖依赖；用户验收 revision 通过报告绑定实际交付。

确认及失效规则：

- signOff 前必须已提交本 Idea 的相同 object + revision；
  确认时它必须仍是该对象的当前有效候选版本，前序已确认且材料、依赖仍准确。
  孤立确认、前向确认、跨 Idea 引用和迟到的不同版本确认均无效。
- 相同版本的重复 submit 不使已有确认失效；
  相同 object + revision 的重复 signOff 也幂等，不形成额外确认关口。
  归并后的时间不能改写真实顺序：首次确认之前必须已存在对应 submit。
- 任一祖先内容变化会改变后续对象的递归 revision，旧确认不能用于新版本。
  即使本阶段正文未改，也须针对新 revision 重新提交并确认。
- 回到完全相同的材料和依赖版本时，可复用该版本已有的内容确认；
  仍须重新核对全部阶段、证据和同步条件，不能据此跳过实际验证。
- 用户尚未决定时等待，要求修改时迭代后重新 submit。
  不把旧版本接受信号套到当前不同版本，也不能提前批量写出 submit 和 signOff。
- 材料、submit、signOff 都同步到 primary 后，才能越过对应共识关口；
  submit 可先同步，用户信号后的 signOff 可另行提交，不要求同一 Git 提交。
- 新格式不写 `decision`，事件记录真实信号，不构成用户身份认证。
- state.submitted 按对象记录当前提交的 revision，state.signed 记录当前有效确认的
  revision，不再保存事件 ID。前序阻塞时仍停在首个未达成关口。
- 历史 signOff 保持原字节和原语义；不将 submit-ID 确认或旧材料摘要自动转换成
  目标模型的内容确认，也不自动迁移固定 Check/CAR。

### 5.4 用户体验验收也确认内容版本

部署及 Agent 手工自验通过并同步后，Agent 先 submit 交付，再请用户实际操作：

```json
{
  "at": "2026-11-20T08:45:00.000Z",
  "type": "submit",
  "object": "user-acceptance",
  "revision": "<state.deployment>",
  "upstream": "<tests-rev>"
}
```

用户明确接受后，signOff 确认这份交付报告的 revision：

```json
{
  "at": "2026-11-20T09:00:00.000Z",
  "type": "signOff",
  "object": "user-acceptance",
  "revision": "<state.deployment>"
}
```

不新增第六份内容 revision：submit.revision 绑定当前固定部署报告摘要，
报告最新 `start` 的 `implementation` 再绑定准确代码提交；upstream 仍只保存 tests
revision，不另外携带一份实现版本向量。
checker 必须核对该实现提交包含当前五个递归 revision，且报告、实现及前序均有效；
否则即使报告字节未改，也不能继续用户验收或复用确认。

用户未实际体验、仍在反馈或未明确接受时不能 signOff。
反馈和整改详情放材料文件；实现、部署或前序提交链失效时重新验收并 submit。
内容确认及最终同步都满足后才完成 Idea；仅记录确认事件不要求重新部署。

## 6. `verify`：记录一次验证

### 6.1 配对格式：每个阶段只保留一个 `rev`

配对验证采用以下轻量格式：

| 业务字段 | 必需 | 定义                                                                          |
| -------- | ---- | ----------------------------------------------------------------------------- |
| `phase`  | 是   | `implementation` 或 `deployment`                                              |
| `rev`    | 是   | 实现阶段为实际通过测试的完整代码提交 ID；部署阶段为固定报告的原始字节 SHA-256 |

不设置通用 `environment`，也不携带可推导的报告路径、批次 ID、
逐用例结果、共识版本向量或证据清单。`rev` 是验收对象的准确版本，
不是事件修订号；代码提交 ID 和报告内容摘要各有明确用途，不能互换。

### 6.2 实现阶段：可重现自动化测试，不要报告

```json
{
  "at": "2026-11-20T08:20:00.000Z",
  "type": "verify",
  "phase": "implementation",
  "rev": "<exact-tested-commit-sha>"
}
```

这条事件记录：“Agent 已对这一准确提交执行全部已确认实现用例对应的自动化测试，
并确认通过。”只有实际全部通过后才追加，不另外要求人类对测试结果 sign off。

- 保存测试代码、依赖锁定及明确的运行入口，其他人可以重跑。
- 不要求实现 report、测试输出副本或逐用例证据文件。
- 可重现不代表免执行；失败、错误、阻塞或未执行时不能记录通过或进入部署。
- 即使同版本有旧成功，本次复测失败也必须停止推进，不能拿旧事件覆盖实际失败。
- 代码提交快照必须包含当前五个已确认版本；checker 从该快照核对绑定，
  不在事件中再存一份版本向量。
- checker 校验版本和同步，不自动执行目标代码，也不能从事件独立证明测试真实发生。
  需要独立复核时，按已有授权重新运行相同测试。

### 6.3 部署验证报告

部署阶段由 Agent 主导操作实际交付物，完成 E2E 手工验收，
不是仅检查部署退出码，也不是仅重跑自动化测试。

只维护一个累积的 append-only 报告，路径固定为 Idea 根目录下的
`evidence/deployment/report.jsonl`。事件只需引用整份文件的准确内容版本：

```json
{
  "at": "2026-11-20T08:40:00.000Z",
  "type": "verify",
  "phase": "deployment",
  "rev": "<sha256-of-raw-report-bytes>"
}
```

报告只有两种行：`start` 绑定本轮实现，`case` 记录逐项验收。
每轮先追加 start，再边验收边追加 case，不等结束后重写文件。
下例展示一次失败及其真实复测通过；失败行保留，最后一条决定该 case 当前状态：

```jsonl
{"version":1,"type":"start","implementation":"<state.implementation>"}
{"type":"case","case":"D-LOGIN","steps":"输入有效测试账号并提交。","expected":"进入主页。","actual":"请求超时，未进入主页。","result":"fail"}
{"type":"case","case":"D-LOGIN","steps":"恢复服务后重新输入有效测试账号并提交。","expected":"进入主页。","actual":"已进入主页并确认登录状态。","result":"pass"}
```

| 行类型  | 字段             | 含义                                                      |
| ------- | ---------------- | --------------------------------------------------------- |
| `start` | `version`        | 报告行协议版本，固定为 `1`                                |
| `start` | `type`           | 固定为 `start`                                            |
| `start` | `implementation` | 本轮实际交付的已验收代码提交，等于 `state.implementation` |
| `start` | `context`        | 可选非空文本，说明实际测试条件，不是通用环境参数          |
| `case`  | `type`           | 固定为 `case`                                             |
| `case`  | `case`           | 已确认部署用例 ID                                         |
| `case`  | `steps`          | 实际操作步骤                                              |
| `case`  | `expected`       | 预期结果                                                  |
| `case`  | `actual`         | 实际观察，或阻塞、未执行的原因                            |
| `case`  | `result`         | `pass`、`fail`、`error`、`blocked` 或 `not-run`           |

除 `context` 外，各行对应字段均必填，不允许额外字段，文字字段非空。
文件第一行必须是 start；最新 start 到文件末尾为本轮，
不能拿前轮结果补齐本轮。同轮允许复测追加同 case，以最后一条为准。
新一轮即使实现提交相同也先追加 start，重新执行全部部署用例；
不另设批次 ID、逐行 revision 或时间戳。

本轮按 case 取最后结果后，必须覆盖全部已确认部署用例且全部 pass，才推导通过。
最新 fail、error、blocked、not-run 或缺项均阻断，不回退该 case 的旧成功。
整体验收结论由 checker 推导，不额外写 `results` 数组、整体 result 或完成行。

报告自身就是逐项验收记录，不要求所有用例再各附一份日志或截图；
具体用例有附件要求时仍须满足，使用 Idea 内的安全普通文件。
平台、地址等条件写在具体用例和必要的 `context` 中，不增加通用参数。
不能仅写一句“Agent 验收通过”替代实际用例记录。

### 6.4 固定报告的更新与引用规则

配对 设计要求：

1. 实现不存报告；部署始终使用 `evidence/deployment/report.jsonl`，
   不按环境或每次事件新建目录。
2. 报告必须是安全普通文件，不能是链接、越界路径或远程 URL。
3. 报告同样 append-only：保留 primary 中已有的原始字节准确前缀，
   只能追加完整行，不能清空、覆盖、删除、截断、重排或格式化旧行。
   生命周期与提交检查均需保护此约束，达到容量上限时明确阻断。
   UTF-8、LF，每行一个完整 JSON 对象，末尾换行，不接受空行或半行。
   并发追加先复核前缀与版本，发现冲突时停止并重新观察，不交错写入或自动覆盖。
4. 事件的 `rev` 使用 `sha256:` 加 64 位小写十六进制；
   报告不存自身 rev，也不对整个 evidence 目录或事件日志做哈希。
5. 本轮记录保存后，计算整个文件当前原始字节 SHA-256，再追加 verify。
   报告、必要附件和最新事件一起提交、同步，不能只有事件而缺少报告。
6. 当前快照只校验最新部署事件与当前报告的对应关系。
   **历史事件保留原始字节，但不要求其 rev 匹配追加后的完整报告。**
   旧记录直接留在同一个文件中，Git 另保留提交历史，不复制多份报告。
7. 追加 start 或 case 后但未追加匹配 verify，旧 rev 即失效；
   最新轮未完成、失败或报告缺失时，均阻断当前验收，
   不能回退旧成功。

报告全文件上限为 1 MiB、4096 行，每轮最多 512 个不同部署用例，
且受 Idea 总容量限制。旧协议证据仍按旧协议保留，不自动迁移至 JSONL。

### 6.5 哪次验证决定当前状态

配对协议按阶段判断，不按环境聚合，也不能“挑最后一次成功”：

- 按日志顺序，分别取各阶段**最后一条 配对 验证**。
- 实现 `rev` 必须是 HEAD 的祖先或自身，且其快照包含当前五个已确认版本。
- 相比受测提交，仅本 Idea 的 `events.jsonl` 和 `evidence/` 元数据变化
  不使代码过期；其他受跟踪内容变化，包括测试、锁文件、配置，必须重新自动化验收。
- 部署报告最新 start 必须绑定当前有效实现提交，对应事件须位于最新实现验证事件之后。
- 最新报告失败、错误、阻塞、未执行、不完整或版本失效均阻断，不回退旧成功。
- 引用材料缺失、结构无效或哈希不符是数据问题；意外 I/O、取消、未知协议或
  并发变化要明确传播为执行错误，不能伪装成通过。
- 有效后，`state.implementation` 直接取实现 `rev`，
  `state.deployment` 直接取部署 `rev`，不再计算第二份集合摘要。
- 实现重新验证后必须重新部署验收；旧用户确认也必须重新核验版本绑定。

## 7. `setAlias`：修改别名

业务字段只有必需的 `alias`。

```json
{
  "at": "2026-11-20T08:05:00.000Z",
  "type": "setAlias",
  "alias": "login-flow"
}
```

- 别名以小写字母开头，总长 1 至 64 字符，后续只允许小写字母、数字和连字符。
- `alias: null` 清除别名，不使用空字符串。
- 以最后一条设置为准；修改名称不代表确认需求或验收交付。

## 8. `setLanguage`：修改内容语言覆盖

业务字段只有必需的 `language`。

```json
{
  "at": "2026-11-20T08:06:00.000Z",
  "type": "setLanguage",
  "language": "zh-CN"
}
```

- 非空值必须是规范 BCP 47 标签，例如 `zh-CN`、`en-US`。
- `language: null` 清除 Idea 自身覆盖，恢复“项目配置 → 用户配置 →
  `en-US`”的回退。
- 没有后续覆盖时，`created.language` 可以提供初始 Idea 语言。
- 修改语言设置不自动翻译文件，也不代表用户重新确认了内容。

## 9. `abandon`：放弃 Idea

业务字段只有必需、非空的 `reason`。
配对 设计要求只写一句简短原因，详细背景留在材料文件中；当前 schema 没有新增的短句长度门槛。

```json
{
  "at": "2026-11-20T09:10:00.000Z",
  "type": "abandon",
  "reason": "目标需求已取消，停止推进此 Idea。"
}
```

- 放弃是明确的生命周期决定，不能由 Agent 根据长时间无人回复自行推断。
- 不删除历史材料、事件或已发生的确认。
- 已放弃时不能再次放弃，也不能继续追加其他类型事实；先明确恢复。

## 10. `resume`：恢复已放弃的 Idea

没有额外业务字段。

```json
{
  "at": "2026-11-20T09:20:00.000Z",
  "type": "resume"
}
```

- 只能用于当前已经放弃的 Idea，需要明确恢复决定。
- 恢复不等于完成，也不抹去放弃事件。
- 恢复后按当前材料、有效共识、证据和同步状态重新推导停在哪一关，不强行回到第一关，
  也不强行继承已经失效的通过结果。

## 11. 哪些不是事件

当前设计都没有单独定义以下事件：

| 名称           | 实际处理方式                                          |
| -------------- | ----------------------------------------------------- |
| `completed`    | 由全部适用关口、材料和同步事实推导，不手写完成标记    |
| `synchronized` | 根据准确 primary 观察、提交和材料状态判断             |
| `feedback`     | 用户反馈写在相关材料中，不自动转成接受                |
| `rejected`     | 用户未接受时继续迭代，不伪造 `signOff`                |
| `accept`       | 不新增此事件；使用确认 object + revision 的 `signOff` |

`submit` 是 配对 新增的正式事件，当前源码及新构建的 CAR 已支持。

**配对行为：** 部署和 Agent 自验通过后进入 `user-acceptance`；
用户未明确接受则等待或修改。确认有效但未同步时为
`synchronization`，`next` 为 `user-acceptance`；确认及最终同步都满足后才完成。

## 12. 一次完整推进如何串起来

下面是配对流程示意，箭头之间仍需完成对应材料与 primary 同步：

```text
created
  -> submit(requirements) -> 等待用户 -> signOff(requirements, revision)
  -> submit(research, upstream=requirements rev) -> 等待用户 -> signOff
  -> submit(technical, upstream=research rev) -> 等待用户 -> signOff
  -> submit(cases, upstream=technical rev) -> 等待用户 -> signOff
  -> submit(tests, upstream=cases rev) -> 等待用户 -> signOff
  -> 执行可重现自动化测试，全部通过
  -> verify(implementation, rev=准确受测提交，无报告)
  -> Agent 主导 E2E 手工验收，逐项更新固定部署报告
  -> verify(deployment, rev=报告原始字节摘要)
  -> submit(user-acceptance, upstream=tests rev, revision=部署报告摘要)
  -> 用户实际操作、反馈
       -> 有问题：修改受影响材料，重新确认或验证，再交付用户体验
       -> 明确接受：signOff(user-acceptance, revision=部署报告摘要)
  -> 最终同步
  -> 推导为 completed
```

`setAlias`、`setLanguage` 是独立的元数据变化，不是必经共识关口。
放弃后通过 `abandon -> resume` 保留往返历史，不删除事件“回滚状态”。

检查器核验的是事件、版本和证据之间的绑定；它不能仅凭一个
`signOff` 证明用户真实身份，也不能仅凭一份报告证明测试一定真实执行。
Agent 必须如实记录用户决定与验证事实，不能把“结构校验通过”当成“事实已经发生”。

## 13. 统一 Events JSON Schema

### 13.1 Schema CID 与 Checker CID 的边界

- eventSchemaCid 标识不可变数据契约：字段、类型、分支及结构约束。
  在 bootstrap 和唯一 created 中绑定一次，后续事件使用同一 Schema。
- Checker CID 标识实际执行的程序，在检查结果中单独记录；
  Checker 修复不必使 Schema CID 改变，也不应要求改写已有事件。
- Schema 不完整定义重复归并、递归 revision、上游失效和同步关口等业务语义。
  如需复现历史验收结论，还须固定相应规则规格或 Check；
  仅固定 Schema 不等于固定整个生命周期协议。
- CID 验证内容完整性，不证明 Schema 可信，也不授权执行 Checker。
  固定 Schema 不可用、不支持或内容不符时明确报错，不回退最新版本。

### 13.2 RFC 8785 序列化与 CID 生成规则

对满足 [RFC 8785 / JCS](https://datatracker.ietf.org/doc/html/rfc8785)
输入约束的 JSON Schema（对象或布尔值），使用以下固定编码配置：

```text
bytes          = UTF-8(JCS(schema))
digest         = SHA-256(bytes)
multihash      = sha2-256 标识 + 摘要长度 32 + digest
eventSchemaCid = base32lower(CIDv1(raw, multihash))
```

按 [CID 规范](https://specs.ipfs.tech/cid/)，使用 CIDv1、raw codec（0x55）、
sha2-256 multihash（0x12），字符串统一为带 b 前缀的无填充小写 base32。
CID 包含版本、codec 和 multihash，不是裸 SHA-256；
CIDv1 的版本也不是事件的 version 字段。
存储及读取的块必须是上述 canonical UTF-8 bytes，不加 BOM、空白或末尾换行。
加载时验证 CID、raw/sha2-256 配置及原始块字节，并确认 Schema 是合法 JCS 表示，
不能将同一 Schema 的漂亮排版文件直接作为该块。
这是 raw 块中的 JCS JSON，不冒充 DAG-JSON 编码或使用其 codec。

JCS 递归按 UTF-16 码元排序对象属性，保持数组顺序，规定字符串转义及
IEEE 754 双精度数值的序列化。重复键、无效 Unicode、无法满足数值约束等输入
须明确拒绝；不能只用普通 JSON.stringify 或任意“键排序”替代完整 JCS 实现。
该规则专门用于 Schema 身份，不改变事件日志、部署报告的原始字节哈希和追加约束，
也不改写 5.1 的材料 revision 定义。

同一 JSON 数据的不同空白或对象键排列得到同一 CID；
描述文字、数组顺序或其他 JSON 值改变会改变 CID，
即使两个 Schema 接受相同数据也不保证其 CID 相同。
Schema 不把自身 CID 写入自身 $id，否则形成自引用；
本文保留稳定 URN，eventSchemaCid 在 Schema 定义之外绑定。

### 13.3 引用与校验环境

本模型采用自包含 Schema：应用 $ref 只指向内部 $defs，不依赖可变远程引用。
如以后引入外部引用，其完整依赖也须不可变绑定；只计算根 Schema 的 CID
不能锁定远程内容。$schema 指定的元 Schema/dialect 由受控校验环境支持，
不在校验事件时隐式联网获取或执行配置。
校验环境还须明确支持 date-time 格式断言；相同 Schema CID
不保证不同配置的校验器作出相同判定。

### 13.4 单行事件的 Schema 定义

下面是一份全局 Schema，校验 events.jsonl 的单行事件，不是整份 JSONL 文本。
采用 JSON Schema Draft 2020-12；$schema 和 $id 仅属于 Schema 定义，
事件没有 id、version 或 $schema；仅 created 含初始 eventSchemaCid。
根级 unevaluatedProperties=false 拒绝所有分支未声明的字段。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:silvermoon:events",
  "title": "Silvermoon Event",
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
        "eventSchemaCid": { "$ref": "#/$defs/schemaCid" },
        "language": { "$ref": "#/$defs/nonempty" }
      },
      "required": ["idea", "eventSchemaCid"]
    },
    {
      "properties": {
        "type": { "const": "submit" },
        "object": { "$ref": "#/$defs/object" },
        "revision": { "$ref": "#/$defs/digest" },
        "upstream": {
          "oneOf": [{ "type": "null" }, { "$ref": "#/$defs/digest" }]
        }
      },
      "required": ["object", "revision", "upstream"],
      "if": {
        "properties": { "object": { "const": "requirements" } },
        "required": ["object"]
      },
      "then": { "properties": { "upstream": { "type": "null" } } },
      "else": { "properties": { "upstream": { "$ref": "#/$defs/digest" } } }
    },
    {
      "properties": {
        "type": { "const": "signOff" },
        "object": { "$ref": "#/$defs/object" },
        "revision": { "$ref": "#/$defs/digest" }
      },
      "required": ["object", "revision"]
    },
    {
      "properties": {
        "type": { "const": "verify" },
        "phase": { "const": "implementation" },
        "rev": { "$ref": "#/$defs/commit" }
      },
      "required": ["phase", "rev"]
    },
    {
      "properties": {
        "type": { "const": "verify" },
        "phase": { "const": "deployment" },
        "rev": { "$ref": "#/$defs/digest" }
      },
      "required": ["phase", "rev"]
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
    {
      "properties": {
        "type": { "const": "resume" }
      }
    }
  ],
  "unevaluatedProperties": false,
  "$defs": {
    "nonempty": { "type": "string", "minLength": 1, "pattern": "\\S" },
    "schemaCid": { "type": "string", "pattern": "^b[a-z2-7]+$" },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"
    },
    "digest": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
    "commit": {
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
        "user-acceptance"
      ]
    }
  }
}
```

校验器须支持 Draft 2020-12 的 unevaluatedProperties 和 date-time 格式断言，
不能忽略格式或将未知字段静默剔除。
Schema 校验形态；以下规则仍由 checker/reducer 校验：

- canonical UTC 时间、JSON 键序、UTF-8/LF、原始字节前缀和容量限制。
- Idea 身份与 bootstrap 一致、eventSchemaCid 可解析且满足 13.2 的编码配置、
  实际 Schema 块内容与固定 CID 匹配、规范 BCP 47 语言标签。
- created 必须第一条且唯一；abandon/resume 的合法状态转换。
- revision 与材料、递归依赖一致，signOff 前已 submit，确认时为当前有效内容。
- 重复提交幂等归并、验证版本绑定、证据完整性与 primary 同步。

真实用户信号和实际测试须由 Agent 如实记录；Schema 与 checker
不能仅凭合法事件证明这些事实发生过。

## 14. 对应的 TypeScript 类型定义

以下为目标模型的独立类型定义，不是当前运行时的导出类型。
联合类型区分每种事件，并使 requirements 的 upstream 只能为 null，
其余提交只能为摘要；verify 的两种 phase 也有不同 rev 类型。
字符串类型表达用途，不替代 Schema 的格式校验；
TypeScript 的结构类型系统也不保证拒绝变量中携带的所有额外字段。

```ts
export type Digest = `sha256:${string}`;
export type GitCommit = string;
export type UtcTimestamp = string;
export type IdeaId = string;
export type EventSchemaCid = string;
export type ContentLanguage = string;

export type ConsensusObject =
  "requirements" | "research" | "technical" | "cases" | "tests";

export type ReviewObject = ConsensusObject | "user-acceptance";

export interface EventBase {
  at: UtcTimestamp;
}

export interface CreatedEvent extends EventBase {
  type: "created";
  idea: IdeaId;
  eventSchemaCid: EventSchemaCid;
  language?: ContentLanguage;
}

export type SubmitEvent = EventBase & {
  type: "submit";
  revision: Digest;
} & (
    | { object: "requirements"; upstream: null }
    | { object: Exclude<ReviewObject, "requirements">; upstream: Digest }
  );

export interface SignOffEvent extends EventBase {
  type: "signOff";
  object: ReviewObject;
  revision: Digest;
}

export type VerifyEvent = EventBase &
  (
    | { type: "verify"; phase: "implementation"; rev: GitCommit }
    | { type: "verify"; phase: "deployment"; rev: Digest }
  );

export interface SetAliasEvent extends EventBase {
  type: "setAlias";
  alias: string | null;
}

export interface SetLanguageEvent extends EventBase {
  type: "setLanguage";
  language: ContentLanguage | null;
}

export interface AbandonEvent extends EventBase {
  type: "abandon";
  reason: string;
}

export interface ResumeEvent extends EventBase {
  type: "resume";
}

export type SilvermoonEvent =
  | CreatedEvent
  | SubmitEvent
  | SignOffEvent
  | VerifyEvent
  | SetAliasEvent
  | SetLanguageEvent
  | AbandonEvent
  | ResumeEvent;
```

## 15. 附录：旧格式与兼容边界

本节只解释历史结构，不是本轮目标设计，也不授权改写已有事件。
历史事件的原始字节、已有摘要、Idea 固定 Check CID 和历史 CAR 均保留；
不能为了移除 id、version、改绑 Schema
CID 或改变 revision 定义而格式化或重写旧日志。
历史 bootstrap.checkCid 和 created.checkCid 仍固定 Check Bundle，
不直接重命名或替换成 eventSchemaCid；新的数据契约绑定只属于目标模型。
目标模型的运行时支持及新旧记录兼容规则需在实现时明确验证，
本轮文档修改不表示现有 CLI 已支持追加这种事件。

### 15.1 历史 signOff：完整向量或 submit-ID 配对

旧格式 signOff 直接包含 object、revision 和 upstream 对象；
upstream 保存全部前序阶段的 revision，而不是一个直接前序摘要。
这不是本轮采用的单链结构，不应再作为新设计示例。
历史 `decision: "confirmed"` 仅兼容读取，不改写旧事件。
当前已实现的配对格式则用 signOff.submit 引用某次 submit 的事件 ID；
每条事件仍包含 id 和 version，重复 submit 需要新的对应确认。
它也不是本轮目标模型；历史请求身份不自动转成递归内容 revision。

### 15.2 旧式 verify：事件内嵌完整批次

旧格式事件包含 `version: 1`，verify 在 batch 中保存完整验证批次，
不自动转成新规则的通过证据。

与配对格式对比：

| 旧式 `batch` 内容           | 配对处理                                       |
| --------------------------- | ---------------------------------------------- |
| `id`                        | 取消独立批次 ID 和事件 ID                      |
| `phase`                     | 事件顶层                                       |
| `environment`               | 取消通用字段，具体条件放用例或报告说明         |
| `revisions`                 | 从已验收实现提交快照核对，不重复存入事件和报告 |
| `subject`                   | 实现事件的 `rev` 直接绑定准确提交              |
| 部署批次的 `implementation` | 部署报告绑定准确实现提交，不再是集合摘要       |
| `results` 与证据引用        | 实现不留副本；部署在固定报告逐项记录手工结果   |

旧式证据 digest 是原始文件字节 SHA-256；subject 是准确受测 Git 提交。
旧式 state.implementation / state.deployment 是全部必需环境的有效批次集合摘要，
不是配对格式直接采用的实现提交或部署报告摘要。

旧批次 ID 在 Idea 历史中唯一，最长 64 字符，以字母数字开头，之后允许字母数字、
点、下划线和连字符。部署批次的 phase 为 deployment，
且必须增加 implementation；实现批次不得增加该字段。

旧纯历史状态保持原语义：有效实现与部署批次可使旧 reducer 返回 completed，
但 Idea Task 仍要求通过实际的同步检查。
要按配对规则推进，必须重新执行自动化测试、记录配对实现验证，
再完成固定报告和配对部署验证；不把旧逐环境批次与新阶段记录混算。
开始使用配对格式后不得新增旧式 signOff 或 verify，失败不能回退旧成功。
