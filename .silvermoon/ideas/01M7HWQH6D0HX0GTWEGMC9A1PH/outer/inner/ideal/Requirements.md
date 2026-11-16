# ipfsaw 需求与决策来源

本文支持 [Idea](./Idea.md)，区分用户已确认方向与授权主 Agent 完成的设计。当前是方向及实施候选，不表示已有 CLI 或 renderer 协议可用。

## 已确认的方向

- 用户写本地 YAML/JSON，通过 CLI 打开浏览器持续预览，保存文件后更新，不再修改宿主 fixtures。
- 文档根 `$schema` 作为应用约定的文档类型标识；本地维护 Schema URI 到准确 renderer CID 的映射。不是从任意文档指令自动安装并执行未知代码。
- Renderer 是含 JS 入口及完整依赖 assets 的固定 bundle，通过 IPFS 交付。Check viewer 是第一个 renderer，工具本身不绑定 Check 或 React。
- 用户明确要求 IPFS Store 使用方式与现有 Task 工具链保持一致；复用配置来源、默认值、backend/gateway 与所有权机制，不另建 ipfsaw 专属 IPFS 配置。
- 当前 monorepo 主包名为 `@silvermoon-work/ipfsaw`，保持所有 workspace 的组织命名一致。
- 用户已 clone `silvermoon-work/ipfsaw` 到 `D:\Code\ipfsaw`；该独立仓库仅交付无 scope 的 `ipfsaw` alias，目标是未来可 `npx ipfsaw`。不能把 bin 名等同于 registry alias。

## 角色与场景

| 标识 | 职责与场景 | 完成条件 |
| --- | --- | --- |
| S-VIEW | 文档作者或评审者查看当前文件，并在原编辑器中修改 | 浏览器展示当前有效 revision，错误明确可见；不编辑或上传源文件 |
| S-BIND | 同一使用者维护自己信任的 Schema / CID 绑定 | 可查看、添加及明确替换或移除绑定，无隐藏自动升级 |
| R-AUTHOR | Renderer 作者交付固定入口和全部 assets | 自包含、可按准确 CID 读取，并满足版本化浏览器契约 |
| R-ALIAS | Alias 维护者交付薄入口 | 不复制实现，委派给主包的稳定入口，保持参数、输出、信号与退出语义 |

首轮用户目标是 S-VIEW，S-BIND 是其必需的本地配置辅助场景。R-AUTHOR 的首个实际产物是 Check renderer；不扩展成 marketplace、通用编辑器或新的 Task 执行平台。

## 场景参数

| 参数 | 含义 | 产品默认 | 用户级配置 |
| --- | --- | --- | --- |
| 待查看文档 | 本次预览的 YAML/JSON 文件 | N | N |
| Renderer 绑定 | 可供多份文档复用的 Schema URI / CID 对应关系 | N | Y |
| IPFS 访问配置（共享） | 完全继承现有 Task 工具链的 Store 配置与默认行为 | Y | Y |
| 自动打开浏览器 | 受托设计的交互偏好，允许无桌面环境仅取得地址 | Y | Y |

`$schema` 由文档导出，renderer CID 由绑定导出，不要求用户再次传入。地址、端口、凭据等 IPFS 细节不是 ipfsaw 的第二套业务配置。新增浏览器偏好是主 Agent 的受托交互设计，不冒充用户先前逐项批准的参数。

## 资源与辅助场景的受托设计

源文档属于用户；映射属于用户配置；bundle 交由共享 IPFS Store 读取 / 缓存。预览 HTTP 服务、文件监听、页面通信及自己创建的 Store 实例属于本次 CLI 运行的资源。不得关闭外部 IPFS daemon 或删除别人的缓存 / pin。

本次预览以回环地址提供服务，默认前台运行并随取消释放资源，不引入 daemon 管理命令。映射管理只处理本地绑定；IPFS 配置与凭据继续由现有机制管理，不增加 credential 管理场景。

资源确认问题曾被中断，没有形成逐项同意。之后用户明确授权主 Agent 完成设计并审批门限，所以上述资源及辅助场景属于受托设计，不是补记历史用户确认。

## 授权与边界

用户原话：“我没什么疑问，你设计好，就可以派 subagent 去推进实施了，你来负责门限审批。ipfsaw 的项目我已经 clone 到 D:\Code\ipfsaw 了，你可以在那个 worktree 起一个 独立 session，让它去实现。”

因此主 Agent 可以设计、委派主包及跨仓薄入口，并基于独立证据完成门限审批。该授权不包含 npm 发布、移动 tag、自动远端上传、复制主实现到 alias 仓库，或对 CLI 尚未完成的能力作成功声明。

技术约束、待证明风险及具体命令分别见 [Design](../Design.md)、[Research](../Research.md) 与 [CLI Spec](../CliSpec.html)。这些文档是同一 Idea 的 supporting documents，不构成另一套生命周期契约。
