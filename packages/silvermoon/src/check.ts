import { lstat } from "node:fs/promises";
import {
  defineCheckpoint,
  type CheckpointResult,
  type RuleFailure,
} from "@silvermoon-work/check-task-sdk";
import {
  Target,
  SnapshotTarget,
  type Runtime,
  type RuleCode,
} from "./contract.js";
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
} from "./domain.js";
import { withGitContext } from "./git-context.js";
import {
  git,
  primary,
  observedIdeaState,
  readProject,
  selectIdea,
  snapshotHistory,
} from "./repository.js";

type EnvironmentCode =
  "environment-runtime" | "environment-skill" | "environment-configuration";
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
export function silvermoonCheckpoints(
  bundleCid: string,
  execution: {
    readonly runtime: Runtime;
    readonly refresh?: boolean;
    readonly localRemote?: string;
  },
  target: Target,
) {
  const runtime = execution.runtime;
  const inGit = <T>(target: Target, action: () => Promise<T>) =>
    withGitContext({ userHome: target.userHome, ...runtime }, action);
  const environment = defineCheckpoint({
    id: "environment",
    target: Target,
    description: "核验全局 Silvermoon 安装、个人 skill 与配置。",
    rules: [
      {
        code: "environment-runtime",
        description: "PATH 必须发现当前有效安装的规范 Silvermoon 入口。",
      },
      {
        code: "environment-skill",
        description: "个人 skill 必须链接到当前安装的 canonical skill。",
      },
      {
        code: "environment-configuration",
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
        problems.push(...failure("environment-configuration", error).problems);
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
        problems.push(...failure("environment-runtime", error).problems);
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
          problems.push(...failure("environment-skill", error).problems);
        }
      }
      const [first, ...rest] = problems;
      return first
        ? { pass: false, problems: [first, ...rest] }
        : { pass: true, output: { userLanguage } };
    },
  });
  const repository = defineCheckpoint({
    id: "repository",
    target: Target,
    description: "核验仓库、primary 跟踪、提交与同步状态。",
    rules: [
      {
        code: "repository-root-invalid",
        description: "目标必须是有效 Git 仓库根目录。",
      },
      {
        code: "project-configuration-invalid",
        description: "项目必须配置有效 primaryRepository 与 primaryBranch。",
      },
      {
        code: "project-layout-invalid",
        description: "项目文件树必须满足协议、安全及容量约束。",
      },
      {
        code: "primary-branch-missing",
        description: "配置的远端 primary 分支必须存在。",
      },
      { code: "branch-detached", description: "HEAD 必须关联本地分支。" },
      {
        code: "branch-upstream-mismatch",
        description: "当前分支必须跟踪配置的远端 primary。",
      },
      {
        code: "primary-sync-required",
        description: "HEAD 必须等于观察到的 primary tip。",
      },
      {
        code: "worktree-uncommitted",
        description: "仓库不得有未提交内容，Idea 草稿和事件不例外。",
      },
      {
        code: "event-history-rewritten",
        description: "primary 事件历史必须保持追加。",
      },
      {
        code: "idea-identity-modified",
        description: "已有 Idea 的 bootstrap 身份不可改写。",
      },
    ],
    check: async (target, context) => {
      const { signal } = context;
      context.outputOf(environment);
      if (!target.repoRoot)
        return failure(
          "repository-root-invalid",
          "Select a Git repository root.",
        );
      const root = target.repoRoot;
      return inGit(target, async () => {
        try {
          if (!(await lstat(root)).isDirectory())
            return failure(
              "repository-root-invalid",
              "Target must be a Git repository root.",
            );
          await git(root, ["rev-parse", "--show-toplevel"], signal);
        } catch (error) {
          signal.throwIfAborted();
          const code = nativeCode(error);
          if (code === "ENOENT" || code === "ENOTDIR" || code === 128)
            return failure("repository-root-invalid", error);
          throw error;
        }
        let project;
        try {
          project = await readProject(root, "worktree", signal);
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof SilvermoonError)
            return failure(
              ["config", "language", "missing"].includes(error.code)
                ? "project-configuration-invalid"
                : error.code === "root"
                  ? "repository-root-invalid"
                  : "project-layout-invalid",
              error,
            );
          if (error instanceof SyntaxError || error instanceof TypeError)
            return failure("project-layout-invalid", error);
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
          if (nativeCode(error) === 1) return failure("branch-detached", error);
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
            return failure("branch-upstream-mismatch", error);
          throw error;
        }
        let observed;
        try {
          observed = await primary(project, {
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
            const code =
              error.code === "primary-branch-missing"
                ? "primary-branch-missing"
                : error.code === "history"
                  ? "event-history-rewritten"
                  : error.code === "identity"
                    ? "idea-identity-modified"
                    : error.code === "git-status"
                      ? "worktree-uncommitted"
                      : "branch-upstream-mismatch";
            return failure(code, error);
          }
          throw error;
        }
        const problems: RuleFailure<
          "worktree-uncommitted" | "primary-sync-required"
        >[] = [];
        if (observed.changes.length)
          problems.push({
            code: "worktree-uncommitted",
            brief:
              "Commit all staged, unstaged and untracked content before continuing.",
          });
        if (observed.head !== observed.tip)
          problems.push({
            code: "primary-sync-required",
            brief: "Synchronize current HEAD to the observed primary tip.",
          });
        const [first, ...rest] = problems;
        return first
          ? { pass: false as const, problems: [first, ...rest] as const }
          : { pass: true as const, output: { project, observed } };
      });
    },
  });
  const observation = defineCheckpoint({
    id: "observation",
    target: Target,
    description: "解析 Idea，验证固定 Check 身份并从 events 推导事实。",
    rules: [
      { code: "idea-invalid", description: "必须能唯一解析符合协议的 Idea。" },
      { code: "abandoned", description: "Idea 不得处于显式放弃状态。" },
    ],
    check: async (target, context) => {
      const { project, observed } = context.outputOf(repository);
      invariant(
        target.idea,
        "internal",
        "Idea observation requires a selector.",
      );
      let current;
      try {
        current = selectIdea(project, target.idea);
      } catch (error) {
        if (error instanceof SilvermoonError)
          return failure("idea-invalid", error);
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
          { head: observed.head, primary: observed.project },
          context.outputOf(environment).userLanguage,
          context.signal,
        ),
      );
      if (state.level === "abandoned")
        return failure(
          "abandoned",
          "Idea is explicitly abandoned; only an authorized resume event can restore it.",
        );
      const facts = Object.fromEntries(
        Object.entries(state).filter(
          ([key]) => key !== "level" && key !== "next",
        ),
      );
      const brief = canonical({
        idea: current.bootstrap.id,
        ...facts,
        eventDigest: digest(current.eventSource),
        primary: observed.tip,
        subject: observed.head,
      });
      return { pass: true as const, output: { state, brief } };
    },
  });
  const consensus = gates.map((gate: Gate) =>
    defineCheckpoint({
      id: gate,
      target: Target,
      description: `核验 ${gate} 当前版本的明确确认与 primary 同步。`,
      rules: [
        {
          code: gate,
          description: `${gate} 必须存在绑定当前版本及前序向量的明确 signoff。`,
        },
        {
          code: "synchronization",
          description: `${gate} 内容与准确 signoff 必须同步至 primary。`,
        },
      ],
      check: async (
        _target,
        context,
      ): Promise<CheckpointResult<undefined, Gate | "synchronization">> => {
        await Promise.resolve();
        const { state, brief } = context.outputOf(observation);
        if (state.level === gate) return failure(gate, brief);
        if (state.level === "synchronization" && state.next === gate)
          return failure("synchronization", brief);
        return { pass: true, output: undefined };
      },
    }),
  );
  const implementation = defineCheckpoint({
    id: "implementation",
    target: Target,
    description: "核验全部实现环境的当前完整通过证据。",
    rules: [
      {
        code: "implementation",
        description: "所有实现用例必须由当前有效证据批次完整通过。",
      },
    ],
    check: async (
      _target,
      context,
    ): Promise<CheckpointResult<undefined, "implementation">> => {
      await Promise.resolve();
      const { state, brief } = context.outputOf(observation);
      return state.level === "implementation"
        ? failure("implementation", brief)
        : { pass: true, output: undefined };
    },
  });
  const deployment = defineCheckpoint({
    id: "deployment",
    target: Target,
    description: "核验部署证据完整通过且绑定当前实现批次。",
    rules: [
      {
        code: "deployment",
        description: "全部部署环境必须具备绑定当前实现摘要的完整通过批次。",
      },
    ],
    check: async (
      _target,
      context,
    ): Promise<CheckpointResult<undefined, "deployment">> => {
      await Promise.resolve();
      const { state, brief } = context.outputOf(observation);
      return state.level === "deployment"
        ? failure("deployment", brief)
        : { pass: true, output: undefined };
    },
  });
  const completion = defineCheckpoint({
    id: "completion",
    target: Target,
    description: "核验终态事实与最终同步。",
    rules: [
      {
        code: "completion-unsynchronized",
        description: "必须完成全部验收，且事件及证据已经提交并同步 primary。",
      },
    ],
    check: async (
      target,
      context,
    ): Promise<CheckpointResult<undefined, "completion-unsynchronized">> => {
      await Promise.resolve();
      const { state, brief } = context.outputOf(observation);
      invariant(
        state.level === "completed",
        "internal",
        "Prior checkpoints did not establish completed lifecycle facts.",
      );
      const { observed } = context.outputOf(repository);
      invariant(
        target.repoRoot,
        "internal",
        "Completion requires a repository.",
      );
      const current = await inGit(target, async () => ({
        changes: await git(
          target.repoRoot!,
          ["status", "--porcelain=v1", "--untracked-files=all"],
          context.signal,
        ),
        head: await git(
          target.repoRoot!,
          ["rev-parse", "--verify", "HEAD"],
          context.signal,
        ),
      }));
      return current.changes || current.head !== observed.tip
        ? failure("completion-unsynchronized", brief)
        : { pass: true, output: undefined };
    },
  });
  if (!target.repoRoot && !target.idea) return [environment] as const;
  if (!target.idea) return [environment, repository] as const;
  return [
    environment,
    repository,
    observation,
    ...consensus,
    implementation,
    deployment,
    completion,
  ] as const;
}
export function snapshotCheckpoints(runtime: Runtime) {
  return [
    defineCheckpoint({
      id: "snapshot",
      target: SnapshotTarget,
      description: "检查指定快照的结构及追加历史，不判断生命周期完成。",
      rules: [
        {
          code: "snapshot",
          description: "指定快照必须满足项目及事件历史协议。",
        },
      ],
      check: async (
        target,
        context,
      ): Promise<CheckpointResult<undefined, "snapshot">> => {
        try {
          invariant(
            target.repoRoot,
            "snapshot",
            "Select a Git repository root.",
          );
          await withGitContext(
            { userHome: target.userHome, ...runtime },
            async () => {
              const project = await readProject(
                target.repoRoot!,
                target.snapshot,
                context.signal,
              );
              await snapshotHistory(project, target.snapshot, context.signal);
            },
          );
          return { pass: true, output: undefined };
        } catch (error) {
          context.signal.throwIfAborted();
          if (
            error instanceof SilvermoonError ||
            error instanceof SyntaxError ||
            error instanceof TypeError ||
            ["ENOENT", "ENOTDIR"].includes(String(nativeCode(error)))
          )
            return failure("snapshot", error);
          throw error;
        }
      },
    }),
  ] as const;
}
export { Target, SnapshotTarget } from "./contract.js";
