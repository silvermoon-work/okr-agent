import { stat } from "node:fs/promises";
import {
  defineCheckpoint,
  type RuleFailure,
} from "@silvermoon-work/check-task-sdk";
import type { Host, ToolEntry } from "../inspect.js";
import { Input, type Tool } from "../contract.js";
import type { InstallationRule } from "./model.js";

export function compareVersions(actual: string, expected: string): number {
  if (![actual, expected].every((v) => /^[0-9]+(?:\.[0-9]+)*$/.test(v)))
    throw new Error("Invalid numeric version.");
  const a = actual.split(".").map((p) => p.replace(/^0+(?=\d)/, ""));
  const b = expected.split(".").map((p) => p.replace(/^0+(?=\d)/, ""));
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? "0";
    const y = b[i] ?? "0";
    if (x.length !== y.length) return Math.sign(x.length - y.length);
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
type Fact =
  | { pass: true; entry: ToolEntry; version: string }
  | { pass: false; problems: [RuleFailure<InstallationRule>] };
export function toolChecks(input: Input, host: Host, signal: AbortSignal) {
  const r = input.requirements;
  const cwd = input.context.projectDirectory;
  const requested = new Set<Tool>();
  for (const name of ["node", "npm", "pnpm", "nvm", "nrm"] as const)
    if (r.tools?.[name]) requested.add(name);
  if (r.management) requested.add("nvm");
  if (r.registries?.nrm) requested.add("nrm");
  const inspectTool = async (name: Tool): Promise<Fact> => {
    signal.throwIfAborted();
    const entry = await host.locate(name, cwd);
    if (!entry)
      return {
        pass: false,
        problems: [
          {
            code: "tool-present",
            brief: `${name}：当前执行上下文中未找到所需工具。`,
          },
        ],
      };
    const output = await host.run(
      entry,
      [name === "nvm" && host.platform === "win32" ? "version" : "--version"],
      cwd,
      signal,
    );
    if (output.code !== 0)
      return {
        pass: false,
        problems: [
          {
            code: "tool-executable",
            brief: `${name}：版本命令不可用（退出码 ${String(output.code)}）；未输出可能含秘密的命令内容。`,
          },
        ],
      };
    const version = /^v?([0-9]+(?:\.[0-9]+)+)\s*$/.exec(
      output.stdout.trim(),
    )?.[1];
    if (!version)
      return {
        pass: false,
        problems: [
          {
            code: "tool-version-readable",
            brief: `${name}：成功执行版本命令，但无法识别其数字版本。`,
          },
        ],
      };
    return { pass: true, entry, version };
  };
  return defineCheckpoint({
    id: "installation",
    target: Input,
    description: "所需工具的安装、可执行性与版本就绪。",
    output: {
      description:
        "成功值是 Map<Tool, ToolEntry>，记录本次实际发现并验证的工具入口，供配置检查复用；不是 JSON 参数，不含完整环境变量或自动发布的版本日志。",
    },
    rules: [
      { code: "tool-present", description: "所需工具必须存在。" },
      { code: "tool-executable", description: "版本命令必须可执行。" },
      { code: "tool-version-readable", description: "版本输出必须可识别。" },
      { code: "tool-version-minimum", description: "版本必须满足声明下限。" },
    ],
    check: async () => {
      signal.throwIfAborted();
      if (!(await stat(cwd)).isDirectory())
        throw new Error("projectDirectory must exist and be a directory.");
      if (!["win32", "linux", "darwin"].includes(host.platform))
        throw new Error("Unsupported execution platform.");
      const entries = new Map<Tool, ToolEntry>();
      const problems: RuleFailure<InstallationRule>[] = [];
      for (const name of requested) {
        const value = await inspectTool(name);
        if (!value.pass) {
          problems.push(...value.problems);
          continue;
        }
        entries.set(name, value.entry);
        const minimum = r.tools?.[name]?.minimumVersion;
        if (minimum && compareVersions(value.version, minimum) < 0)
          problems.push({
            code: "tool-version-minimum",
            brief: `${name}：当前 ${value.version}，要求不低于 ${minimum}。`,
          });
      }
      const [first, ...rest] = problems;
      return first
        ? { pass: false, problems: [first, ...rest] }
        : { pass: true, output: entries };
    },
  });
}
