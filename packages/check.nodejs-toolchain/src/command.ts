import { execFile, spawn } from "node:child_process";
import { isAbsolute, join } from "node:path";

export interface CommandResult {
  readonly code: number | null;
  readonly stdout: string;
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error
    ? String(error.code)
    : undefined;
}

export async function stopTree(pid: number): Promise<void> {
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (errorCode(error) !== "ESRCH") throw error;
    }
    return;
  }
  const root = process.env.SystemRoot;
  if (!root || !isAbsolute(root))
    throw new Error("Cannot locate Windows process cleanup utility.");
  await new Promise<void>((resolve, reject) => {
    execFile(
      join(root, "System32", "taskkill.exe"),
      ["/PID", String(pid), "/T", "/F"],
      { timeout: 5000, windowsHide: true },
      (error) => {
        if (error) reject(new Error("Process tree cleanup failed."));
        else resolve();
      },
    );
  });
}

export async function execute(
  executable: string,
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
  timeoutMs = 10_000,
  stop: (pid: number) => Promise<void> = stopTree,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CommandResult> {
  signal.throwIfAborted();
  if (
    !isAbsolute(executable) ||
    [executable, ...args].some((s) => /[\0\r\n]/.test(s))
  )
    throw new Error("Invalid internal command.");
  let command = executable;
  let argv = [...args];
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(executable)) {
    // Only fixed, read-only arguments reach cmd. Reject expansion/metacharacters in PATH entries.
    if (
      /[%"!^&|<>]/.test(executable) ||
      args.some((a) => !/^[a-zA-Z0-9-]+$/.test(a))
    )
      throw new Error("Unsupported Windows shim path or arguments.");
    const root = process.env.SystemRoot;
    if (!root || !isAbsolute(root))
      throw new Error("Windows system directory unavailable.");
    command = join(root, "System32", "cmd.exe");
    argv = ["/d", "/s", "/c", `""${executable}" ${args.join(" ")}"`];
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd,
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: command !== executable,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...env,
        COREPACK_ENABLE_NETWORK: "0",
        COREPACK_ENABLE_AUTO_PIN: "0",
        npm_config_manage_package_manager_versions: "false",
        npm_config_update_notifier: "false",
        NO_UPDATE_NOTIFIER: "1",
      },
    });
    let stdout = "";
    let bytes = 0;
    let failure: Error | undefined;
    let cleanup: Promise<void> | undefined;
    const terminate = (error: Error) => {
      if (failure) return;
      failure = error;
      if (child.pid !== undefined) {
        cleanup = stop(child.pid);
        // Attach immediately; the close handler still awaits the same rejection.
        void cleanup.catch(() => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(new Error("Tool process tree cleanup failed."));
        });
      }
    };
    const abort = () => {
      terminate(new Error("Tool command cancelled."));
    };
    const timer = setTimeout(() => {
      terminate(new Error("Tool command timed out."));
    }, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    for (const [stream, capture] of [
      [child.stdout, true],
      [child.stderr, false],
    ] as const) {
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 262_144)
          terminate(new Error("Tool output limit exceeded."));
        else if (capture) stdout += chunk.toString("utf8");
      });
    }
    let startCode: number | undefined;
    child.once("error", (error) => {
      if (["EACCES", "ENOEXEC", "EPERM"].includes(errorCode(error) ?? ""))
        startCode = 126;
      else failure ??= new Error("Tool process could not be started.");
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      void (async () => {
        if (cleanup) await cleanup;
        if (failure) throw failure;
        if (code === null && startCode === undefined)
          throw new Error("Tool process terminated unexpectedly.");
        resolve({ code: startCode ?? code, stdout });
      })().catch(reject);
    });
  });
}
