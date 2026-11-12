# TypeScript 项目配置 Check 部署验证

外部结果与准确制品身份见 [Verification.md](./Verification.md)。

## Steps

### D-S01: 发布并重新下载准确 CAR

将经过验证的 CAR 按用户明确授权公开发布到用户 Pinboard，记录 Bundle
CID、Publication 身份及上传/下载 CAR 各自 SHA-256，重新下载并核对完整 DAG；不把本地打包当作发布。上传凭据仅从 cfg 指定键读取到进程内，不输出或提交。

### D-S02: 经 Engine 检查当前项目

在当前设备或 office
ubuntu 仅用重新下载的准确 CAR 与标准 Engine，对当前项目运行默认要求，读取输出文档并确认回收及项目未变。

### D-S03: 记录实际结果与支持限制

记录实际 pass、不满足及无法确认项，不为制造通过修改项目或降低要求；发布限用户授权的 Pinboard，不发布 npm。

## Acceptance criteria

### D-AC01: Pinboard 制品可独立获取

上传与下载 CAR 分别通过完整 DAG 验证，根 CID 与批准制品一致，全部 block
CID/字节摘要集合完全相同。CAR 记录顺序允许重排，因此归档 SHA-256 可以不同，必须记录差异及其证据，不能只比较文件长度或根字符串。真实消费不导入作者源码。

### D-AC02: 当前项目得到真实配置结论

真实 Engine 以默认要求完成运行，持久化业务结果和输出 CID，实际读取中文参考文档；不要求被检项目必须合规。

### D-AC03: 部署行为与声明一致

证明工作区配置未被修改、未执行目标质量脚本、Worker 已回收；明确未测试的平台及静态解析限制。
