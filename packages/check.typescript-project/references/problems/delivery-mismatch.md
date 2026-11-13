# npm 交付配置不满足

修复准确包的 ESM/types/package.json 入口、已声明构建配置、映射源交付、allowlist 或发布目标配置。固定 check/lint-package 从既有 workspace、manifest 和工具配置推导动作，按序调用并传播失败；build 内部仍可自定义，不冒称其内部安全已被证明。本 Check 不执行目标构建、打包或发布，配置合规不等于已验证实际制品。
