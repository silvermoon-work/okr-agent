# Node/npm 安装环境不配对

当前 Node 与识别出的 npm
CLI 不在相同的标准安装布局中。版本分别合格并不足够。此检查不要求 npm 是该 Node 原始附带的精确版本。

修正执行机 PATH 或 npm
shim/prefix，使当前 npm 指向当前 Node 环境。不要仅重装另一个工具或切换 registry。若同时要求 nvm，请在受管版本环境中修正，不要改用系统 npm。系统发行版的拆分布局可能需要单独适配与证据。以相同 projectDirectory 与 pairing 要求重验。
