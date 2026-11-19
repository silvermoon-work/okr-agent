import { join } from "node:path";
import {
  defineCheckpoint,
  type CheckpointResult,
  type RuleFailure,
} from "@silvermoon-work/check-task-sdk";
import {
  Target,
  consensusCheckpointIds,
  consensusRuleCodes,
  type ConsensusRuleCode,
  type ConsensusSynchronizationRuleCode,
  type Runtime,
  type RuleCode,
  type RepositoryTarget,
} from "./contract.js";
import type { ProjectTarget } from "./project-contract.js";
import type { SetupTarget } from "./setup-contract.js";
import {
  inspectInstallation,
  inspectPersonalSkill,
  deviceLanguage,
} from "./device.js";
import {
  canonical,
  digest,
  gates,
  invariant,
  SilvermoonError,
  type Gate,
  type Idea,
} from "./domain.js";
import { withGitContext } from "./git-context.js";
import {
  git,
  observeRepository,
  observedIdeaState,
  readRepository,
  readIdeaProject,
  selectIdea,
  verifyIdeaHistory,
  verifyRepositoryRoot,
  regular,
  readRegular,
  absent,
} from "./repository.js";

type EnvironmentCode =
  "global-runtime-ready" | "global-skill-linked" | "global-configuration-valid";
const noExtraOutput = {
  description:
    "成功不新增数据，pass output 为 undefined；后续只承接本次检查通过的事实。",
} as const;
function failure<const Code extends RuleCode>(
  code: Code,
  error: unknown,
): Extract<CheckpointResult<never, Code>, { pass: false }> {
  return {
    pass: false,
    problems: [
      { code, brief: error instanceof Error ? error.message : String(error) },
    ],
  };
}
function nativeCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}
export interface CheckExecution {
  readonly runtime: Runtime;
  readonly refresh?: boolean;
  readonly localRemote?: string;
}
export function environmentCheckpoint(
  runtime: Runtime,
  targetSchema: typeof Target | typeof ProjectTarget | typeof SetupTarget,
) {
  return defineCheckpoint({
    id: "global",
    target: targetSchema,
    description: "全局 Silvermoon 安装、个人 skill 与配置均有效。",
    output: {
      description:
        "已验证的个人语言设置，供当前 Idea 内容语言决策使用；仅在本次执行内共享。",
      fields: [
        {
          name: "userLanguage",
          description:
            "规范语言标签或 undefined；允许个人配置缺省，不推断其他配置存在。",
        },
      ],
    },
    rules: [
      {
        code: "global-runtime-ready",
        description: "PATH 必须发现当前有效安装的规范 Silvermoon 入口。",
      },
      {
        code: "global-skill-linked",
        description: "个人 skill 必须链接到当前安装的 canonical skill。",
      },
      {
        code: "global-configuration-valid",
        description: "已有个人配置必须符合支持的协议；允许配置缺省。",
      },
    ],
    check: async (
      target,
      context,
    ): Promise<
      CheckpointResult<{ userLanguage: string | undefined }, EnvironmentCode>
    > => {
      const { signal } = context;
      const problems: RuleFailure<EnvironmentCode>[] = [];
      let userLanguage: string | undefined;
      try {
        userLanguage = await deviceLanguage({ home: target.userHome });
      } catch (error) {
        signal.throwIfAborted();
        if (
          !(error instanceof SilvermoonError) &&
          !(error instanceof TypeError)
        )
          throw error;
        problems.push(...failure("global-configuration-valid", error).problems);
      }
      let installation: string | undefined;
      const device = { home: target.userHome, ...runtime };
      try {
        installation = await inspectInstallation(device);
      } catch (error) {
        signal.throwIfAborted();
        if (
          !(error instanceof SilvermoonError) &&
          !(error instanceof SyntaxError) &&
          !["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
        )
          throw error;
        problems.push(...failure("global-runtime-ready", error).problems);
      }
      if (installation) {
        try {
          await inspectPersonalSkill(device, installation);
        } catch (error) {
          signal.throwIfAborted();
          if (
            !(error instanceof SilvermoonError) &&
            !["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
          )
            throw error;
          problems.push(...failure("global-skill-linked", error).problems);
        }
      }
      const [first, ...rest] = problems;
      return first
        ? { pass: false, problems: [first, ...rest] }
        : { pass: true, output: { userLanguage } };
    },
  });
}

export function prerequisiteCheckpoints(
  execution: CheckExecution,
  targetSchema: typeof Target | typeof ProjectTarget,
) {
  const runtime = execution.runtime;
  const inGit = <T>(target: RepositoryTarget, action: () => Promise<T>) =>
    withGitContext({ userHome: target.userHome, ...runtime }, action);
  const environment = environmentCheckpoint(runtime, targetSchema);
  const repository = defineCheckpoint({
    id: "repository",
    target: targetSchema,
    description: "仓库根目录有效，HEAD 关联分支，所有内容已提交。",
    output: {
      description: "已验证的仓库定位及本次观察的起始提交。",
      fields: [
        { name: "root", description: "后续文件和 Git 观察的仓库根目录。" },
        {
          name: "head",
          description:
            "准确起始提交 ID，用于检测观察期间仓库变化，不跨执行缓存。",
        },
      ],
    },
    rules: [
      {
        code: "repository-root-valid",
        description: "目标必须是具有有效 HEAD 的 Git 仓库根目录。",
      },
      {
        code: "repository-branch-attached",
        description: "HEAD 必须关联本地分支。",
      },
      {
        code: "repository-worktree-clean",
        description: "仓库不得有未提交内容，Idea 草稿和事件不例外。",
      },
    ],
    check: async (target, context) => {
      const { signal } = context;
      context.outputOf(environment);
      if (!target.repoRoot)
        return failure(
          "repository-root-valid",
          "Select a Git repository root.",
        );
      const root = target.repoRoot;
      return inGit(target, async () => {
        let head: string;
        try {
          await verifyRepositoryRoot(root, signal);
          head = await git(root, ["rev-parse", "--verify", "HEAD"], signal);
        } catch (error) {
          signal.throwIfAborted();
          const code = nativeCode(error);
          if (
            error instanceof SilvermoonError ||
            code === "ENOENT" ||
            code === "ENOTDIR" ||
            code === 128
          )
            return failure("repository-root-valid", error);
          throw error;
        }
        try {
          await git(
            root,
            ["symbolic-ref", "--quiet", "--short", "HEAD"],
            signal,
          );
        } catch (error) {
          signal.throwIfAborted();
          if (nativeCode(error) === 1)
            return failure("repository-branch-attached", error);
          throw error;
        }
        const status = await git(
          root,
          ["status", "--porcelain=v1", "--untracked-files=all"],
          signal,
        );
        return status
          ? failure(
              "repository-worktree-clean",
              "Commit all staged, unstaged and untracked content before continuing.",
            )
          : { pass: true as const, output: { root, head } };
      });
    },
  });
  const branch = defineCheckpoint({
    id: "branch",
    target: targetSchema,
    description: "仓库配置有效，当前分支正确跟踪并已同步至 primary。",
    output: {
      description:
        "已经核验的仓库配置与本次 primary 观察；执行期对象不自动进入报告。",
      fields: [
        {
          name: "project",
          description: "仓库 root 和有效配置，记录本次观察来源及范围。",
        },
        {
          name: "observed",
          description:
            "HEAD、primary tip、remote、变更事实及 primary 配置，供 Idea 观察和终态同步使用。",
        },
      ],
    },
    rules: [
      {
        code: "branch-silvermoon-config-valid",
        description: "项目必须配置有效 primaryRepository 与 primaryBranch。",
      },
      {
        code: "branch-primary-present",
        description: "配置的远端 primary 分支必须存在。",
      },
      {
        code: "branch-upstream-aligned",
        description: "当前分支必须跟踪配置的远端 primary。",
      },
      {
        code: "branch-primary-synchronized",
        description: "HEAD 必须等于观察到的 primary tip。",
      },
    ],
    check: async (target, context) => {
      const { signal } = context;
      const { root, head } = context.outputOf(repository);
      return inGit(target, async () => {
        let project;
        try {
          project = await readRepository(root, "worktree", signal);
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof SilvermoonError) {
            if (["git-context", "concurrent-edit", "root"].includes(error.code))
              throw error;
            return failure("branch-silvermoon-config-valid", error);
          }
          if (
            error instanceof SyntaxError ||
            error instanceof TypeError ||
            ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
          )
            return failure("branch-silvermoon-config-valid", error);
          throw error;
        }
        try {
          await git(
            root,
            [
              "rev-parse",
              "--abbrev-ref",
              "--symbolic-full-name",
              "@{upstream}",
            ],
            signal,
          );
        } catch (error) {
          signal.throwIfAborted();
          if (nativeCode(error) === 128)
            return failure("branch-upstream-aligned", error);
          throw error;
        }
        let observed;
        try {
          observed = await observeRepository(project, {
            fetch: execution.refresh ?? true,
            checkBranch: true,
            ...(execution.localRemote
              ? { localRemote: execution.localRemote }
              : {}),
            signal,
          });
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof SilvermoonError) {
            if (
              ["git-context", "concurrent-edit", "git-status"].includes(
                error.code,
              )
            )
              throw error;
            const code =
              error.code === "primary-branch-missing"
                ? "branch-primary-present"
                : "branch-upstream-aligned";
            return failure(code, error);
          }
          throw error;
        }
        invariant(
          observed.head === head && !observed.changes.length,
          "concurrent-edit",
          "Repository changed during checkpoint observation.",
        );
        return observed.head !== observed.tip
          ? failure(
              "branch-primary-synchronized",
              "Synchronize current HEAD to the observed primary tip.",
            )
          : { pass: true as const, output: { project, observed } };
      });
    },
  });
  const silvermoonLayout = defineCheckpoint({
    id: "silvermoon-folder",
    target: targetSchema,
    description: "Silvermoon 数据目录与配置文件均为安全的常规路径。",
    output: noExtraOutput,
    rules: [
      {
        code: "silvermoon-folder-path-valid",
        description: ".silvermoon 必须是无重定向的常规目录。",
      },
      {
        code: "silvermoon-folder-config-file-valid",
        description: "config.yaml 必须是可有界读取的常规文件。",
      },
      {
        code: "silvermoon-folder-ideas-directory-valid",
        description: "i 目录可以尚未创建；存在时必须是常规目录。",
      },
    ],
    check: async (
      _target,
      context,
    ): Promise<
      CheckpointResult<
        undefined,
        | "silvermoon-folder-path-valid"
        | "silvermoon-folder-config-file-valid"
        | "silvermoon-folder-ideas-directory-valid"
      >
    > => {
      context.outputOf(branch);
      const { root } = context.outputOf(repository);
      const base = join(root, ".silvermoon");
      try {
        await regular(base, true);
      } catch (error) {
        if (
          error instanceof SilvermoonError ||
          ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
        )
          return failure("silvermoon-folder-path-valid", error);
        throw error;
      }
      try {
        await readRegular(join(base, "config.yaml"), context.signal);
      } catch (error) {
        if (
          error instanceof SilvermoonError &&
          error.code === "concurrent-edit"
        )
          throw error;
        if (
          error instanceof SilvermoonError ||
          ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
        )
          return failure("silvermoon-folder-config-file-valid", error);
        throw error;
      }
      const ideas = join(base, "i");
      try {
        if (!(await absent(ideas))) await regular(ideas, true);
      } catch (error) {
        if (
          error instanceof SilvermoonError ||
          ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
        )
          return failure("silvermoon-folder-ideas-directory-valid", error);
        throw error;
      }
      return { pass: true, output: undefined };
    },
  });
  return [environment, repository, branch, silvermoonLayout] as const;
}

export function silvermoonCheckpoints(
  bundleCid: string,
  execution: CheckExecution,
) {
  const [environment, repository, branch, silvermoonLayout] =
    prerequisiteCheckpoints(execution, Target);
  const inGit = <T>(target: Target, action: () => Promise<T>) =>
    withGitContext({ userHome: target.userHome, ...execution.runtime }, action);
  const synchronized = (target: Target, tip: string, signal: AbortSignal) =>
    inGit(target, async () => {
      const changes = await git(
        target.repoRoot,
        ["status", "--porcelain=v1", "--untracked-files=all"],
        signal,
      );
      const head = await git(
        target.repoRoot,
        ["rev-parse", "--verify", "HEAD"],
        signal,
      );
      return !changes && head === tip;
    });
  const observation = defineCheckpoint({
    id: "idea-folder",
    target: Target,
    description: "当前 Idea 的身份与协议数据有效，且处于可推进状态。",
    output: {
      description:
        "当前 Idea 从有效内容与事件推导的执行期事实，不记录新的批准或推进事件。",
      fields: [
        {
          name: "state",
          description:
            "reducer 结果、版本、有效签署和证据摘要；供后续检查读取，不额外持久化生命周期状态。",
        },
        {
          name: "brief",
          description:
            "用于失败规则说明的受控事实摘要，不含原始全文，不代表自动发布整个 Context。",
        },
      ],
    },
    rules: [
      {
        code: "idea-folder-data-valid",
        description: "必须能唯一解析符合协议的 Idea。",
      },
      {
        code: "idea-folder-identity-immutable",
        description: "当前 Idea 的 bootstrap 身份必须相对于 primary 保持不变。",
      },
      {
        code: "idea-folder-event-history-append-only",
        description:
          "当前 Idea 的事件必须保留 primary 中已记录的准确前缀，只能追加。",
      },
      {
        code: "idea-folder-active",
        description:
          "Idea 必须处于有效推进状态；显式放弃后须有授权的 resume 事实才能恢复。",
      },
    ],
    check: async (target, context) => {
      context.outputOf(silvermoonLayout);
      const { observed } = context.outputOf(branch);
      invariant(
        target.idea,
        "internal",
        "Idea observation requires a selector.",
      );
      invariant(
        target.repoRoot,
        "internal",
        "Idea observation requires a repository.",
      );
      const root = target.repoRoot;
      let project;
      let current: Idea;
      let previous;
      try {
        project = await inGit(target, () =>
          readIdeaProject(root, target.idea, observed.head, context.signal),
        );
        current = selectIdea(project, target.idea);
        previous = await inGit(target, () =>
          readIdeaProject(
            root,
            current.bootstrap.id,
            observed.tip,
            context.signal,
          ),
        );
        const before = previous.ideas.get(current.bootstrap.id);
        invariant(
          before,
          "identity",
          "The selected Idea must exist in the observed primary snapshot.",
        );
        verifyIdeaHistory(current, before);
      } catch (error) {
        context.signal.throwIfAborted();
        if (error instanceof SilvermoonError) {
          if (
            ["git-context", "concurrent-edit", "internal"].includes(error.code)
          )
            throw error;
          if (error.code === "identity")
            return failure("idea-folder-identity-immutable", error);
          if (error.code === "history")
            return failure("idea-folder-event-history-append-only", error);
          return failure("idea-folder-data-valid", error);
        }
        if (error instanceof SyntaxError || error instanceof TypeError)
          return failure("idea-folder-data-valid", error);
        throw error;
      }
      invariant(
        current.bootstrap.checkCid === bundleCid,
        "check-identity",
        "The executing Check CID does not match the Idea's immutable bootstrap.",
      );
      const state = await inGit(target, () =>
        observedIdeaState(
          project,
          current,
          { head: observed.head, primary: previous },
          context.outputOf(environment).userLanguage,
          context.signal,
        ),
      );
      if (state.level === "abandoned")
        return failure(
          "idea-folder-active",
          "Idea is explicitly abandoned; only an authorized resume event can restore it.",
        );
      const brief = canonical({
        idea: current.bootstrap.id,
        ...state,
        eventDigest: digest(current.eventSource),
        primary: observed.tip,
        subject: observed.head,
      });
      return { pass: true as const, output: { state, brief } };
    },
  });
  const consensus = gates.map((gate: Gate) => {
    const id = consensusCheckpointIds[gate];
    const synchronizationCode = `${id}-synchronized` as const;
    return defineCheckpoint({
      id,
      target: Target,
      description: `${gate} 当前版本的共识已明确确认并同步至 primary。`,
      output: noExtraOutput,
      rules: [
        {
          code: consensusRuleCodes[gate],
          description: `${gate} 必须存在绑定当前版本及前序向量的明确 signoff。`,
        },
        {
          code: synchronizationCode,
          description: `${gate} 内容与准确 signoff 必须同步至 primary。`,
        },
      ],
      check: async (
        _target,
        context,
      ): Promise<
        CheckpointResult<
          undefined,
          ConsensusRuleCode | ConsensusSynchronizationRuleCode
        >
      > => {
        await Promise.resolve();
        const { state, brief } = context.outputOf(observation);
        if (state.level === gate)
          return failure(consensusRuleCodes[gate], brief);
        if (state.level === "synchronization" && state.next === gate)
          return failure(synchronizationCode, brief);
        return { pass: true, output: undefined };
      },
    });
  });
  const implementation = defineCheckpoint({
    id: "implementation",
    target: Target,
    description:
      "所有必需实现环境的当前验收证据完整通过，实现、证据与验证事件已同步。",
    output: noExtraOutput,
    rules: [
      {
        code: "implementation-evidence-valid",
        description: "所有实现用例必须由当前有效证据批次完整通过。",
      },
      {
        code: "implementation-synchronized",
        description: "已验证的实现、证据与对应验证事件必须提交并同步 primary。",
      },
    ],
    check: async (
      target,
      context,
    ): Promise<
      CheckpointResult<
        undefined,
        "implementation-evidence-valid" | "implementation-synchronized"
      >
    > => {
      const { state, brief } = context.outputOf(observation);
      if (state.level === "implementation")
        return failure("implementation-evidence-valid", brief);
      invariant(
        state.level === "deployment" || state.level === "completed",
        "internal",
        "Prior checkpoints did not establish implementation lifecycle facts.",
      );
      const { observed } = context.outputOf(branch);
      return (await synchronized(target, observed.tip, context.signal))
        ? { pass: true, output: undefined }
        : failure("implementation-synchronized", brief);
    },
  });
  const deployment = defineCheckpoint({
    id: "deployment",
    target: Target,
    description:
      "当前部署验收完整通过且绑定已同步实现，部署证据与验证事件已同步。",
    output: noExtraOutput,
    rules: [
      {
        code: "deployment-evidence-valid",
        description: "全部部署环境必须具备绑定当前实现摘要的完整通过批次。",
      },
      {
        code: "deployment-synchronized",
        description:
          "部署证据及对应验证事件必须提交并同步 primary，Idea 才能完成。",
      },
    ],
    check: async (
      target,
      context,
    ): Promise<
      CheckpointResult<
        undefined,
        "deployment-evidence-valid" | "deployment-synchronized"
      >
    > => {
      const { state, brief } = context.outputOf(observation);
      if (state.level === "deployment")
        return failure("deployment-evidence-valid", brief);
      invariant(
        state.level === "completed",
        "internal",
        "Prior checkpoints did not establish completed lifecycle facts.",
      );
      const { observed } = context.outputOf(branch);
      return (await synchronized(target, observed.tip, context.signal))
        ? { pass: true, output: undefined }
        : failure("deployment-synchronized", brief);
    },
  });
  return [
    environment,
    repository,
    branch,
    silvermoonLayout,
    observation,
    ...consensus,
    implementation,
    deployment,
  ] as const;
}
export { Target } from "./contract.js";
