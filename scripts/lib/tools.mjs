import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";

export function pnpm(args, options = {}) {
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
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal)
    throw new Error(`pnpm ${args.join(" ")} failed`);
  return result.stdout;
}

export function workspaces(root = process.cwd()) {
  root = realpathSync.native(root);
  const entries = JSON.parse(
    pnpm(["--recursive", "list", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }),
  );
  const directories = new Set();
  return entries
    .filter(({ path }) => path !== root)
    .map(({ path }) => {
      const directory = relative(root, path);
      if (
        !directory ||
        isAbsolute(directory) ||
        directory === ".." ||
        directory.startsWith(`..${sep}`) ||
        resolve(root, directory) !== path ||
        directories.has(directory)
      )
        throw new Error(`Invalid workspace path: ${path}`);
      directories.add(directory);
      let current = root;
      for (const part of directory.split(sep)) {
        current = resolve(current, part);
        if (
          lstatSync(current).isSymbolicLink() ||
          realpathSync(current) !== current
        )
          throw new Error(`Redirected workspace path: ${current}`);
      }
      return {
        directory: directory.split(sep).join("/"),
        manifest: JSON.parse(
          readFileSync(resolve(path, "package.json"), "utf8"),
        ),
      };
    });
}
