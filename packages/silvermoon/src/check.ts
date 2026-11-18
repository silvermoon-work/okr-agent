import {
  defineChecker,
  type CheckerResult,
} from "@silvermoon-work/check-task-sdk";
import { Input } from "./contract.js";
import { inspectDevice, deviceLanguage } from "./device.js";
import { canonical, digest, invariant, type State } from "./domain.js";
import { withGitContext } from "./git-context.js";
import {
  draftChanges,
  primary,
  observedIdeaState,
  readProject,
  selectIdea,
  snapshotHistory,
  type Primary,
  type Project,
} from "./repository.js";

type SilvermoonResult = CheckerResult<{
  readonly checker: "device" | "project" | "idea";
  readonly target: Input;
}>;
function failure(code: string, error: unknown): SilvermoonResult {
  return {
    pass: false,
    problems: [
      { code, brief: error instanceof Error ? error.message : String(error) },
    ],
  };
}
export function silvermoonRegistry(bundleCid: string) {
  let project: Project | undefined;
  let observed: Primary | undefined;
  let state: State | undefined;
  return {
    device: defineChecker({
      target: Input,
      check: async (request, signal): Promise<SilvermoonResult> => {
        const { target, operation, runtime } = request;
        signal.throwIfAborted();
        if (operation.mode === "snapshot")
          return {
            pass: true,
            children: [{ checker: "project", target: request }],
          };
        try {
          await inspectDevice({ home: target.userHome, ...runtime });
        } catch (error) {
          signal.throwIfAborted();
          return failure("device", error);
        }
        return {
          pass: true,
          children:
            target.repoRoot || target.idea
              ? [{ checker: "project", target: request }]
              : [],
        };
      },
    }),
    project: defineChecker({
      target: Input,
      check: async (request, signal): Promise<SilvermoonResult> => {
        const { target, operation, runtime } = request;
        try {
          invariant(
            target.repoRoot,
            "project",
            "Select a Git repository root.",
          );
          return await withGitContext(
            {
              userHome: target.userHome,
              path: runtime.path,
              ...(runtime.sshAuthSock
                ? { sshAuthSock: runtime.sshAuthSock }
                : {}),
            },
            async (): Promise<SilvermoonResult> => {
              invariant(
                target.repoRoot,
                "project",
                "Select a Git repository root.",
              );
              project = await readProject(
                target.repoRoot,
                operation.mode === "snapshot"
                  ? (operation.snapshot ?? "HEAD")
                  : "worktree",
                signal,
              );
              if (operation.mode === "snapshot") {
                await snapshotHistory(
                  project,
                  operation.snapshot ?? "HEAD",
                  signal,
                );
                return { pass: true, children: [] };
              }
              try {
                observed = await primary(project, {
                  fetch: operation.refresh ?? true,
                  signal,
                });
                if (!target.idea) {
                  invariant(
                    !observed.changes.length && observed.head === observed.tip,
                    "repository",
                    "Commit/synchronize local content to the configured primary; no automatic Git writes are performed.",
                  );
                  return { pass: true, children: [] };
                }
                const current = selectIdea(project, target.idea);
                invariant(
                  current.bootstrap.checkCid === bundleCid,
                  "check-identity",
                  "The executing Check CID does not match the Idea's immutable bootstrap.",
                );
                state = await observedIdeaState(
                  project,
                  current,
                  {
                    head: observed.head,
                    primary: observed.project,
                  },
                  await deviceLanguage({ home: target.userHome }),
                  signal,
                );
                invariant(
                  draftChanges(
                    observed.changes,
                    current.bootstrap.id,
                    state.level,
                  ),
                  "repository",
                  "Unrelated or mixed worktree changes block Idea routing. Preserve them; never auto-clean/stage/commit.",
                );
              } catch (error) {
                signal.throwIfAborted();
                return failure("repository", error);
              }
              return {
                pass: true,
                children: [{ checker: "idea", target: request }],
              };
            },
          );
        } catch (error) {
          signal.throwIfAborted();
          return failure(
            operation.mode === "snapshot" ? "snapshot" : "project",
            error,
          );
        }
      },
    }),
    idea: defineChecker({
      target: Input,
      check: (request, signal): Promise<SilvermoonResult> =>
        Promise.resolve().then((): SilvermoonResult => {
          const { target } = request;
          signal.throwIfAborted();
          invariant(
            project && observed && state && target.idea,
            "internal",
            "Idea requires its Project prerequisite.",
          );
          const current = selectIdea(project, target.idea);
          if (state.level === "completed") {
            if (observed.changes.length || observed.head !== observed.tip)
              return failure(
                "repository",
                "Synchronize current evidence and events to primary before completion.",
              );
            return { pass: true, children: [] };
          }
          return failure(
            state.level,
            canonical({
              idea: current.bootstrap.id,
              ...state,
              eventDigest: digest(current.eventSource),
              primary: observed.tip,
              subject: observed.head,
            }),
          );
        }),
    }),
  };
}
export { Input } from "./contract.js";
