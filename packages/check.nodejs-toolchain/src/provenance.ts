import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Device, ToolFact } from "./device.js";
import { absoluteHostPath } from "./execution-context.js";
import { errorCode } from "./command.js";
import { within, type NpmLocation } from "./legacy/inspect.js";

export async function managed(
  device: Device,
  nvm: ToolFact,
  tool: ToolFact,
  signal: AbortSignal,
  npm?: NpmLocation,
): Promise<boolean> {
  const { host, directory } = device;
  const paths = npm ? [npm.cli, npm.node] : [tool.realPath];
  if (paths.some((path) => !path)) return false;
  const roots: string[] = [];
  if (host.platform === "win32") {
    const root = await host.run(nvm, ["root"], directory, signal);
    const installed = await host.run(nvm, ["list"], directory, signal);
    const base = /^Current Root:\s*(.+)$/im
      .exec(root.stdout.trim())?.[1]
      ?.trim();
    if (
      root.code !== 0 ||
      installed.code !== 0 ||
      !base ||
      !absoluteHostPath(base)
    )
      throw new Error("Cannot establish nvm-windows managed installations.");
    const lines = installed.stdout.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) throw new Error("Empty nvm installed-version output.");
    if (!/^No installations recognized\.?$/i.test(installed.stdout.trim()))
      for (const line of lines) {
        const version =
          /^\s*\*?\s*v?(\d+\.\d+\.\d+)(?:\s+\(Currently using (?:32|64)-bit executable\))?\s*$/i.exec(
            line,
          )?.[1];
        if (!version) throw new Error("Unknown nvm installed-version output.");
        roots.push(await host.canonical(join(base, `v${version}`)));
      }
  } else {
    const home = host.env.NVM_DIR;
    if (!home || !absoluteHostPath(home))
      throw new Error("Device NVM_DIR is unavailable.");
    const base = await host.canonical(join(home, "versions", "node"));
    for (const path of paths) {
      if (!path || !within(base, path)) continue;
      const version = relative(base, path).split(sep)[0];
      if (!version || !/^v\d+\.\d+\.\d+$/.test(version))
        throw new Error("Unknown Unix nvm installation layout.");
      const root = await host.canonical(join(base, version));
      const result = await host.run(nvm, ["which", version], directory, signal);
      const selected = result.stdout.trim();
      if (
        result.code !== 0 ||
        !isAbsolute(selected) ||
        /[\r\n\0]/.test(selected) ||
        !within(root, await host.canonical(selected))
      )
        throw new Error("Cannot establish Unix nvm installation provenance.");
      roots.push(root);
    }
  }
  return paths.every(
    (path) => path && roots.some((root) => within(root, path)),
  );
}

export async function paired(
  device: Device,
  node: ToolFact,
  npm: NpmLocation,
): Promise<boolean> {
  if (!node.realPath || node.realPath !== npm.node) return false;
  const prefix = dirname(node.realPath);
  for (const candidate of [
    join(prefix, "node_modules", "npm", "bin", "npm-cli.js"),
    join(prefix, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ]) {
    try {
      if ((await device.host.canonical(candidate)) === resolve(npm.cli))
        return true;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(errorCode(error) ?? "")) throw error;
    }
  }
  return false;
}
