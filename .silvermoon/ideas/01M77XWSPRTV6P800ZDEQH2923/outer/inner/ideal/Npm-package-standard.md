# npm 包项目的固定共性标准

本文是 [Idea.md](./Idea.md) 的 supporting document。先完成
[TypeScript 固定标准](./Requirements.md)，再实现本标准；表中要求不是可选建议或调用方可覆盖配置。

## N-01: 对象与定位

- 名称为
  `@silvermoon-work/check.npm-package-project`，私有作者包，仅交付标准 CAR/CID。
- 对象为一个使用 TypeScript 编写、面向 npm 交付的单包 ESM 项目。这是本标准的类别边界，不冒充所有 JavaScript、CommonJS、双格式或 monorepo 发布模型的统一标准。
- 输入为 `{ "projectDirectory": "<执行机绝对目录>" }`，与其他 Project
  Check 使用统一闭合输入。没有 context 包装、projectScopes、requirements、publication.stage、moduleFormat、阈值或跳过开关；旧包装和额外字段明确拒绝。
- 不支持的项目类别明确报告范围无法确认，不悄悄挑选一个 workspace 包或只检查根后声称整个仓库通过。
- 不要求通过 git-lineage 继承 preset；相同项目事实及相同有效发布元数据得到相同结论。后续上游发版可正常改变版本新鲜度结论。

## N-02: 继承的 TypeScript 共性

父 Bundle 以 imports 固定新版 TypeScript Project
Check 的准确根 CID，通过 SpaceRef 直接传递同一个 `{projectDirectory}`
对象，不传范围筛选或任何政策参数。成员范围由项目声明与对应标准决定，不由父调用者任意枚举或排除。

必须完整满足其长期标准：pnpm 精确锁定并跟进所选 major 内最新稳定 minor.patch、lockfile 与冻结安装、严格类型检查及五项安全选项、源码和测试的类型感知 lint、只检查的格式校验、非 watch 测试、四项至少 90 的覆盖率与未触达文件、传播失败的聚合门禁，以及 PR/main
CI。pnpm 新鲜度规则直接复用子 Check，不在父级重复定义阈值或维护另一套版本查询。

父标准不得关闭子领域、降低阈值、替换子实现或复制子源码来绕过组合。

## N-03: npm 特有共性清单

| 领域               | 必须满足的具体要求                                                                                                                      | 不作为证明的替代物                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 包身份             | 合法且非模板占位的 name、有效 SemVer version；非空 description、有效 keywords；声明明确 engines.node                                    | 目录名、模板来源或 README 自称可发布                 |
| 来源与文档         | 明确 license；README 与 LICENSE 存在且非空；repository、homepage、bugs 为可解析的项目地址且不残留原模板身份                             | 强制 MIT、特定组织名或同一段模板文本                 |
| ESM 与公共入口     | type 为 module；根 exports 提供 ESM import 与 types 入口，路径均为包内合法交付路径；若保留 main/types，必须与根 exports 一致            | 只有 main 或只有声明后缀就推断完整 ESM/类型交付      |
| 公共元数据入口     | exports 显式允许读取本包 package.json，映射到实际元数据文件                                                                             | 因 npm 必带 package.json 就推断 exports 已开放       |
| 声明生成           | 已连接的构建配置生成 ESM JavaScript、类型声明，源码纳入构建；不是 noEmit 类型检查冒充 build                                             | 构建脚本名称叫 build、已有 dist 或仅声明 types       |
| 映射生成           | 构建配置开启 JS sourceMap 与 declarationMap，映射及其所需源码按明确策略进入交付                                                         | 有 map 开关但 files 排除 map，或忽略映射来源可达性   |
| 发布文件           | package.json 使用明确 files allowlist，包含入口、声明、映射、必要源码/资源和 README/LICENSE；开发测试、缓存及本地秘密配置不纳入交付选择 | 仅存在 dist 目录、假定打包器会自动补齐任意文件       |
| 包校验门禁         | publint 已声明为依赖，有实际调用入口，且在成功构建后连接到聚合质量门禁；构建/包校验失败不能被吞掉                                       | 任意同名脚本、自称校验的未知 node 脚本               |
| 打包准备           | 静态可证明正常 pack/publish 路径会先得到经过检查的构建输出；支持明确 prepack 或发布链路中的等价顺序                                     | 以旧输出存在代替准备流程，或真的执行目标 hooks 验证  |
| 发布配置           | publishConfig.access 为 public，显式公开 npm registry 目标且不含凭据；它不限制开发机安装源                                              | 将本机镜像偏好写成所有项目发布源政策                 |
| CI 兼容矩阵        | 项目声明 Node 支持范围；CI 覆盖其最低可运行 Node 及至少一个更高受支持版本，执行标准质量门禁                                             | 固定要求某个历史 Node 小版本或臆测线上 CI 已成功     |
| 发布触发与身份保护 | 标签触发与 package version 精确绑定；拒绝未初始化身份及 private 包；发布提交须可达主分支；校验错误使流程失败                            | 只检查工作流文件名或出现 v* 文本                     |
| 发布前检查         | 实际发布前接入冻结安装、质量检查及已有 npm 版本保护；只有明确版本不存在才允许继续，查询故障不得当不存在                                 | 把任何 npm view 失败当成 E404/可发布                 |
| Trusted Publishing | GitHub Actions 发布 job 具备 id-token:write、明确 environment、必要读取权限，使用支持 OIDC 的 npm 客户端，不依赖长效 npm token          | 声称 npm 网站 Trusted Publisher 登记和线上权限已验证 |
| 发布非写入模式     | 手动 workflow_dispatch 仅 dry-run，不执行真实发布；预发布与稳定版本的 dist-tag 路由一致，不把 prerelease 发到 latest                    | 把一次 dry-run 成功当作权限或发布成功                |

### 标准不是模板逐字复刻

- 默认交付目录不必叫 dist，脚本名不必固定，工作流文件名不必固定；检查实际入口、输出路径和调用连接。
- 第一版优先覆盖 preset 的 tsc、publint、pnpm 与 GitHub
  Actions 可静态证明语法；未知构建器/动态表达式不编造结论，报告 unconfirmed，并说明支持边界。
- 上述发布保护是目标安全语义；若原 preset 的 shell 将所有 registry 查询失败当成版本不存在，应报告问题，而不是为保证模板通过降低标准。
- source/declaration
  maps 要求针对完整可用映射配置。若模板排除其引用的源文件，应指出该问题；不能因为源于 preset 就豁免。
- Dependabot 可作为后续维护标准讨论项，本次不要求其存在；它不是判定单包 ESM
  npm 工程交付与发布配置完整的必要条件。

## N-04: 开发准备不等于发布就绪

- 基础项目标准允许
  `private: true`，因为私有保护可以避免开发阶段误发布；必须验证发布流程会在 private 为 true 时拒绝发布。
- 不通过 input 选择 prepared/ready。真正的“本次可以发布”需要精确制品、权限、版本和 CI 证据，属于独立发布就绪验证，不在本 Check 范围。
- name/version 需是项目有效身份，但不要求为了检查项目就先开放发布或在 npm 注册该名称。
- 不运行 build、pack、publint、install、测试、CI 或 publish；仅允许标准规定的发布元数据查询，不能由此声称目标包名可注册、版本可发布、OIDC 权限已配置或 registry 功能兼容性已实测。静态无法确认时明确指出，不执行目标逻辑补证。
- Node 默认使用受支持 LTS 是工具链最佳实践方向，但不应机械转成“npm 库只允许 LTS 用户”的 engines 限制；项目的消费者兼容范围与开发工具链默认选择是不同事实，见
  [维护不变量](./Maintenance-invariants.md)。

## N-05: 组合结果与参考文档

- 子正常不通过使父级整体不通过，保留可定位的子身份、具体问题、brief 和对应参考文档；不能只给一个摘要问题而丢弃子诊断。
- 子执行故障或取消保持执行故障，不被父级包元数据问题覆盖。
- 用 IPFS 输出文件树保留子文档归属，文档路径必须相对于对应的真实输出根解析；不得把子相对路径冒充父路径，或把业务 JSON 中的 CID 字符串当成实际 DAG 链接。
- 只扩展完成这一实际用例所需的 SDK/结果与输出链接能力，精确契约在实施前定稿，并有兼容和真实消费验证。上游若尚缺公开能力，明确协调，不伪造子输出身份或私自 monkeypatch
  Engine。
- 不在本次构建任意深度政策系统、自动修复、全量 presets 迁移或通用配置继承语言。

## N-06: 最小验收场景

1. 非 lineage 派生但满足标准的单包项目通过；目录/脚本等已支持的等价变化不因不长得像模板而失败。
2. 子 TypeScript 标准失败，父结果保留子具体问题及可读文档；两个 Check 都只接受顶层 projectDirectory，不能通过 context、scopes 或 npm 层政策输入覆盖子标准。
3. 分别制造入口/声明/构建路径冲突、map 交付不完整、publint 未接门禁、OIDC/token/标签/private/registry 查询保护缺陷，得到具体问题或有依据的无法确认。
4. 开发中 private 包符合其余配置可通过，发布流程允许 private 直接发布则不满足；不连接 npm 权限或实际发布。
5. 父子 Task 的准确 CID、导入 DAG、执行故障和取消传播，以及父子文档从真实输出读取均有真实 Engine 证据。
6. 单独消费准确 CAR 不依赖作者仓库或隐含安装，不声称未验证平台、在线权限或真正 tarball 正确。
7. 复用的 pnpm 维护检查随同 major 稳定版本发布而正确变化；元数据不可用不能被父级吞掉或只显示过时通过，父子证据使用同轮明确观测依据。
