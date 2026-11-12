import { type Files, Unconfirmed, record } from "./files.js";

export interface Project {
  directory: string;
  manifest: Record<string, unknown>;
  sources: string[];
  tests: string[];
}
export interface Command {
  directory: string;
  tool: string;
  args: string[];
}
export function words(command: string): string[] {
  if (/[\r\n`$<>|;&]/.test(command))
    throw new Unconfirmed("unsupported shell operators or interpolation");
  const result: string[] = [];
  let word = "";
  let quote = "";
  let started = false;
  for (const c of command.trim()) {
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\") throw new Unconfirmed("shell escape is unsupported");
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) {
        result.push(word);
        word = "";
        started = false;
      }
    } else {
      word += c;
      started = true;
    }
  }
  if (quote) throw new Unconfirmed("unterminated command quote");
  if (started) result.push(word);
  if (!result.length) throw new Unconfirmed("empty command");
  return result;
}
export function argument(command: Command, flag: string): string | undefined {
  const i = command.args.indexOf(flag);
  if (i >= 0) {
    const value = command.args[i + 1];
    if (!value || value.startsWith("-"))
      throw new Unconfirmed(`missing argument for ${flag}`);
    return value;
  }
  return command.args
    .find((value) => value.startsWith(`${flag}=`))
    ?.slice(flag.length + 1);
}
export function flag(command: Command, name: string): boolean {
  return command.args.includes(name) || command.args.includes(`${name}=true`);
}
export class Scripts {
  private expansions = 0;
  private terminals = 0;
  constructor(
    readonly files: Files,
    readonly projects: Project[],
  ) {}
  async expand(
    project: Project,
    script: string,
    stack: string[] = [],
  ): Promise<Command[]> {
    if (++this.expansions > 4096)
      throw new Unconfirmed("script expansion budget exceeds 4096");
    const key = `${project.directory}:${script}`;
    if (stack.includes(key) || stack.length > 32)
      throw new Unconfirmed("cyclic/excessive script delegation");
    const scripts = record(project.manifest.scripts ?? {});
    const value = scripts[script];
    if (typeof value !== "string")
      throw new Unconfirmed(`script is not a static string: ${key}`);
    // Lifecycle hooks can execute arbitrary programs before/after an apparently safe gate.
    if (
      scripts[`pre${script}`] !== undefined ||
      scripts[`post${script}`] !== undefined
    )
      throw new Unconfirmed(`script lifecycle hooks: ${key}`);
    const result: Command[] = [];
    for (const part of value.split("&&")) {
      const tokens = words(part);
      let tool = tokens.shift()!;
      if (
        [
          "exit",
          "return",
          "exec",
          "eval",
          "source",
          ".",
          "break",
          "continue",
          "set",
          "trap",
          "cd",
          "chdir",
          "pushd",
          "popd",
          "export",
          "unset",
          "alias",
          "unalias",
          "function",
          "if",
          "then",
          "else",
          "fi",
          "for",
          "do",
          "done",
          "while",
          "until",
          "case",
          "esac",
          "command",
          "builtin",
          "call",
          "start",
        ].includes(tool)
      )
        throw new Unconfirmed(`shell control/builtin is unsupported: ${tool}`);
      if (tool === "pnpm") {
        if (tokens[0] === "exec") {
          tokens.shift();
          tool = tokens.shift() ?? "";
        } else {
          if (tokens[0] === "run") tokens.shift();
          if (tokens.length !== 1 || tokens[0]?.startsWith("-"))
            throw new Unconfirmed(
              "only pnpm [run] script or pnpm exec tool delegation is supported",
            );
          result.push(
            ...(await this.expand(project, tokens[0]!, [...stack, key])),
          );
          continue;
        }
      }
      if (tool === "turbo") {
        if (
          tokens.shift() !== "run" ||
          !tokens.length ||
          tokens.some((t) => t.startsWith("-"))
        )
          throw new Unconfirmed("only unfiltered turbo run tasks is supported");
        const turboPath = this.files.path("", "turbo.json");
        if (!this.files.exists(turboPath))
          throw new Unconfirmed("turbo.json is missing");
        const config = await this.files.json(turboPath);
        const tasks = record(config.tasks);
        if (
          config.globalEnv !== undefined ||
          config.globalPassThroughEnv !== undefined
        )
          throw new Unconfirmed("Turbo environment overrides are unsupported");
        for (const task of tokens) {
          const definition = record(tasks[task]);
          if (
            definition.env !== undefined ||
            definition.passThroughEnv !== undefined ||
            definition.persistent === true
          )
            throw new Unconfirmed("dynamic/persistent Turbo task");
          for (const member of this.projects.filter(
            (p) => p.directory !== "",
          )) {
            if (
              this.files.exists(
                this.files.path(member.directory, "turbo.json"),
              ) ||
              this.files.exists(
                this.files.path(member.directory, "turbo.jsonc"),
              )
            )
              throw new Unconfirmed(
                "member-local Turbo configuration is unsupported",
              );
            const scripts = record(member.manifest.scripts ?? {});
            if (scripts[task] !== undefined)
              result.push(
                ...(await this.expand(member, task, [...stack, key])),
              );
          }
        }
      } else {
        if (!/^[\w.-]+$/.test(tool))
          throw new Unconfirmed("executable paths/assignments are unsupported");
        if (++this.terminals > 8192)
          throw new Unconfirmed("terminal command budget exceeds 8192");
        result.push({ directory: project.directory, tool, args: tokens });
      }
    }
    return result;
  }
}
