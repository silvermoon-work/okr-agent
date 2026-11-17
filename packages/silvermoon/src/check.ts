import {
  defineChecker,
  type CheckerResult,
} from "@silvermoon-work/check-task-sdk";
import { Input } from "./contract.js";
import { inspectDevice, deviceLanguage } from "./device.js";
import { canonical, digest, invariant, type State } from "./domain.js";
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
      check: async (target, signal): Promise<SilvermoonResult> => {
        signal.throwIfAborted();
        if (target.mode === "snapshot")
          return { pass: true, children: [{ checker: "project", target }] };
        try {
          await inspectDevice(target.device);
        } catch (error) {
          signal.throwIfAborted();
          return failure("device", error);
        }
        return {
          pass: true,
          children: target.root ? [{ checker: "project", target }] : [],
        };
      },
    }),
    project: defineChecker({
      target: Input,
      check: async (target, signal): Promise<SilvermoonResult> => {
        try {
          invariant(target.root, "project", "Select a Git repository root.");
          project = await readProject(
            target.root,
            target.mode === "snapshot"
              ? (target.snapshot ?? "HEAD")
              : "worktree",
            signal,
          );
          if (target.mode === "snapshot") {
            await snapshotHistory(project, target.snapshot ?? "HEAD", signal);
            return { pass: true, children: [] };
          }
        } catch (error) {
          signal.throwIfAborted();
          return failure(
            target.mode === "snapshot" ? "snapshot" : "project",
            error,
          );
        }
        try {
          observed = await primary(project, {
            fetch: target.refresh ?? true,
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
            await deviceLanguage(target.device),
            signal,
          );
          invariant(
            draftChanges(observed.changes, current.bootstrap.id, state.level),
            "repository",
            "Unrelated or mixed worktree changes block Idea routing. Preserve them; never auto-clean/stage/commit.",
          );
        } catch (error) {
          signal.throwIfAborted();
          return failure("repository", error);
        }
        return { pass: true, children: [{ checker: "idea", target }] };
      },
    }),
    idea: defineChecker({
      target: Input,
      check: (target, signal): Promise<SilvermoonResult> =>
        Promise.resolve().then((): SilvermoonResult => {
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
