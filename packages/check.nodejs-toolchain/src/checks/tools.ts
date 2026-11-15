import { defineChecker, type Problem } from "@silvermoon-work/check-task-sdk";
import type { Host, ToolEntry } from "../inspect.js";
import type { Input, ProblemCode, Tool } from "../contract.js";
import { schemas, type Item, type Result } from "./model.js";

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
  | { pass: false; problems: [Problem<ProblemCode>] };
export function toolChecks(input: Input, host: Host, signal: AbortSignal) {
  const r = input.requirements;
  const cwd = input.context.projectDirectory;
  const requested = new Set<Tool>();
  for (const name of ["node", "npm", "pnpm", "nvm", "nrm"] as const)
    if (r.tools?.[name]) requested.add(name);
  if (r.management) requested.add("nvm");
  if (r.registries?.nrm) requested.add("nrm");
  const facts = new Map<string, Promise<Fact>>();
  const inspectTool = async (name: Tool): Promise<Fact> => {
    signal.throwIfAborted();
    const entry = await host.locate(name, cwd);
    if (!entry)
      return {
        pass: false,
        problems: [
          {
            code: "tool-missing",
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
            code: "tool-unusable",
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
            code: "version-unparseable",
            brief: `${name}：成功执行版本命令，但无法识别其数字版本。`,
          },
        ],
      };
    return { pass: true, entry, version };
  };
  const fact = (name: Tool): Promise<Fact> => {
    if (!requested.has(name)) throw new Error("Undeclared tool requirement.");
    let value = facts.get(name);
    if (!value) {
      value = inspectTool(name);
      facts.set(name, value);
    }
    return value;
  };
  const registry = {
    tool: defineChecker({
      target: schemas.tool,
      check: async ({ name }): Promise<Result> => {
        const value = await fact(name);
        if (!value.pass) return value;
        const children: Item[] = [];
        if (r.tools?.[name]?.minimumVersion)
          children.push({ checker: "minimum", target: { name } });
        if (
          (name === "node" || name === "npm") &&
          r.pairing?.npmWithNode &&
          (await fact(name === "node" ? "npm" : "node")).pass
        )
          children.push({ checker: "pairing", target: {} });
        if (
          (name === "node" || name === "npm") &&
          r.management?.appliesTo.includes(name) &&
          (await fact("nvm")).pass
        )
          children.push({ checker: "management", target: { name } });
        if ((name === "npm" || name === "pnpm") && r.registries?.active?.[name])
          children.push({ checker: "registry", target: { name } });
        if (name === "nrm" && r.registries?.nrm)
          children.push({ checker: "nrm", target: {} });
        return { pass: true, children };
      },
    }),
    minimum: defineChecker({
      target: schemas.minimum,
      check: async ({ name }): Promise<Result> => {
        const value = await fact(name);
        if (!value.pass) return value;
        const minimum = r.tools?.[name]?.minimumVersion;
        if (!minimum) throw new Error("Undeclared minimum requirement.");
        return compareVersions(value.version, minimum) < 0
          ? {
              pass: false,
              problems: [
                {
                  code: "version-too-low",
                  brief: `${name}：当前 ${value.version}，要求不低于 ${minimum}。`,
                },
              ],
            }
          : { pass: true, children: [] };
      },
    }),
  };
  return { requested, fact, registry };
}
