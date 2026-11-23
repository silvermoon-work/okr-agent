# Silvermoon Events：平级文件夹与统一 Checkpoint 生命周期

本文记录已批准并接入当前源码的模型，与
[Idea Check 设计](./silvermoon-idea-check-design.yaml)及
[生成的运行时 Spec](./silvermoon-single-checker.yaml)配套。
[原候选](./silvermoon-idea-check-candidate.yaml)是设计历史，不是新数据契约。
构建候选不代表发布、安装、用户接受或迁移既有 Idea。

## 1. 标准化与推进分离

每次观察先检查设备、项目、Git 根/关联分支/洁净性、primary 配置与同步、
安全容器及选中 Idea 的协议和历史。标准化前提不记录 submit/accept。
合法内容改变导致旧版本失效是正常推进退化，不是数据损坏。
Check 不自动安装、提交、推送、部署、删除或执行项目代码。

**Check 的机器边界只有**：事件标记状态、当前 revision/upstream 与仓库匹配、
接受模式、历史/协议、标准化和同步。**不判断**测试、CI、报告真实性、
用例完整性、受测代码或声明的 commit/path 绑定。
Agent 仍须完成实际验收；机器通过不能代替这些责任或真实用户决定。

## 2. 七个平级材料文件夹

```text
.silvermoon/i/<id>/
├── events.jsonl
├── requirements/
├── research-scope/
├── technical-spec/
├── test-scope/
├── test-spec/
├── implementation/
└── deployment/
```

新 Idea **没有 idea.json**。created 是身份来源，不另设 bootstrap 文件、
ledger、嵌套 worlds、独立 user-acceptance 或机器用例索引。
七个文件夹必须安全、可读且能测量版本；允许同文件夹附件和支持文档。
`Spec.md` 是创建时提供的主要入口与编写提示，不是强制模板或详尽内容门禁。
材料文件的路径、Git mode 与原始内容参与版本，不通过模板填满或占位文案证明验收。

| Checkpoint / object | 名词标题   | 直接前置       | 默认模式  |
| ------------------- | ---------- | -------------- | --------- |
| requirements        | 需求规格   | 无             | consensus |
| research-scope      | 调研范围   | requirements   | consensus |
| technical-spec      | 技术规格   | research-scope | consensus |
| test-scope          | 测试范围   | technical-spec | consensus |
| test-spec           | 测试规格   | test-scope     | delegated |
| implementation      | 实现交付物 | test-spec      | delegated |
| deployment          | 部署交付物 | implementation | consensus |

项目可配置：

```yaml
checkpointAcceptance:
  test-spec: delegated
  implementation: delegated
```

严格限制为上述七个键和 consensus/delegated 值；未知键/值失败。
缺省项采用表中默认值，不把标准化前提配置成委托关口。
生效政策必须来自本次已验证、已同步的项目配置；不得在等待用户时自行提权。
consensus 仅认可 authority=user；delegated 认可 user/delegate。
收紧政策自然使旧 delegate 接受失效，须取得当前版本的用户接受；
历史 authority 不得改写。放宽政策不自动生成接受。
接受来源是事实，不是身份认证；委托也不授权生产、发布、付费或删除。

## 3. Revision 是真实文件夹 Git tree ID

每关 revision **就是该平级文件夹的实际 Git TREE ID**。
upstream **就是直接前置文件夹的实际 Git TREE ID**，根 requirements 为 null。
使用仓库对象格式的完整小写 ID：SHA-1 为 40 位、SHA-256 为 64 位。
不缩写、不加 sha256:，不把 commit、blob 或任意 JSON 摘要当成文件夹版本。

**没有合成 material/upstream 树，没有递归嵌入依赖或额外 Git refs。**
前置改变时，本关文件夹 tree ID 可以不变；upstream 与历史上下文判定失效。
祖先本身无效时依次停在首个 owning 关口，不能用相同本地树复活旧接受。
事件位于文件夹外；仅追加事件或改变提交 SHA 不改变材料树。

已提交快照读取 Git ls-tree 的真实 tree/object ID 和 mode，并核对文件夹版本。
暂存/工作区读取相应候选，以标准 Git blob/tree 编码、原始二进制对象 ID、
Git 排序和文件 mode 确定性测量普通文件夹树，不写入对象或复合树。
Windows 不提供 POSIX 执行位或 Git core.fileMode=false 时，保留已跟踪文件的 index
mode；
未跟踪普通文件默认 100644。读取保护路径、容量、UTF-8 和并发身份。

## 4. 最小事件与完整 tuple

仅支持 created、submit、accept、setAlias、setLanguage、abandon、resume。
没有事件 id/version/$schema，不新增 signOff/verify/rollback/completed 事件。
以下 JSON 展开只便于阅读，实际日志使用规范单行：

```json
{
  "at": "2026-11-23T05:00:00.000Z",
  "type": "created",
  "idea": "202611230500abcd",
  "eventSchemaCid": "<trusted-schema-cid>",
  "language": "zh-CN"
}
```

created 第一条且唯一，idea/at/eventSchemaCid 是不可变身份，language 可选。
at 为规范 UTC ISO 时间，与 ID 的 UTC 分钟匹配；创建不接受任何关口。

```json
{
  "at": "2026-11-23T05:10:00.000Z",
  "type": "submit",
  "object": "requirements",
  "revision": "<actual-requirements-folder-tree>",
  "upstream": null
}
```

```json
{
  "at": "2026-11-23T05:15:00.000Z",
  "type": "accept",
  "object": "requirements",
  "revision": "<actual-requirements-folder-tree>",
  "upstream": null,
  "authority": "user"
}
```

submit 必需字段仅 at/type/object/revision/upstream；
accept 同样完整 tuple，另加 authority=user|delegate。
**accept 必须匹配 submit 的 object/revision/upstream，不仅匹配本地 revision。**
非根记录要求历史中直接前置已有效接受；当前推进还要求前置版本、政策与同步有效。
孤立、前向、迟到的不同 tuple 接受失败。

相同 tuple 重复 submit 幂等，不清除匹配的 accept；不删除历史行。
不同来源的接受不能归并成虚构用户决定。最后不同候选不能被旧接受替代。
行顺序是事实顺序，不按 at 排序，at 不是唯一键。

setAlias 的 alias 是小写字母开头、总长不超过 64 的字母/数字/连字符或 null；
setLanguage 的 language 是规范 BCP 47 标签或 null。以最后设置为准。
null 清除覆盖，内容语言回退 Idea → project → user → en-US。
abandon 必需非空 reason，详细分析放材料；resume 无其他业务字段。
放弃后须先显式 resume，不能重复放弃或无放弃恢复。

## 5. Agent 的真实验收责任，不是机器谓词

### 实现（默认 delegated）

完成交付及自动化测试 → 在 implementation 支持文档记录**增/删/改了哪些
TEST CASES、提交到哪个 commit** → 测量 implementation 文件夹 →
submit(upstream=test-spec 文件夹 tree) → Agent 验证**包含该 commit 的本地
测试或 CI 通过** → accept(authority=delegate) → 同步并重新观察。

细节留在 `implementation/Submission.md` 等支持材料，**不写进 event body**。
不发明 tracked-declaration Schema、scope paths、测试进程或 CI 机器检查。
Check 不校验上述声明的真实性、覆盖完整性或 commit/path 绑定。
失败、阻塞、未执行时 Agent 不能声称验收完成；consensus 时由用户明确接受。

### 部署（默认 consensus）

实现接受并同步 → 按已有授权部署 → Agent **自验实际部署结果**并记录所需材料 →
submit(deployment, upstream=implementation 文件夹 tree) →
向用户提供准确交付和操作入口 → **用户实际操作、明确接受** → accept(deployment,
authority=user) → 最终同步。

用户体验验收就是 deployment 的 accept，**没有 user-acceptance 独立关口**。
报告格式、用例列表、轮次、结果和真实性不是 Check 谓词；
新模型不强制固定 report.jsonl、start/case Schema 或“全部 pass”机器判定。
报告与附件可存在 deployment 文件夹，任一文件变化自然改变部署 tree。
项目显式委托 deployment 时机器政策可认可 delegate，但默认提示和流程仍要求
真实用户 hands-on 明确接受，Agent 自验不得冒充用户决定。

## 6. 顺序 measure 与自然退化

依次检查：前置有效 → 最新 submit 匹配当前文件夹 revision/直接 upstream →
完整 tuple 的 accept 被当前政策认可 → 材料及有效事件同步到 primary。
只报告首个 owning checkpoint 的 submit、accept 或 synchronization 小阶段。

| 观察                               | 动作                                            |
| ---------------------------------- | ----------------------------------------------- |
| 标准化失败                         | 修复前提后重新观察                              |
| 无提交、文件夹或前置变化、祖先无效 | 从首个 owning 关口重新 submit                   |
| 有当前提交、无认可接受             | consensus 请求用户；delegated 实际验收后 accept |
| 当前接受未同步                     | 同步准确材料和事件，重新观察                    |
| 七关有效且同步                     | completed                                       |

需求变化时 research-scope 本地 tree 可以不变，但 upstream 变了；
先重新接受需求，再重新提交调研；即使下一关直接前置本地 tree 相同，
其历史前置上下文已无效，不能沿旧接受跳过。
相同内容/依赖/上下文的重复提交不重置接受，不因事件提交次数触发回滚。
政策收紧仅退化至 accept，不要求伪造内容变化。

## 7. created-first 信任、规范化及安全

先用**固定、最小且有界** reader 读取第一条 created 的 idea、at、
eventSchemaCid、可选 language，再按其声明的**已知可信不可变 Schema**
校验**整个日志，包括 created 自身**。未知/不可用 Schema 明确失败，
不联网获取可变远程 $ref，不 fallback 最新 Schema，不混同执行 CID。

自包含 Draft 2020-12 Schema 使用
[RFC 8785/JCS](https://www.rfc-editor.org/rfc/rfc8785)：
ECMAScript 数值/字符串序列化、递归 UTF-16 键序、数组保序，
拒绝非有限数值和孤立 surrogate，UTF-8 无 BOM/末尾换行 → SHA-256 → CIDv1(raw
0x55, sha2-256 0x12) → 小写无填充 base32。
实现对照 RFC 的规范及测试向量；不是普通 stringify 冒充 JCS。
date-time 断言及规范时间、语言、身份、历史另按受控规则校验。

精确 Schema 构建为 `packages/silvermoon/dist/event-schema.json`，
其 CID 在同目录 `event-schema.cid`；Idea/提交 CAR 离线包含
`resources/schemas/events.json` 的精确规范字节。
运行时可信 Schema 与历史 Schema 各自独立，不以旧 checkCid 替代 eventSchemaCid。
Check 的真实执行 CID 在报告中单独记录。

events.jsonl 为规范 UTF-8/JCS、LF、一行一个完整 JSON、最终换行；
拒绝 BOM、重复键、未知字段、空行、半行或无效编码。
独立上限 1 MiB/4096 行；候选整体沿用 16 MiB/2048 文件上限。
保留 primary 的原始字节前缀与 created 身份；
取消、并发变化及意外 I/O 不能当作通过。不得截断历史绕过容量。

## 8. 历史与迁移边界

已有 idea.json + checkCid/id/version、旧 signOff/verify 或批次报告的 Ideas，
保留原格式、原语义和原 CID，仍可读、可执行原数据/快照检查。
旧机器证据规则仅留在原契约，**不应用于新平级文件夹协议**。
导航必须显式迁移；不自动转换，不重命名 checkCid，不合成缺失 submit/accept，
不新增旧格式事件或用旧协议推进新关口。本轮不实施迁移。
旧 `.silvermoon/ideas`、历史 CAR 和验收记录继续保持历史身份。

提交合法性检查和 Idea 推进是独立 Task；前者允许未完成 Idea，
检查相应 staged/worktree/commit 候选和 append-only 历史，不要求业务完成。
先 check-changes --worktree，再 --staged；Git 写入/发布/部署须有各自授权。
