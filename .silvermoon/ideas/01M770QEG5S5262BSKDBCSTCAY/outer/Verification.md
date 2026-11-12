# TypeScript 项目配置 Check 部署验证

## 授权与验收对象

用户授权主 Agent 代理全部生命周期门禁，并明确允许公开发布到 Pinboard；部署验证选择当前 Windows 设备，不声称已在 office
ubuntu 运行。

实施版本为
`f837db0a8f7a76efa07224da427b285176a499ba`，代理验收已同步到 primary。验证依据先同步的部署契约
`6dae524efbd63adffc07a546e62f3d469b881910`，所在提交为
`0caf4312264764f80cf5904480506e3e45b7509f`。本文件只补充外部观测，不更改该契约的要求。

## Pinboard 发布

- Publication：`538c67a3-6b1d-4b52-8fd2-a94ec024b008`。
- 标题：`check.typescript-project — TypeScript 项目基础实践配置检查`。
- 可见性：`public`；revision `1`、sequence `2`。
- Bundle CID：`bafybeicumbn6casp7au5dj4z3zcokpta2wy6jprdfhll2cal5qfph4zmnm`。
- DAG：41 blocks，内容总计 386973 bytes；CAR 归档为 388590 bytes。
- [准确 CID 的匿名 CAR 下载](https://pinboard.shazhou.work/api/public/bafybeicumbn6casp7au5dj4z3zcokpta2wy6jprdfhll2cal5qfph4zmnm/car)。

实际操作为：用现有 Pinboard CLI 导入批准的 CAR，用 Shazhou MCP
Hub 创建 publication，再以明确的 access
acknowledgement 将其公开。创建 publication 本身保持私有，未误将创建响应当作已公开；随后重新读取确认
`visibility:public`。

用户指定的 cfg 凭据已通过认证请求验证。上传时只将该键读入进程环境，用后清除；没有输出、写入仓库或复用到其他服务。匿名下载不携带 token。

## 下载与完整内容验证

执行公开导出：

```powershell
pinboard export bafybeicumbn6casp7au5dj4z3zcokpta2wy6jprdfhll2cal5qfph4zmnm --output typescript-project-pinboard.car --json
```

使用已发布 Task Builder `0.2.0-rc.0` 的
`readTaskBundleCar`，分别对作者 CAR 和下载 CAR 传入准确 expectedCid，验证完整 DAG、块摘要、规范文件树和 Bundle。另用标准 CAR
reader 枚举两份归档的全部记录，比较排序后的 CID、字节长度与 SHA-256，41 个 block 完全一致。

| 归档          | bytes  | SHA-256                                                            |
| ------------- | ------ | ------------------------------------------------------------------ |
| 作者构建      | 388590 | `dd2baf98defebbae7129dacb2a09668e5fd0231ead841a3f3c5be06e354900f7` |
| Pinboard 下载 | 388590 | `b1c24f9d24cacfcebda290eb1c40cad8c15c47baeec09cc117513253c94f7044` |

归档 SHA-256 不同是实际观测，不是略过校验：CAR 的 block 记录被重排，但根、完整块集合和每块字节一致。验证结果为
`completeDagVerified:true`、`identicalBlockSet:true`、`recordOrderIdentical:false`，不以文件长度或 CID 字符串相同替代完整校验。

## 下载 CAR 的真实 Engine 执行

在作者 smoke 脚本之外，由独立消费脚本只导入标准 Task
Builder/Engine 公开入口及 UnixFS
exporter；不导入本包源码、不依赖作者输出目录、不从作者 CAR 回退执行。标准依赖从本机现有工作区安装解析，本次不声称另建完全无工作区依赖的消费者安装。

- 设备：Windows x64，Node.js `24.11.1`。
- Engine：`@silvermoon-work/task-engine@0.2.0-rc.0`。
- 业务输入只有 `context.projectDirectory`
  指向本仓库，省略 requirements，使用完整默认基线；不注入执行环境或放宽要求。
- 制品来源：刚从 Pinboard 匿名下载的 CAR，准确 CID 与上文一致。
- Task ID：`01M776FRHWCD0WM72XE56N3CAS`。
- stage：`completed`。
- 输出 CID：`bafybeibib7uf5vk5oqvesr5qryh6mkysuwqltmbtjxmaje2zsf6vvkfnqm`。

实际业务结果：

```json
{
  "pass": false,
  "documentation": "references/check.md",
  "problems": [
    {
      "code": "gate-mismatch",
      "brief": "根聚合入口未连接有效能力: typecheck, lint, formatting, test, coverage",
      "documentation": "references/problems/gate-mismatch.md"
    },
    {
      "code": "ci-mismatch",
      "brief": "未确认 PR/main push 同一无条件 job 在 checkout、冻结安装之后调用包含覆盖率的有效质量门禁",
      "documentation": "references/problems/ci-mismatch.md"
    }
  ]
}
```

这是 Check 部署成功但目标项目不满足默认配置标准，不是 Engine 失败，也不是当前测试成绩：根门禁及 CI 没有接入所有适用工作区成员的覆盖率能力。未修改项目脚本或降低要求来制造通过。实现验证中的已知原生 npm 测试超时与这次配置结论无关。

## 输出文档与只读证明

通过运行输出 CID 实际读取以下文件，逐字比较下载 CAR 对应资源，并验证存在中文文本：

| 文档                                   | bytes | SHA-256                                                            |
| -------------------------------------- | ----- | ------------------------------------------------------------------ |
| `references/check.md`                  | 9232  | `9823e9cf2ac162ce1c3bc3b6d750d7d026094f32e319a5a90355ae1968371ea4` |
| `references/problems/gate-mismatch.md` | 206   | `84f3f49a83b21c4f458c9ae51c9a422c49746b268b52507e93dcd631ce65a218` |
| `references/problems/ci-mismatch.md`   | 216   | `ecdc2fc715716b722bc339cd60a23ddddec333da68f647b6f40e92a9dc6544e5` |

Worker 已回收。执行前后 162 个 Git 跟踪及非忽略新文件的整体 SHA-256 均为
`61421fe6c55c7c2a978fb05858c1655608f2ad6859d9f2556417ea023e3edbb7`，Git 状态均为空。检测没有执行目标脚本或动态配置，未触发安装、lint、测试、构建或 CI。

输出块仅在本次 Engine 的内存存储中用于校验，没有将输出 CID 另行上传或承诺其可从公共网络读取。完整支持边界保留在已批准实现及 CAR 内中文参考中；未知动态语法仍是无法确认，未验证平台不声明支持。
