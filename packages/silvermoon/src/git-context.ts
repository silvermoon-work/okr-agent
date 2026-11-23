import { AsyncLocalStorage } from "node:async_hooks";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import { invariant } from "./domain.js";

export interface GitContext {
  readonly userHome: string;
  readonly path: string;
  readonly sshAuthSock?: string;
}
const scoped = new AsyncLocalStorage<GitContext>();

export function withGitContext<T>(
  context: GitContext,
  operation: () => Promise<T>,
): Promise<T> {
  invariant(
    isAbsolute(context.userHome) &&
      !!context.path &&
      [context.userHome, context.path, context.sshAuthSock ?? ""].every(
        (value) => !/[\0\r\n]/.test(value),
      ) &&
      (context.sshAuthSock === undefined || isAbsolute(context.sshAuthSock)),
    "git-context",
    "Git requires an absolute userHome, a host executable search path and an optional absolute SSH agent socket.",
  );
  return scoped.run(context, operation);
}

export function gitEnvironment(): NodeJS.ProcessEnv {
  const context = scoped.getStore() ?? {
    userHome: homedir(),
    path: process.env.PATH ?? "",
    sshAuthSock: process.env.SSH_AUTH_SOCK,
  };
  invariant(
    context.path,
    "git-context",
    "Git executable search path is missing.",
  );
  return {
    PATH: context.path,
    HOME: context.userHome,
    USERPROFILE: context.userHome,
    ...(context.sshAuthSock ? { SSH_AUTH_SOCK: context.sshAuthSock } : {}),
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.WINDIR ? { WINDIR: process.env.WINDIR } : {}),
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
  };
}
