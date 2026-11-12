# npm 包项目的固定共性标准

本文是 [Idea.md](./Idea.md) 的 supporting document。先完成
[TypeScript 固定标准](./Requirements.md)，再实现本标准；表中要求不是可选建议或调用方可覆盖配置。

## N-01: 对象与定位

- 名称为
  `@silvermoon-work/check.npm-package-project`，私有作者包，仅交付标准 CAR/CID。
- 对象为使用 TypeScript 编写、面向 npm 交付的 ESM 项目，支持根单包与 pnpm
  workspace 中实际 npm 交付包；不冒充纯 JavaScript、CommonJS、双格式或任意未验证发布模型的统一标准。
- 输入为 `{ "projectDirectory": "<执行机绝对目录>" }`，与其他 Project
  Check 使用统一闭合输入。没有 context 包装、projectScopes、requirements、publication.stage、moduleFormat、阈值或跳过开关；旧包装和额外字段明确拒绝。
- 包范围来自 workspace 声明、包元数据与明确发布映射，根聚合器不自动当作待发布包，私有应用也不被强制发布。不接受调用方挑选包名；声明冲突、没有可识别的 npm 交付目标或不支持的类别明确报告范围无法确认，不悄悄选一个包后声称整个仓库通过。
- 不要求通过 git-lineage 继承 preset；相同项目事实及相同有效发布元数据得到相同结论。后续上游发版可正常改变版本新鲜度结论。

## N-02: 继承的 TypeScript 共性

父 Bundle 以 imports 固定新版 TypeScript Project
Check 的准确根 CID，通过 SpaceRef 直接传递同一个 `{projectDirectory}`
对象，不传范围筛选或任何政策参数。成员范围由项目声明与对应标准决定，不由父调用者任意枚举或排除。

必须完整满足
[六类基础项目实践](./Project-practices.md)：默认开发 Node 的 LTS 声明、pnpm 与开发工具同 major 新鲜度、依赖声明及 lockfile/peer 一致性、类型/lint/格式/测试与覆盖率、Agent 标准脚本、适用 CI、文档结构和成员覆盖。新鲜度规则复用子 Check，不在父级维护另一套版本查询或阈值。

父标准不得关闭子领域、降低阈值、替换子实现或复制子源码来绕过组合。

## N-03: npm 特有共性清单

| 领域               | 必须满足的具体要求                                                                                                                                        | 不作为证明的替代物                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 包身份             | 合法且非模板占位的 name、有效 SemVer version；非空 description、有效 keywords；声明明确 engines.node                                                      | 目录名、模板来源或 README 自称可发布                          |
| 来源与文档         | 明确 license；README 与 LICENSE 存在且非空；repository、homepage、bugs 为可解析的项目地址且不残留原模板身份                                               | 强制 MIT、特定组织名或同一段模板文本                          |
| ESM 与公共入口     | type 为 module；根 exports 提供 ESM import 与 types 入口，路径均为包内合法交付路径；若保留 main/types，必须与根 exports 一致                              | 只有 main 或只有声明后缀就推断完整 ESM/类型交付               |
| 公共元数据入口     | exports 显式允许读取本包 package.json，映射到实际元数据文件                                                                                               | 因 npm 必带 package.json 就推断 exports 已开放                |
| 声明生成           | 已连接的构建配置生成 ESM JavaScript、类型声明，源码纳入构建；不是 noEmit 类型检查冒充 build                                                               | 构建脚本名称叫 build、已有 dist 或仅声明 types                |
| 映射生成           | 构建配置开启 JS sourceMap 与 declarationMap，映射及其所需源码按明确策略进入交付                                                                           | 有 map 开关但 files 排除 map，或忽略映射来源可达性            |
| 发布文件           | package.json 使用明确 files allowlist，包含入口、声明、映射、必要源码/资源和 README/LICENSE；开发测试、缓存及本地秘密配置不纳入交付选择                   | 仅存在 dist 目录、假定打包器会自动补齐任意文件                |
| 包校验门禁         | publint 在适用包或共享根 devDependencies 声明，lockfile 实际解析符合新鲜度与兼容政策；标准 build、lint:package 实际连接到 check，先构建再校验，失败不吞掉 | 任意同名空壳脚本、自称校验的未知 node 脚本                    |
| 打包准备           | 静态可证明正常 pack/publish 路径会先得到经过检查的构建输出；支持明确 prepack 或发布链路中的等价顺序                                                       | 以旧输出存在代替准备流程，或真的执行目标 hooks 验证           |
| 发布配置           | publishConfig.access 为 public，显式公开 npm registry 目标且不含凭据；它不限制开发机安装源                                                                | 将本机镜像偏好写成所有项目发布源政策                          |
| CI 兼容矩阵        | 项目声明 Node 支持范围；CI 覆盖其最低可运行 Node 及至少一个更高受支持版本，执行标准质量门禁                                                               | 固定要求某个历史 Node 小版本或臆测线上 CI 已成功              |
| 发布触发与身份保护 | 标签准确映射目标包与版本，目标 manifest 和实际交付 tarball 身份完全匹配；拒绝未初始化身份及 private 包；发布提交须可达主分支；校验错误使流程失败          | 只检查文件名、v* 文本或 monorepo 根版本                       |
| 发布前检查         | 实际发布前接入冻结安装、质量检查及已有 npm 版本保护；只有明确版本不存在才允许继续，查询故障不得当不存在                                                   | 把任何 npm view 失败当成 E404/可发布                          |
| Trusted Publishing | GitHub Actions 发布 job 具备 id-token:write、明确 environment、必要读取权限，使用支持 OIDC 的 npm 客户端，不依赖长效 npm token                            | 声称 npm 网站 Trusted Publisher 登记和线上权限已验证          |
| 版本与 channel     | 稳定 x.y.z 显式发布 latest；预发布 x.y.z-rc.n 显式发布 rc，n 从 0 连续递增；不使用其他发布 channel，拒绝其他预发布格式和 build metadata                   | 省略 --tag、使用 next/beta/canary 或将 prerelease 发到 latest |
| 发布非写入模式     | 手动 workflow_dispatch 只验证同一制品，使用 dry-run，不发布、不变更 dist-tag 或仓库版本；不以临时 channel 绕过 latest/rc 政策                             | 把一次 dry-run 成功当作权限或发布成功                         |
| 多包目标隔离       | 版本标签与包映射唯一一致，逐个明确发布目标；构建依赖不等于获准发布依赖，不意外批量发布或使用聚合根版本冒充成员版本                                        | 每包复制 workflow、自动发布整个 workspace                     |

### 标准不是模板逐字复刻

- 默认交付目录不必叫 dist，工作流文件名与辅助脚本名不固定；面向 Agent 的标准动作名按基础规范保留，npm 层增加 build、lint:package，并检查实际入口、输出路径和连接。多包允许根调度成员能力，不要求逐包复制全部动作。
- 第一版优先覆盖 preset 的 tsc、publint、pnpm 与 GitHub
  Actions 可静态证明语法；未知构建器/动态表达式不编造结论，报告 unconfirmed，并说明支持边界。
- 上述发布保护是目标安全语义；若原 preset 的 shell 将所有 registry 查询失败当成版本不存在，应报告问题，而不是为保证模板通过降低标准。
- source/declaration
  maps 要求针对完整可用映射配置。若模板排除其引用的源文件，应指出该问题；不能因为源于 preset 就豁免。
- Dependabot 可作为后续维护标准讨论项，本次不要求其存在；它不是判定 ESM
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
8. 稳定/RC 正确路由以及其他 channel、非法 RC 序号/后缀、缺少 --tag、tag/manifest/tarball 版本不符均有反例；历史查询故障不得被伪装成序号合法或可发布。
9. 单包、一个 workspace 发布包及多个发布包按同一规则判断；根私有聚合器和应用不误当交付包，目标映射不能错选或隐式批量发布。

## N-07: latest/rc 固定发布政策

| 类型              | 唯一允许的版本形式                                  | 唯一发布 channel |
| ----------------- | --------------------------------------------------- | ---------------- |
| 稳定版            | 规范 SemVer `x.y.z`，数字段无多余前导零             | `latest`         |
| Release Candidate | `x.y.z-rc.n`，n 为从 0 开始的非负整数，无多余前导零 | `rc`             |

- 不采用 next、beta、canary 或其他真实发布 channel；不允许其他预发布后缀或 build
  metadata。遗留 registry
  tag 的存在不等于当前 workflow 仍向其发布，不因历史标签存在直接失败。
- 版本标签中的完整版本、目标包 package.json 和最终实际发布 tarball 的 name/version 必须完全一致，RC 后缀不能被丢弃。单包可用 v<version>，多包需有无歧义的包标识映射，不强制某一具体标签前缀。
- 发布命令显式选择 channel；仅依赖默认 latest 或声明 publishConfig.tag 而实际流程会覆盖/漏传时不能证明正确。
- 对同一目标 x.y.z，首个 RC 为 .0，后续为上一次已发布 RC 的下一个整数；不同目标版本重新从 .0 起步，不因稳定版或其他包 RC 计数而混淆。
- 版本格式和 channel 路由从配置静态验证；RC 连续性、版本未发布及确切 CI 成绩是历史/外部事实。项目 Check 要求发布门卫配置这类验证，但不能只凭当前 manifest 声称序号或本次发布已经核实。
- 历史或 registry 查询只把明确、可信的不存在当不存在，网络/认证失败或不完整历史必须阻断发布，不允许跳号、覆盖已有版本或查询失败继续。
- 仅发布主分支可达的准确提交，发布前冻结安装与统一质量门禁有效。可使用已证明的精确提交 CI，不能以别的 SHA 检查成功替代。
- 实际发布选定包只 pack 一次、校验和发布同一 tarball；不以校验 A 制品后重新打包 B 的方式破坏身份保证。
- workflow_dispatch 永不真实发布，不改 dist-tag 或仓库版本；dry-run 仍根据制品真实版本选择 latest/rc，不创建临时真实发布通道。
- 多包发布明确一次选定包身份和版本，依赖必须已有可解析的匹配发行版；Check 观察这类配置，不自动发布依赖或任何包。

## N-08: Workflow 责任边界

- TypeScript 基础 Check 检查 GitHub 来源及 PR/主分支质量 CI；npm
  Check 在同一项目上增加实际 npm 交付目标的发布 workflow。
- 私有应用和纯聚合根没有 npm
  workflow 不构成基础标准失败；npm 项目 Check 若未能识别交付目标，明确报告类别/范围问题而不是给空通过。
- GitHub 多包项目可共享一个 workflow，必须验证其包映射、成员门禁与对应制品，不要求每包各一个 YAML。
- 非 GitHub 或无法确认来源的目标不能被宣称已验证 GitHub Trusted
  Publishing；按明确适用性报告，不因为省略 origin 就静默豁免。
