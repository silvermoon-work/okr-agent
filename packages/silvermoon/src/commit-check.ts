import {
  defineCheckpoint,
  type CheckpointResult,
  type RuleFailure,
} from "@silvermoon-work/check-task-sdk";
import { CommitTarget, type CommitRuleCode } from "./commit-contract.js";
import type { Runtime } from "./contract.js";
import { invariant, SilvermoonError, validIdeaId } from "./domain.js";
import { withGitContext } from "./git-context.js";
import {
  git,
  readProject,
  verifyIdeaHistory,
  verifyRepositoryRoot,
} from "./repository.js";

function failure<const Code extends CommitRuleCode>(
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
async function baseline(root: string, snapshot: string, signal: AbortSignal) {
  let revision: string | undefined;
  if (snapshot === "staged" || snapshot === "worktree") {
    try {
      revision = await git(
        root,
        ["rev-parse", "--verify", "--quiet", "HEAD"],
        signal,
      );
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof Error && "code" in error && error.code === 1))
        throw error;
    }
  } else {
    const parents = (
      await git(
        root,
        ["rev-list", "--parents", "--max-count=1", snapshot],
        signal,
      )
    ).split(/\s+/);
    revision = parents[1];
  }
  if (!revision) return undefined;
  const config = await git(
    root,
    ["ls-tree", "--name-only", revision, "--", ".silvermoon/config.yaml"],
    signal,
  );
  return config ? revision : undefined;
}

async function changedIdeas(
  root: string,
  snapshot: string,
  previous: string | undefined,
  signal: AbortSignal,
): Promise<ReadonlySet<string>> {
  const paths = previous
    ? await git(
        root,
        [
          "diff",
          "--name-only",
          "--no-renames",
          "-z",
          ...(snapshot === "staged" ? ["--cached"] : []),
          previous,
          ...(snapshot === "staged" || snapshot === "worktree"
            ? []
            : [snapshot]),
          "--",
          ".silvermoon/i",
        ],
        signal,
      )
    : snapshot === "worktree" || snapshot === "staged"
      ? await git(root, ["ls-files", "-z", "--", ".silvermoon/i"], signal)
      : await git(
          root,
          [
            "ls-tree",
            "-r",
            "--name-only",
            "-z",
            snapshot,
            "--",
            ".silvermoon/i",
          ],
          signal,
        );
  const untracked =
    snapshot === "worktree"
      ? await git(
          root,
          [
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            ".silvermoon/i",
          ],
          signal,
        )
      : "";
  const ids = new Set<string>();
  for (const path of (paths + "\0" + untracked).split("\0").filter(Boolean)) {
    const id = path.split("/")[2];
    invariant(
      id && validIdeaId(id),
      "layout",
      `Invalid new Idea path: ${path}`,
    );
    ids.add(id);
  }
  return ids;
}

export function commitCheckpoints(runtime: Runtime) {
  const inGit = <T>(target: CommitTarget, action: () => Promise<T>) =>
    withGitContext({ userHome: target.userHome, ...runtime }, action);
  const structure = defineCheckpoint({
    id: "commit-snapshot",
    target: CommitTarget,
    description:
      "候选快照中有变更的 Ideas 的完整内容与 Silvermoon 配置、协议结构有效。",
    output: {
      description:
        "本次已经固定的候选及基线内容，包含 Map 和原始字节；只在执行内共享。",
      fields: [
        {
          name: "project",
          description:
            "经结构核验的变更 Ideas 的完整候选；staged 仅包含 Git 索引内容。",
        },
        {
          name: "previous",
          description:
            "HEAD 或第一父提交对应的基线 Project；初始化且无既有元数据时为 undefined。",
        },
      ],
    },
    rules: [
      {
        code: "commit-snapshot-valid",
        description:
          "候选快照必须具备合法的 Silvermoon 配置，以及有变更 Ideas 的完整路径、文件和协议内容。",
      },
    ],
    check: async (target, context) => {
      try {
        const observation = await inGit(target, async () => {
          await verifyRepositoryRoot(target.repoRoot, context.signal);
          invariant(
            ["HEAD", "staged", "worktree"].includes(target.snapshot) ||
              /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(target.snapshot),
            "snapshot",
            "Select HEAD, staged, worktree or an exact commit ID.",
          );
          const snapshot =
            target.snapshot === "HEAD"
              ? await git(
                  target.repoRoot,
                  ["rev-parse", "--verify", "HEAD"],
                  context.signal,
                )
              : target.snapshot;
          const revision = await baseline(
            target.repoRoot,
            snapshot,
            context.signal,
          );
          const ids = await changedIdeas(
            target.repoRoot,
            snapshot,
            revision,
            context.signal,
          );
          const previous = revision
            ? await readProject(target.repoRoot, revision, context.signal, ids)
            : undefined;
          const project = await readProject(
            target.repoRoot,
            snapshot,
            context.signal,
            ids,
          );
          for (const id of target.allowDelete ?? [])
            invariant(
              previous?.ideas.has(id) && !project.ideas.has(id),
              "deletion",
              `Deletion exception requires a whole existing Idea to be removed: ${id}`,
            );
          return { project, previous };
        });
        return { pass: true as const, output: observation };
      } catch (error) {
        context.signal.throwIfAborted();
        if (
          error instanceof SilvermoonError &&
          ["git-context", "concurrent-edit", "internal"].includes(error.code)
        )
          throw error;
        const code =
          error instanceof Error && "code" in error ? error.code : undefined;
        if (
          error instanceof SilvermoonError ||
          error instanceof SyntaxError ||
          error instanceof TypeError ||
          code === "ENOENT" ||
          code === "ENOTDIR" ||
          code === 128
        )
          return failure("commit-snapshot-valid", error);
        throw error;
      }
    },
  });
  const history = defineCheckpoint({
    id: "commit-history",
    target: CommitTarget,
    description: "候选修改保留已有 Idea 身份并符合事件追加约束。",
    output: {
      description:
        "成功不新增数据，pass output 为 undefined；只证明候选合法，不表示 Idea 完成或自动提交。",
    },
    rules: [
      {
        code: "commit-history-idea-identity-immutable",
        description:
          "候选快照必须保留基线中已有 Idea 的 bootstrap 身份；仅允许显式声明的整体删除。",
      },
      {
        code: "commit-history-event-history-append-only",
        description: "候选事件必须保留基线事件的准确前缀，只能追加。",
      },
    ],
    check: async (
      target,
      context,
    ): Promise<
      CheckpointResult<
        undefined,
        | "commit-history-idea-identity-immutable"
        | "commit-history-event-history-append-only"
      >
    > => {
      await Promise.resolve();
      const { project: current, previous } = context.outputOf(structure);
      const problems: RuleFailure<
        | "commit-history-idea-identity-immutable"
        | "commit-history-event-history-append-only"
      >[] = [];
      for (const [id, before] of previous?.ideas ?? []) {
        if (!current.ideas.has(id) && target.allowDelete?.includes(id))
          continue;
        try {
          verifyIdeaHistory(current.ideas.get(id), before);
        } catch (error) {
          if (!(error instanceof SilvermoonError)) throw error;
          if (error.code !== "identity" && error.code !== "history")
            throw error;
          problems.push({
            code:
              error.code === "identity"
                ? "commit-history-idea-identity-immutable"
                : "commit-history-event-history-append-only",
            brief: `${id}: ${error.message}`,
          });
        }
      }
      const [first, ...rest] = problems;
      return first
        ? { pass: false, problems: [first, ...rest] }
        : { pass: true, output: undefined };
    },
  });
  return [structure, history] as const;
}
