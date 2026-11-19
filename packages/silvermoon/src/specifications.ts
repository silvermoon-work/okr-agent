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
      "检查指定 Idea 是否已经完成。若未完成，报告下一个需要通过的 checkpoint（推进方向）及其未通过的 Rules（当前卡点）。",
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
