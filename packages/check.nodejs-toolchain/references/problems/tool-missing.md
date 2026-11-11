# 所需工具缺失

适用于显式 tools 以及 management 隐含的 nvm、nrm.required 隐含的 nrm。当前执行机 PATH（Unix
nvm 使用 NVM_DIR/nvm.sh）未定位到所需入口；控制机上安装工具不等于 Worker 已安装。

在执行机上由管理员安装或修正工具发现路径。要求 nvm 管理时通过对应平台的 nvm 安装并选择 Node，勿用不受管安装替代；未要求管理时可自行选择安装方式。仅声明 Node 不需要安装其他工具。确认 Worker 使用相同环境和项目目录后重验。
