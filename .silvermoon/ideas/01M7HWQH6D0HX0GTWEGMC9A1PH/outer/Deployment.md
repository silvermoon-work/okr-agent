# Deployment

用户授权主 Agent 负责门限审批。本阶段仅验证本地可用性；不发布 npm、不推 release tag、不自动上传远端制品。alias 仓库已由用户提供，不再创建另一个远端仓库。

## Steps

### D-S01: 试跑真实本地文档

用受控 IPFS Store 与准确 renderer CID，在真实浏览器打开 YAML/JSON；修改、替换和纠错后观察持续预览及资源错误，不使用预置 fixtures 下拉框代替文件入口。

### D-S02: 验证 alias 与关闭行为

在独立临时消费目录安装本地准确主包 / alias tarball，运行薄入口并检查中断后的端口、监听和 Store 回收；记录源码与制品身份及可复现指令。

## Acceptance criteria

### D-AC01: 文档展示与持续更新可复现

实际浏览器证据证明文件内容由绑定 CID 的 renderer 展示，保存后更新，错误有明确反馈；Check renderer 的桌面与 mobile 导航保持可用。

### D-AC02: 本地入口联调与退出完成

准确 tarball 的 alias 调用能到达主入口；取消后本次资源实际退出。明确区分本地验证与尚未授权的 registry `npx ipfsaw` 交付，不把后者提前宣称成功。
