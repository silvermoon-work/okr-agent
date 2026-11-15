# 检测树规划与迁移边界

## 选择：通用项目骨架 + package 与 deliverable 两条职责轴

普通 Node.js/npm 生态项目与 Cloudflare 项目不是仓库级互斥类别。
一个 workspace 可以同时包含 npm 库、Cloudflare 应用、私有工具和 Task Bundle。
所有适用代码包接受通用维护检查，只有明确声明的交付单元接受对应专项。
“使用 npm 依赖”不等于“交付 npm 包”；Cloudflare 应用也可能需要 TypeScript、
lint 和测试。当前两个 Check 作者项目均保持私有 Task Bundle，SDK 保持 npm 库，
不能因为新增 Cloudflare 分支就把检测运行时迁到 Cloudflare。

`check.typescript-project` 是项目级统一入口，负责通用检查、目标发现和所有
已支持 deliverable 类型的分派。各类型的专项规则保持独立 TargetChecker，
不为 npm、Cloudflare 等类型复制整套项目 checker；SDK 只提供编排，不内置
平台规则。未来类型沿相同注册边界扩展，本轮不因此新增尚未支持的专项。

沿用根 `silvermoon.yaml` 的显式 deliverables 与 pnpm workspace 成员声明。
不从 `private`、目录名、Wrangler 文件或发布脚本自动授权交付；这些只能作为
缺失/矛盾声明的证据。保留现有开放类型语义，未知类型不自动套用 npm 或
Cloudflare 规则，也不能被描述为该平台已验证。

## 统一编排语义

目标为 `{ type, selector }`；类型标识可复用检测职责，selector 标识执行范围，
不装载任意可执行配置、秘密或调用方自报的探测结论。根为
`{ type: "$root", selector: Parameters }`。checker 通过闭包使用本次执行的
受限上下文和读取/探测服务，selector 的结构需类型安全地校验或收窄。

成功返回有序子 targets，空数组代表叶节点；失败返回非空 problems。
串行 DFS，只剪去该节点无法可靠展开的子项，汇总其他可达分支的问题。
`pass: false` 是分支阻断，不是全局立即结束；非法输入、未知类型、意外 I/O、
取消、执行协议或清理故障继续属于执行故障。保留现有 missing/mismatch/unconfirmed
业务归因，不将任何未知事实默认为成功。

一个节点只承载足以证明其子项可检查的前置条件，不把全部领域规则合成
“项目合格”总闸门。规则失败若不妨碍其他事实读取，就应是叶节点，而非其兄弟的父节点。
共享事实可按本次 Run 复用，但不能用全局 failures 或某个兄弟的执行顺序隐式调度。
同一配置根因仍应按既有行为归并，并保留受影响成员范围；不靠删除独立发现来减少问题。
不预设跨路径 target 去重、并行调度或持久缓存；生成有限检测树，避免循环展开。

## TypeScript 项目 Check：先确定范围，再按职责展开

以下为职责层级，不是预先固定全部类型名称或文件拆分：

```text
$root（现有 projectDirectory）
└─ 项目目录可读取、安全范围可确定
   ├─ 根文档 / Agent 约定 / 忽略规则
   ├─ 项目与 workspace 拓扑可确定
   │  ├─ 根级工具链、catalog、lockfile 与统一运行时关系
   │  ├─ package（每个适用成员，包括单包根）
   │  │  └─ manifest 可读取、可解析，职责可确定
   │  │     ├─ engines 与依赖声明
   │  │     ├─ scripts 入口与执行职责
   │  │     ├─ TypeScript 配置可解析 → strict 与源码/测试范围
   │  │     ├─ ESLint 配置可解析 → 类型感知与匹配范围
   │  │     └─ Vitest 配置可解析 → 单次测试、覆盖范围与四项门限
   │  └─ 根级格式检查与质量 CI（只依赖各自必要事实）
   └─ 交付声明可读取、可解析，路径与成员关联可信
      └─ deliverable（逐项，并确认其必要 package 事实）
         ├─ npm → 包身份、ESM/types/allowlist、发布工作流及门卫
         ├─ cloudflare → 既有有界 Wrangler、入口、绑定、测试/部署职责检查
         └─ task-bundle / 其他开放类型 → 保持既有适用范围
```

根 package 同时可能承担聚合与代码职责；纯聚合 manifest 不套用代码包
engines 最低值比较，private 代码包仍参与。交付专项不是代码检查的替代。
共享配置位置与实际 package 执行 root 分开表达，不能因为根配置存在就声称
所有成员均已受检；跨成员比较只消费可确认的声明，缺失/非法先单独报告。

前置边界必须具体：成员 manifest 无法解析只阻断依赖它的成员/交付项，
可识别的其他成员继续；交付声明不可信只阻断交付衍生专项，通用检查继续；
某个配置无法解析只阻断该配置的字段证明。真正无法确定拓扑时才阻断
成员发现，仍执行无需该拓扑的根文件检查。

现有源代码已含有界 Cloudflare 静态检查，不以 README 的旧阶段描述否认它，
也不把本轮迁移变成新增平台能力。混合项目的通用配置解释可能依赖已确认的
平台事实，应由显式的局部前置节点提供，不能依赖 DFS 恰巧先执行某个兄弟分支。
实施时核对现有规则/回归并列出映射，不预先设计穷尽的 Cloudflare 能力目录。

## Node.js 工具链 Check：授权上下文与约束范围

```text
$root（现有 context + requirements）
└─ 输入、授权执行环境、项目目录与平台有效
   ├─ tool 可定位、允许只读启动、版本可识别（每个所需工具）
   │  └─ 该 tool 的 minimumVersion 叶检查
   ├─ pairing 所需工具与安装事实可确认
   │  └─ npmWithNode 配对约束
   ├─ management 所需 nvm 与受检工具事实可确认（逐工具范围）
   │  └─ 该工具受管安装约束
   ├─ active registry 所需工具与安全配置上下文可确认
   │  └─ npm 或 pnpm 原生有效 registry 的 allowedUrls 约束
   └─ nrm 入口身份与只读实现受支持
      └─ required 注册项（逐项检查）
```

关系检查依赖多个工具时，使用关系范围内的组合前置节点，复用已授权的
读取/探测服务；不要求 SDK 支持任意 DAG，不让调用方传入“已检查通过”。
共享工具缺失按既有根因归因，所有依赖该事实的关系不展开，其他工具继续。
同一工具版本低于要求是 minimumVersion 叶失败，不自动阻断仍能执行的 registry
查询或配对；nvm 不能确认时，不展开对应 management，但不阻断独立 registry。

只检查 requirements 显式要求或其既有依赖的工具。不把该 Check 变成仓库
package 扫描器，不根据 npm/Cloudflare 类型改变执行机 registry 政策。
保留原生 npm/pnpm 配置优先级、nrm 只读实现边界、子进程预算及回收保障。

## 迁移顺序与验证重点

先完成两包现有规则到目标职责的映射和局部前置决策，再迭代 SDK；随后迁移
两个实际入口及直接依赖调用点，而非在旧大流程外套一层 root。
允许复用现有读取器、静态解析器和探测适配器，不复制它们到 SDK。
新 target 模型是作者内部接口，既有输入与公开 CheckResult 不增加强制字段。

验证至少包含：有序 DFS/根失败/叶节点/兄弟继续/未知类型与取消；
单包、混合 workspace、未声明交付、一个成员 manifest 失败、共享配置根因；
普通私有包不触发 npm 专项、明确 npm 与 Cloudflare 各触发其适用分支；
工具缺失剪枝、版本过低不阻断独立约束、多工具关系局部阻断。
用调用记录证明未执行被剪枝 checker，不能只比较最终问题数。

两个 Check 重建新 CAR，使用公开 Engine 验证通过、不通过、故障/取消及
output 文档/资产可读取，记录准确新 CID；历史 CAR/CID 与验收证据保持不变。
受控测试不冒充原生跨平台或线上 Cloudflare 成功，不在本 Idea 准备阶段执行发布。
