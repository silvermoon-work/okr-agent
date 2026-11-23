import { Target } from "./contract.js";
import { ProjectTarget } from "./project-contract.js";
import { SetupTarget } from "./setup-contract.js";
import { CommitTarget } from "./commit-contract.js";
import {
  ideaDocumentation,
  projectDocumentation,
  setupDocumentation,
  commitDocumentation,
} from "./checkpoints/catalog.js";

export const specifications = {
  idea: {
    $schema: "urn:ipfsaw:check-bundle:1",
    specVersion: "1.0",
    name: "Silvermoon · Idea 推进检查",
    description:
      "先检查设备、项目及 Idea 的标准化前提，再按七个平级文件夹推进 submit → accept → synchronization。revision 是当前文件夹真实 Git tree ID，upstream 是直接前置文件夹真实 tree ID，根为 null；不构造复合或递归依赖版本树。默认 test-spec 和 implementation delegated，其他 consensus；consensus 仅认可 user，delegated 认可 user/delegate。Check 只判断事件状态、当前版本/前置、权限模式、历史/协议、标准化和同步，不判断测试、CI、报告真实性、用例完整性、受测代码或声明的提交路径绑定。实现提交材料由 Agent 记录增删改 TEST CASES 和提交 commit，接受前 Agent 验证包含该 commit 的本地测试或 CI 通过；部署由 Agent 自验真实结果后用户实际操作并明确 accept，无独立 user-acceptance。created-first 固定可信不可变 Schema CID，与执行 Check CID 分离；新 Ideas 无 idea.json/id/version，旧数据只读检查，不自动迁移。",
    parameter: { schema: Target },
    checkpoints: ideaDocumentation,
  },
  project: {
    $schema: "urn:ipfsaw:check-bundle:1",
    specVersion: "1.0",
    name: "Silvermoon · 项目就绪检查",
    description:
      "供 silvermoon check-project 独立检查项目是否处于可开始工作的状态， 也供 silvermoon create-idea 在创建文件前执行的独立 Check Task， 检查当前设备、Git 仓库、primary 跟踪同步关系、Silvermoon 数据容器和提交 hook 是否就绪，不仅是配置校验。 本 Task 不需要 Idea 参数，不读取既有 Idea 内容，不创建目录、写入事件或记录批准。 通过只表示本次观察项目就绪，不是持久授权；CLI 写入时仍须加锁并重新核对仓库与内容， 防止检查通过后发生的并发变化。与 Idea 推进、候选变更合法性两个 Task 独立； 相同前提规则应共享实现，不复制出另一套判定。",
    parameter: { schema: ProjectTarget },
    checkpoints: projectDocumentation,
  },
  setup: {
    $schema: "urn:ipfsaw:check-bundle:1",
    specVersion: "1.0",
    name: "Silvermoon · 设备就绪检查",
    description:
      "供 silvermoon check-setup 在设备 onboarding 时独立检查全局安装、个人 skill 和用户配置。 不需要 Git 仓库或 Idea，不发现、读取或初始化项目，不调用 Git，不访问 primary 或 registry。 与 Project 和 Idea Task 复用同一个 global 检查点实现。 本 Task 只诊断并返回修复指引，不自动安装、升级、修改配置、链接 skill 或创建文件。 通过仅表示本次设备就绪，不是项目就绪、生命周期批准或持久授权。",
    parameter: { schema: SetupTarget },
    checkpoints: setupDocumentation,
  },
  commit: {
    $schema: "urn:ipfsaw:check-bundle:1",
    specVersion: "1.0",
    name: "Silvermoon · 提交合法性检查",
    description:
      "对应 silvermoon check-changes，只选择候选快照中有变更的 Ideas，完整验证这些 Ideas 的 Silvermoon 数据结构和相对基线的修改是否合法，供提交前检查使用。staged 读取 Git 索引，worktree 读取显式工作区候选，已提交快照读取准确提交树；不要求工作区洁净、upstream 就绪、分支同步、全局 Silvermoon 配置有效或 Idea 已完成。本任务不 fetch，也不自动暂存、提交、推送或清理文件。",
    parameter: { schema: CommitTarget },
    checkpoints: commitDocumentation,
  },
} as const;
export const specificationFiles = {
  idea: "silvermoon-single-checker.yaml",
  project: "silvermoon-project-check.yaml",
  setup: "silvermoon-setup-check.yaml",
  commit: "silvermoon-commit-check.yaml",
} as const;
