import { spawnSync } from "node:child_process";
import process from "node:process";

export function pnpm(args) {
  const cli = process.env.npm_execpath;
  const executable =
    process.platform === "win32" && cli
      ? cli.endsWith(".exe")
        ? cli
        : process.execPath
      : "pnpm";
  const parameters = executable === process.execPath ? [cli, ...args] : args;
  const result = spawnSync(executable, parameters, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal)
    throw new Error(`pnpm ${args.join(" ")} failed`);
}
