# 发布保护不满足

根据 brief 的准确文件、配置项、观察值与要求差异修复固定资产或 workflow，按实际职责读取[单包](../npm-publisher-v1.md#single-package)或[workspace](../npm-publisher-v1.md#workspace)参考。两种适配共用一份核心，仅 pack/publish 显式映射的一个包。发布入口与必要 lib 必须完整匹配 output 标准（仅统一换行）；CI 只调用 pnpm
release/release-dry-run，不直接运行内部文件或裸 publish。固定实现保留 stable/latest、RC/rc、连续历史、唯一身份、准确 CI、OIDC、单次禁钩子 pack 和同 tarball 等保护；不可自由修改门卫。不实际发布或移动标签。

release tag 解引用的完整 commit
SHA 必须 main 可达，并且已有相同完整 SHA 的成功 main-push 固定质量 CI，全部必需 job/矩阵/聚合成功。没结果、运行中、失败/取消/跳过、不完整、查询失败均阻断；不补跑 check，不使用 PR、其他 workflow/分支/SHA 的成绩。发布复用已有质量 CI，不重复 pnpm
check，发布特有保护仍全部执行。
