# Silvermoon Events：定义、材料引用与示例

## 1. 先区分当前协议与候选设计

本文解释 Idea 的全部事件，并区分两个边界：

| 标记 | 含义                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------- |
| 当前 | [运行时事件定义](../packages/silvermoon/src/domain.ts)已经支持的格式                            |
| 候选 | [Idea Check 候选 Spec](./silvermoon-idea-check-candidate.yaml)中提出、尚未实现或进入 CAR 的格式 |

目前有七种 `type`：`created`、`signOff`、`verify`、`setAlias`、
`setLanguage`、`abandon`、`resume`。候选设计增加第八种事件 `submit`：

- Agent 先用 v2 `submit` 提交准确版本；用户明确接受后，用 v2 `signOff`
  只引用该 submit ID，两者配对，不再把提交与批准混成一件事。
- `submit.upstream` 只保存直接前序的内容 revision，沿单链追溯完整上下文，
  不重复全部前序版本。
- 将 `verify` 精简为 `phase + rev`，新事件使用 `version: 2`：
  实现阶段引用自动化测试通过的提交，部署阶段引用固定的 append-only
  JSONL 手工验收报告。
- 用例索引改为候选 v2，仅声明 `id + phase`，不设置通用 `environment`。
- 为 `submit.object` 增加 `user-acceptance`，用同样的配对流程记录用户体验验收。
- 其他事件继续使用 `version: 1`。

**当前运行时不支持上述候选扩展。不要把候选示例写入真实事件日志。**
本文是解释文档，不是新的协议源；当前格式以源码为准，候选格式以候选 Spec 为准。

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
| `version`                                           | 该事件或报告的结构版本，不是 Idea 的内容版本             |
| 事件 `id`                                           | 一次事件的唯一标识，不是内容哈希                         |
| `signOff.revision` / `signOff.upstream`（当前）     | 旧格式的被确认版本与完整前序向量                         |
| `submit.revision`（候选）                           | Agent 本次提交待确认的准确对象版本                       |
| `submit.upstream`（候选）                           | 直接前序内容 revision；需求根节点为 `null`               |
| `signOff.submit`（候选）                            | 用户明确接受的那一条 submit 事件 ID                      |
| `verify.rev`（候选，implementation）                | 实际通过自动化测试的完整 Git 提交 ID                     |
| `verify.rev`（候选，deployment）                    | 固定部署报告原始文件字节的 SHA-256 摘要                  |
| 证据 `digest`（当前协议）                           | 一份证据原始文件字节的 SHA-256 摘要                      |
| `subject`（当前协议）                               | 真正受测的准确 Git 提交                                  |
| `state.implementation` / `state.deployment`（当前） | 全部必需环境的有效验证批次集合摘要                       |
| `state.implementation` / `state.deployment`（候选） | 直接采用有效实现提交 / 部署报告摘要，不再另算集合        |
| `eventDigest`                                       | 整份事件日志的摘要，用于观察和并发核对，不是验收报告版本 |
| `checkCid`                                          | Idea 固定使用的 Check Bundle CID，不是项目代码版本       |

## 3. 所有事件的通用约定

每个 Idea 在 `.silvermoon/i/<Idea ID>/events.jsonl` 保存自己的事件。

| 字段      | 必需 | 定义                                                                |
| --------- | ---- | ------------------------------------------------------------------- |
| `version` | 是   | 当前均为 `1`；候选 `submit`、配对 `signOff`、精简版 `verify` 为 `2` |
| `id`      | 是   | 本 Idea 中唯一的 32 位小写十六进制字符串                            |
| `at`      | 是   | 规范 UTC ISO 时间，例如 `2026-11-20T07:40:00.000Z`                  |
| `type`    | 是   | 当前七种事件类型之一；候选另外支持 `submit`                         |

文件约定：

- UTF-8、LF，每行一个完整 JSON 对象，末尾必须有换行。
- 新事件递归按 ASCII 键序排序后序列化为单行 JSON。
- 按日志行顺序回放，不按 `at` 重排。
- 不允许未声明的额外字段；未知协议版本明确报错，不猜测或降级。
- 已有事件的原始字节必须保留，只能在末尾追加。
- 当前日志上限为 1 MiB、4096 条；候选设计保留这些限制。
- 事件记录事实，不证明用户身份，也不自动授权部署、发布或其他操作。

**以下 JSON 为便于阅读而展开，且都是独立示例，不是可直接拼接的日志。** `<...>`
是占位符，必须替换为真实观察值；其中摘要应是
`sha256:` 加 64 位小写十六进制。示例中的 ID、时间和 CID 不构成实际操作授权。

## 4. `created`：Idea 被创建

**状态：当前。** 创建时记录初始身份，并固定该 Idea 的 Check Bundle。

| 业务字段   | 必需 | 定义                                    |
| ---------- | ---- | --------------------------------------- |
| `idea`     | 是   | Idea ID                                 |
| `checkCid` | 是   | 与 bootstrap 一致的固定 Check CID       |
| `language` | 否   | Idea 初始内容语言，使用规范 BCP 47 标签 |

```json
{
  "version": 1,
  "id": "00000000000000000000000000000001",
  "at": "2026-11-20T07:40:00.000Z",
  "type": "created",
  "idea": "202611200740abcd",
  "checkCid": "<fixed-check-cid>",
  "language": "zh-CN"
}
```

约束：

- 必须是第一条事件，而且只能出现一次。
- `idea`、`checkCid`、`at` 必须分别匹配 bootstrap 的
  `id`、`checkCid`、`createdAt`。
- Idea ID 的 UTC 分钟部分也必须匹配创建时间。
- 创建不代表需求已确认，更不代表 Idea 已完成。

## 5. `submit` / `signOff`：提交与用户确认分开

### 5.1 当前的五个共识对象

**状态：当前。** 这是对真实用户决定的记录，不是 Agent 自行声明通过。

| 业务字段   | 必需 | 定义                                       |
| ---------- | ---- | ------------------------------------------ |
| `object`   | 是   | 本次确认的阶段                             |
| `revision` | 是   | 本阶段准确内容摘要                         |
| `upstream` | 是   | 全部前序阶段的准确内容版本，不能少写或多写 |

| `object`       | 对应材料范围                     | `upstream` 必须包含        |
| -------------- | -------------------------------- | -------------------------- |
| `requirements` | `requirements/` 全部材料         | `{}`                       |
| `research`     | `technical/research.md`          | `requirements`             |
| `technical`    | `technical/`，排除 `research.md` | `requirements`、`research` |
| `cases`        | `tests/cases.json`               | 再加 `technical`           |
| `tests`        | `tests/`，排除 `cases.json`      | 再加 `cases`               |

材料范围摘要绑定路径和内容；不能只签主文档、忽略范围内附件。

**例一：用户接受当前需求。**

```json
{
  "version": 1,
  "id": "00000000000000000000000000000002",
  "at": "2026-11-20T07:45:00.000Z",
  "type": "signOff",
  "object": "requirements",
  "revision": "<requirements-rev>",
  "upstream": {}
}
```

**例二：用户接受基于当前需求和调研的技术方案。**

```json
{
  "version": 1,
  "id": "00000000000000000000000000000003",
  "at": "2026-11-20T08:00:00.000Z",
  "type": "signOff",
  "object": "technical",
  "revision": "<technical-rev>",
  "upstream": {
    "requirements": "<requirements-rev>",
    "research": "<research-rev>"
  }
}
```

第二个例子要求前面已经存在一致的需求、调研确认，不能凭空填写前序版本。

生效规则：

- 用户必须明确接受对应准确材料，沉默、普通反馈、Git 提交都不是接受。
- 本阶段内容或前序版本变化后，旧确认不能用于新版本。
- 接受后还要将材料和确认事件同步到 primary，才能越过对应共识关口。
- 新事件不写 `decision`。历史 `decision: "confirmed"` 仅兼容读取，不改写旧事件。

### 5.2 候选：Agent 先提交，等待用户信号

**状态：候选，当前运行时不支持。**

`submit` 表示 Agent 已准备好准确版本，请用户 review；不代表用户同意。

| 业务字段   | 必需 | 定义                                           |
| ---------- | ---- | ---------------------------------------------- |
| `object`   | 是   | 本次提交的阶段                                 |
| `revision` | 是   | 本阶段准确材料版本；用户验收阶段为部署报告摘要 |
| `upstream` | 是   | 直接前序内容 revision；根节点为 `null`         |

单链为：

```text
requirements <- research <- technical <- cases <- tests <- user-acceptance
```

每个箭头只绑定直接前序的内容 revision，不是 submit
ID，也不重复完整 revision 向量。
非空值为 `sha256:` 加 64 位小写十六进制；`object` 唯一决定它属于哪个前序阶段。
材料范围沿用 5.1 的五个范围，但不再沿用旧格式的 `upstream` 对象结构。
根节点示例：

```json
{
  "version": 2,
  "id": "00000000000000000000000000000010",
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
  "version": 2,
  "id": "00000000000000000000000000000012",
  "at": "2026-11-20T07:50:00.000Z",
  "type": "submit",
  "object": "research",
  "revision": "<research-rev>",
  "upstream": "<requirements-rev>"
}
```

研究提交前，上述需求 submit 须已获配对 signOff 并同步。
technical 只保存 research revision，cases 只保存 technical revision，
tests 只保存 cases revision。
checker 按事件顺序，在提交时从当时有效确认的前序请求解析完整内容依赖链；
当前校验时递归比较全部祖先 revision，不只比较直接前序的材料摘要。
该上下文从历史推导，不在事件里再存一份版本向量。

### 5.3 候选：`signOff` 只引用对应请求

先记录 submit，再向用户展示其准确材料并等待信号。
**仅在用户明确接受后**追加配对 signOff：

```json
{
  "version": 2,
  "id": "00000000000000000000000000000011",
  "at": "2026-11-20T07:45:00.000Z",
  "type": "signOff",
  "submit": "00000000000000000000000000000010"
}
```

除通用字段外，只有一个必需业务字段 `submit`。
`object`、`revision`、`upstream` 都从被引用的 submit 读取，不能重复填写。

配对及失效规则：

- 引用仅限本 Idea 中更早出现的 submit，不允许孤立、前向、自引用、跨 Idea
  或重复配对；一条 submit 至多一条 signOff。
- 按阶段取最新 submit；只有材料版本仍准确、前序链仍是当前有效已确认链，
  且这条最新请求被明确接受，才形成有效确认。
- 新 submit 仍需自己的 signOff，旧 signOff 不自动批准新请求；
  但前序仅重新 submit，内容 revision 和完整依赖上下文均未变时，
  不因 submit ID 改变而作废下游 submission。
  前序新请求尚待确认或同步时先停在前序关口，确认同步后可继续使用内容链未变的下游。
- 任一祖先内容变化，依赖它的后续 submission 及 signOff 都失效，须重新提交确认。
  不能用后来同 revision、不同祖先上下文的请求替换旧依赖，让旧确认自动适用于新上下文。
  例如需求改变而 research 正文未改，旧 technical 也失效；
  research 在新需求下重新确认后，旧 technical 不能仅因 research
  revision 相同而复活。
- 用户尚未决定时等待，要求修改时迭代后重新 submit。
  旧请求迟到的接受信号不能套到新请求，也不能提前批量写出 submit 和 signOff。
- 材料、submit、signOff 都同步到 primary 后，才能越过对应共识关口；
  submit 可先同步，用户信号后的 signOff 可另行提交，不要求同一 Git 提交。
- 新格式不写 `decision`，事件记录真实信号，不构成用户身份认证。
- 历史 v1 signOff 保持原字节和旧语义，不补写虚构 submit；
  要按候选规则推进，须重新建立五个共识的配对链，新旧格式不混算。
  进入新格式后不再新增旧式 signOff 或 verify，也不自动迁移固定 Check/CAR。

### 5.4 候选：用户体验验收也使用同样的配对

部署及 Agent 手工自验通过并同步后，Agent 先 submit 交付，再请用户实际操作：

```json
{
  "version": 2,
  "id": "00000000000000000000000000000013",
  "at": "2026-11-20T08:45:00.000Z",
  "type": "submit",
  "object": "user-acceptance",
  "revision": "<state.deployment>",
  "upstream": "<tests-rev>"
}
```

用户明确接受后，signOff 只引用这条请求：

```json
{
  "version": 2,
  "id": "00000000000000000000000000000014",
  "at": "2026-11-20T09:00:00.000Z",
  "type": "signOff",
  "submit": "00000000000000000000000000000013"
}
```

不新增第六份内容 revision：submit.revision 绑定当前固定部署报告摘要，
报告最新 `start` 的 `implementation` 再绑定准确代码提交；upstream 仍只保存 tests
revision，
不另外携带一份实现版本向量。

用户未实际体验、仍在反馈或未明确接受时不能 signOff。
反馈和整改详情放材料文件；实现、部署或前序提交链失效时重新验收并 submit。
配对确认及最终同步都满足后才完成 Idea；仅记录确认事件不要求重新部署。

## 6. `verify`：记录一次验证

### 6.1 候选格式：每个阶段只保留一个 `rev`

**状态：候选，当前运行时不支持。** 这是后续设计采用的轻量格式：

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
  "version": 2,
  "id": "00000000000000000000000000000007",
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
  "version": 2,
  "id": "00000000000000000000000000000008",
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

候选设计要求：

1. 实现不存报告；部署始终使用 `evidence/deployment/report.jsonl`，
   不按环境或事件 ID 新建目录。
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

候选协议按阶段判断，不按环境聚合，也不能“挑最后一次成功”：

- 按日志顺序，分别取各阶段**最后一条 v2 验证**。
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

### 6.6 当前格式：事件内嵌完整批次

**状态：当前运行时仍使用此格式。** 候选协议中仅作为旧历史只读解释，
不自动转成新规则的通过证据。

```json
{
  "version": 1,
  "id": "0000000000000000000000000000000a",
  "at": "2026-11-20T08:20:00.000Z",
  "type": "verify",
  "batch": {
    "id": "implementation-windows-001",
    "phase": "implementation",
    "environment": "windows-node",
    "revisions": {
      "requirements": "<requirements-rev>",
      "research": "<research-rev>",
      "technical": "<technical-rev>",
      "cases": "<cases-rev>",
      "tests": "<tests-rev>"
    },
    "subject": "<exact-tested-commit-sha>",
    "results": [
      {
        "case": "I-LOGIN",
        "result": "pass",
        "evidence": [
          {
            "path": "evidence/implementation/login.log",
            "digest": "<login-evidence-digest>"
          }
        ]
      }
    ]
  }
}
```

与候选格式对比：

| 当前 `batch` 内容           | 候选处理                                       |
| --------------------------- | ---------------------------------------------- |
| `id`                        | 取消独立批次 ID，仍有通用事件 ID               |
| `phase`                     | 事件顶层                                       |
| `environment`               | 取消通用字段，具体条件放用例或报告说明         |
| `revisions`                 | 从已验收实现提交快照核对，不重复存入事件和报告 |
| `subject`                   | 实现事件的 `rev` 直接绑定准确提交              |
| 部署批次的 `implementation` | 部署报告绑定准确实现提交，不再是集合摘要       |
| `results` 与证据引用        | 实现不留副本；部署在固定报告逐项记录手工结果   |

当前批次 ID 在 Idea 历史中唯一，最长 64 字符，以字母数字开头，之后允许字母数字、
点、下划线和连字符。部署批次与示例结构相同，但 `phase` 为 `deployment`，
且必须增加 `implementation`；实现批次不得增加该字段。

历史事件保持原始字节，旧纯历史状态保持原语义，不改写已有摘要。
要按候选规则推进，必须重新执行自动化测试、记录 v2 实现验证，
再完成固定报告和 v2 部署验证；不把旧逐环境批次与新阶段记录混算。
开始使用新格式后不得新增旧格式 verify，新格式失败不能回退旧格式成功。

## 7. `setAlias`：修改别名

**状态：当前。** 业务字段只有必需的 `alias`。

```json
{
  "version": 1,
  "id": "00000000000000000000000000000004",
  "at": "2026-11-20T08:05:00.000Z",
  "type": "setAlias",
  "alias": "login-flow"
}
```

- 别名以小写字母开头，总长 1 至 64 字符，后续只允许小写字母、数字和连字符。
- `alias: null` 清除别名，不使用空字符串。
- 以最后一条设置为准；修改名称不代表确认需求或验收交付。

## 8. `setLanguage`：修改内容语言覆盖

**状态：当前。** 业务字段只有必需的 `language`。

```json
{
  "version": 1,
  "id": "00000000000000000000000000000005",
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

**状态：当前。** 业务字段只有必需、非空的 `reason`。
候选设计要求只写一句简短原因，详细背景留在材料文件中；当前 schema 没有新增的短句长度门槛。

```json
{
  "version": 1,
  "id": "0000000000000000000000000000000b",
  "at": "2026-11-20T09:10:00.000Z",
  "type": "abandon",
  "reason": "目标需求已取消，停止推进此 Idea。"
}
```

- 放弃是明确的生命周期决定，不能由 Agent 根据长时间无人回复自行推断。
- 不删除历史材料、事件或已发生的确认。
- 已放弃时不能再次放弃，也不能继续追加其他类型事实；先明确恢复。

## 10. `resume`：恢复已放弃的 Idea

**状态：当前。** 没有额外业务字段。

```json
{
  "version": 1,
  "id": "0000000000000000000000000000000c",
  "at": "2026-11-20T09:20:00.000Z",
  "type": "resume"
}
```

- 只能用于当前已经放弃的 Idea，需要明确恢复决定。
- 恢复不等于完成，也不抹去放弃事件。
- 恢复后按当前材料、有效共识、证据和同步状态重新推导停在哪一关，不强行回到第一关，
  也不强行继承已经失效的通过结果。

## 11. 哪些不是事件

当前和本候选都没有单独定义以下事件：

| 名称           | 实际处理方式                                       |
| -------------- | -------------------------------------------------- |
| `completed`    | 由全部适用关口、材料和同步事实推导，不手写完成标记 |
| `synchronized` | 根据准确 primary 观察、提交和材料状态判断          |
| `feedback`     | 用户反馈写在相关材料中，不自动转成接受             |
| `rejected`     | 用户未接受时继续迭代，不伪造 `signOff`             |
| `accept`       | 不新增此事件；候选使用引用 submit ID 的 `signOff`  |

`submit` 是本候选新增的正式事件，但当前运行时仍不支持。

**当前行为：** 有效实现与部署批次可使 reducer 返回 `completed`，
但 Idea Task 仍要求通过实际的同步检查。

**候选行为：** 部署和 Agent 自验通过后进入 `user-acceptance`；
用户未明确接受则等待或修改。确认有效但未同步时为
`synchronization`，`next` 为 `user-acceptance`；确认及最终同步都满足后才完成。

## 12. 一次完整推进如何串起来

下面是候选流程示意，箭头之间仍需完成对应材料与 primary 同步：

```text
created
  -> submit(requirements) -> 等待用户 -> signOff(该 submit)
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
       -> 明确接受：signOff(该 user-acceptance submit)
  -> 最终同步
  -> 推导为 completed
```

`setAlias`、`setLanguage` 是独立的元数据变化，不是必经共识关口。
放弃后通过 `abandon -> resume` 保留往返历史，不删除事件“回滚状态”。

检查器核验的是事件、版本和证据之间的绑定；它不能仅凭一个
`signOff` 证明用户真实身份，也不能仅凭一份报告证明测试一定真实执行。
Agent 必须如实记录用户决定与验证事实，不能把“结构校验通过”当成“事实已经发生”。
