import { parseDocument } from "yaml";
import type { ProblemReporter } from "@silvermoon-work/check-task-sdk";
import type { Input, ProblemCode } from "./contract.js";
import {
  Files,
  Unconfirmed,
  glob,
  matches,
  record,
  slash,
  stringArray,
} from "./files.js";
import {
  compilerConsistency,
  javascript,
  tsconfig,
  type TsConfig,
  typeAwarePreset,
  typescriptPreset,
} from "./static.js";
import {
  Scripts,
  argument,
  flag,
  words,
  type Command,
  type Project,
} from "./commands.js";
import {
  metrics,
  normalizeRequirements,
  type Capability,
  type Requirements,
} from "./requirements.js";
import { relative, resolve } from "node:path";

type Domain =
  | "dependency"
  | "typescript"
  | "lint"
  | "formatting"
  | "testing"
  | "coverage"
  | "gate"
  | "ci";
type Status = "missing" | "mismatch" | "unconfirmed";
const strictFlags = [
  "alwaysStrict",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "noImplicitAny",
  "noImplicitThis",
  "useUnknownInCatchVariables",
  "strictBuiltinIteratorReturn",
];
function yaml(text: string): Record<string, unknown> {
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw new Unconfirmed("invalid YAML");
  return record(document.toJS({ maxAliasCount: 32 }) as unknown);
}
function localPath(base: string, path: string): string {
  return slash(relative(resolve(base), resolve(path)));
}
function chosen(project: Project, source: boolean, tests: boolean): string[] {
  return [...(source ? project.sources : []), ...(tests ? project.tests : [])];
}
function patternsCover(
  files: Files,
  base: string,
  patterns: unknown,
  targets: string[],
): boolean {
  const list = stringArray(patterns);
  // Validate every pattern, not just the first matching branch.
  for (const pattern of list) glob(pattern, "");
  return targets.every((path) =>
    list.some((pattern) =>
      glob(pattern, localPath(files.path("", base), path)),
    ),
  );
}

export async function inspect(
  input: Input,
  signal: AbortSignal,
  report: ProblemReporter<ProblemCode>,
): Promise<void> {
  const normalized = normalizeRequirements(input.requirements);
  if (!normalized.ok)
    throw new Error(
      `Invalid requirements at ${normalized.error.path}: ${normalized.error.reason}`,
    );
  const requirements = normalized.requirements;
  const files = new Files(input.context.projectDirectory, signal);
  const uncertain = new Set<Domain>();
  const issue = (domain: Domain, status: Status, evidence: string) => {
    if (status === "unconfirmed") uncertain.add(domain);
    report(`${domain}-${status}` as ProblemCode, evidence);
  };
  const section = async (
    domain: Domain,
    action: () => Promise<void> | void,
  ): Promise<void> => {
    signal.throwIfAborted();
    try {
      await action();
    } catch (error) {
      if (!(error instanceof Unconfirmed)) throw error;
      issue(domain, "unconfirmed", error.message);
    }
  };
  try {
    await files.scan();
  } catch (error) {
    if (!(error instanceof Unconfirmed)) throw error;
    report("scope-unconfirmed", error.message);
    return;
  }
  if (files.links.length) {
    report("scope-unconfirmed", `未跟随符号链接: ${files.links.join(", ")}`);
    return;
  }
  if (!files.exists("package.json")) {
    report("scope-unconfirmed", "根目录缺少 package.json，无法确定项目范围");
    return;
  }
  let projects: Project[];
  try {
    projects = await discover(files, input.context.projectScopes);
  } catch (error) {
    if (!(error instanceof Unconfirmed)) throw error;
    report("scope-unconfirmed", error.message);
    return;
  }
  const root = projects[0]!;
  try {
    if (files.exists("pnpm-workspace.yaml")) {
      const workspace = yaml(await files.text("pnpm-workspace.yaml"));
      if (
        workspace.scriptShell !== undefined ||
        workspace.pnpmfile !== undefined
      )
        throw new Unconfirmed(
          "custom pnpm script shell/package hooks are unsupported",
        );
    }
    for (const project of projects) {
      const npmrc = files.path(project.directory, ".npmrc");
      if (
        files.exists(npmrc) &&
        /^\s*(?:script-shell|scriptShell|pnpmfile)\s*=/m.test(
          await files.text(npmrc),
        )
      )
        throw new Unconfirmed(
          `${npmrc}: custom script shell/package hooks are unsupported`,
        );
      if (
        [".pnpmfile.cjs", ".pnpmfile.mjs"].some((name) =>
          files.exists(files.path(project.directory, name)),
        )
      )
        throw new Unconfirmed(
          `${project.directory || "."}: pnpm package hooks are not interpreted`,
        );
    }
  } catch (error) {
    if (!(error instanceof Unconfirmed)) throw error;
    report("scope-unconfirmed", error.message);
    return;
  }
  const scripts = new Scripts(files, projects);
  const allCommands = new Map<string, Command[]>();
  const scriptErrors: string[] = [];
  // Inspect commands as data, never invoke them. Unrelated scripts do not poison a known gate.
  for (const project of projects) {
    for (const name of Object.keys(
      record(project.manifest.scripts ?? {}),
    ).sort()) {
      try {
        allCommands.set(
          `${project.directory}:${name}`,
          await scripts.expand(project, name),
        );
      } catch (error) {
        if (!(error instanceof Unconfirmed)) throw error;
        scriptErrors.push(`${project.directory}:${name}: ${error.message}`);
      }
    }
  }
  const commandKey = (command: Command) =>
    JSON.stringify([command.directory, command.tool, command.args]);
  const commands = [
    ...new Map(
      [...allCommands.values()]
        .flat()
        .map((command) => [commandKey(command), command]),
    ).values(),
  ];
  await section("dependency", () => {
    const r = requirements.dependencyManagement;
    if (!r.enabled) return;
    const declared = root.manifest.packageManager;
    if (declared === undefined)
      issue("dependency", "missing", "package.json: packageManager 未声明");
    else if (typeof declared !== "string")
      throw new Unconfirmed("packageManager is not a string");
    else {
      const version =
        /^pnpm@(\d+)\.(\d+)\.(\d+)(?:\+sha(?:224|256|384|512)\.[a-f0-9]+)?$/.exec(
          declared,
        );
      if (!version)
        throw new Unconfirmed(
          "packageManager requires an exact stable pnpm version",
        );
      const actual = version.slice(1, 4).map(Number);
      const minimum = r.minimumVersion.split(".").map(Number);
      if (actual.some((v) => !Number.isSafeInteger(v)))
        throw new Unconfirmed("packageManager version exceeds numeric bounds");
      const delta =
        actual.map((v, i) => v - minimum[i]!).find((v) => v !== 0) ?? 0;
      if (delta < 0)
        issue(
          "dependency",
          "mismatch",
          `packageManager ${declared} < pnpm@${r.minimumVersion}`,
        );
    }
    if (r.lockfile && !files.exists("pnpm-lock.yaml"))
      issue("dependency", "missing", "缺少 pnpm-lock.yaml");
  });
  const proved = new Map<Command, Set<Capability>>();
  const prove = (command: Command, capability: Capability) => {
    let set = proved.get(command);
    if (!set) {
      set = new Set();
      proved.set(command, set);
    }
    set.add(capability);
  };
  // Commands reconstructed for each script are distinct objects; stable keys reconnect their evidence.
  const key = commandKey;
  const evidence = new Map<string, Set<Capability>>();
  if (
    requirements.typescript.enabled &&
    !projects.some(
      (project) => project.sources.length + project.tests.length > 0,
    )
  )
    issue(
      "typescript",
      "unconfirmed",
      "启用 TypeScript 要求，但项目范围内没有可观察的 TS 源码或测试",
    );
  for (const project of projects) {
    const prefix = project.directory || ".";
    const own = commands.filter((c) => c.directory === project.directory);
    const applicable = project.sources.length + project.tests.length > 0;
    await section("typescript", async () => {
      const r = requirements.typescript;
      if (!r.enabled || !applicable) return;
      if (r.declaredDependency) {
        const declaration = dependency(projects, project, "typescript");
        if (declaration === undefined)
          issue(
            "typescript",
            "missing",
            `${prefix}: 未声明 typescript 依赖（自身或工作区根）`,
          );
        else if (typeof declaration !== "string" || !declaration.trim())
          throw new Unconfirmed(
            `${prefix}: TypeScript dependency declaration is not a nonempty string`,
          );
      }
      const targets = chosen(project, r.includeSource, r.includeTests);
      const candidates = own.filter((c) => c.tool === "tsc");
      if (!candidates.length) {
        issue(
          "typescript",
          scriptErrors.length ? "unconfirmed" : "missing",
          `${prefix}: 未确认 tsc 检查入口`,
        );
        return;
      }
      let valid = false;
      const failuresByCandidate: { status: Status; brief: string }[] = [];
      for (const command of candidates) {
        try {
          validateArguments(
            command,
            ["--noEmit", "--incremental", "--pretty"],
            ["-p", "--project"],
          );
          if (positional(command, ["-p", "--project"]).length)
            throw new Unconfirmed("tsc positional files are not supported");
          const path = files.path(
            project.directory,
            argument(command, "-p") ??
              argument(command, "--project") ??
              "tsconfig.json",
          );
          if (!files.exists(path)) {
            failuresByCandidate.push({
              status: "missing",
              brief: `${path}: 配置缺失`,
            });
            continue;
          }
          const config = await tsconfig(files, path);
          if (config.references.length)
            throw new Unconfirmed(
              "tsc project-reference execution requires tsc --build (not supported)",
            );
          const failures = compilerConsistency(config.options);
          for (const option of ["strict", ...strictFlags, ...r.safetyOptions]) {
            if (
              config.options[option] !== undefined &&
              typeof config.options[option] !== "boolean"
            )
              throw new Unconfirmed(`${path}: ${option} is not a boolean`);
          }
          if (
            r.strict &&
            strictFlags.some(
              (name) =>
                config.options[name] === false ||
                (config.options.strict !== true &&
                  config.options[name] !== true),
            )
          )
            failures.push("有效 strict 子选项不完整或被关闭");
          for (const option of r.safetyOptions)
            if (config.options[option] !== true)
              failures.push(`${option} != true`);
          if (!targets.every((target) => tsIncludes(files, config, target)))
            failures.push("源文件/测试未全部纳入该 tsc 配置");
          if (failures.length)
            failuresByCandidate.push({
              status: "mismatch",
              brief: `${path}: ${failures.join("; ")}`,
            });
          else {
            prove(command, "typecheck");
            valid = true;
          }
        } catch (error) {
          if (!(error instanceof Unconfirmed)) throw error;
          failuresByCandidate.push({
            status: "unconfirmed",
            brief: `${prefix}: ${error.message}`,
          });
        }
      }
      if (!valid)
        for (const failure of failuresByCandidate)
          issue("typescript", failure.status, failure.brief);
      if (!valid && !targets.length)
        issue("typescript", "unconfirmed", `${prefix}: 无可确认的检查范围`);
    });
    await section("lint", async () => {
      const r = requirements.lint;
      if (!r.enabled || !applicable) return;
      const targets = chosen(project, r.includeSource, r.includeTests);
      const candidates = own.filter((c) => c.tool === "eslint");
      if (!candidates.length) {
        issue(
          "lint",
          scriptErrors.length ? "unconfirmed" : "missing",
          `${prefix}: 未确认 ESLint 检查入口`,
        );
        return;
      }
      for (const command of candidates) {
        validateArguments(
          command,
          ["--no-warn-ignored"],
          ["--max-warnings", "--config", "-c"],
        );
        const explicit =
          argument(command, "--config") ?? argument(command, "-c");
        const path = explicit
          ? files.path(project.directory, explicit)
          : findConfig(files, project.directory, [
              "eslint.config.js",
              "eslint.config.mjs",
              "eslint.config.ts",
              "eslint.config.cjs",
              "eslint.config.mts",
              "eslint.config.cts",
            ]);
        if (!path) {
          issue("lint", "missing", `${prefix}: 缺少 ESLint flat config`);
          continue;
        }
        const raw = javascript(await files.text(path));
        if (!Array.isArray(raw))
          throw new Unconfirmed(
            "ESLint default export must be a flat array/config wrapper",
          );
        const configs = raw.flat().map(record);
        const configBase = files.parent(path);
        const positions = positional(command, [
          "--max-warnings",
          "--config",
          "-c",
        ]);
        if (!positions.length)
          throw new Unconfirmed("ESLint target is implicit");
        const failures: string[] = [];
        for (const target of targets) {
          if (!explicit) {
            const effective = findConfig(files, files.parent(target), [
              "eslint.config.js",
              "eslint.config.mjs",
              "eslint.config.ts",
              "eslint.config.cjs",
              "eslint.config.mts",
              "eslint.config.cts",
            ]);
            if (effective !== path)
              throw new Unconfirmed(
                `${target}: per-file ESLint configuration differs from the CLI scope config`,
              );
          }
          const rel = localPath(files.path("", configBase), target);
          if (!commandTargets(files, command, positions, target)) {
            failures.push(`${target}: CLI 未覆盖`);
            continue;
          }
          let typed = false;
          let tsPreset = false;
          let projectService = false;
          let ignored = false;
          for (const config of configs) {
            const allowed = [
              "files",
              "ignores",
              "languageOptions",
              "rules",
              "name",
              "settings",
            ];
            if (Object.keys(config).some((k) => !allowed.includes(k)))
              throw new Unconfirmed("unsupported ESLint configuration key");
            if (config.ignores !== undefined) {
              const isIgnored = matches(config.ignores, rel);
              if (
                Object.keys(config).every(
                  (k) => k === "ignores" || k === "name",
                )
              ) {
                if (isIgnored) ignored = true;
                continue;
              }
              if (isIgnored) continue;
            }
            if (config.files !== undefined && !matches(config.files, rel))
              continue;
            if ((config as Record<symbol, unknown>)[typeAwarePreset] === true)
              typed = true;
            if ((config as Record<symbol, unknown>)[typescriptPreset] === true)
              tsPreset = true;
            if (config.languageOptions !== undefined) {
              const language = record(config.languageOptions);
              if (
                language.parser !== undefined ||
                language.processor !== undefined
              )
                throw new Unconfirmed(
                  "custom ESLint parser/processor is unsupported",
                );
              if (language.parserOptions !== undefined) {
                const parser = record(language.parserOptions);
                if (
                  Object.keys(parser).some(
                    (key) =>
                      ![
                        "project",
                        "projectService",
                        "tsconfigRootDir",
                        "ecmaVersion",
                        "sourceType",
                      ].includes(key),
                  )
                )
                  throw new Unconfirmed("unsupported ESLint parserOptions key");
                if (parser.project !== undefined)
                  throw new Unconfirmed(
                    "explicit ESLint parserOptions.project is not supported; use projectService",
                  );
                if (parser.projectService !== undefined)
                  projectService = parser.projectService === true;
                if (
                  parser.tsconfigRootDir !== undefined &&
                  parser.tsconfigRootDir !== "__CONFIG_DIRECTORY__"
                )
                  throw new Unconfirmed("unsupported tsconfigRootDir");
              }
            }
            if (config.rules !== undefined) {
              const rules = record(config.rules);
              if (
                Object.keys(rules).some(
                  (rule) =>
                    rule.startsWith("@typescript-eslint/") &&
                    (rules[rule] === "off" ||
                      rules[rule] === 0 ||
                      (Array.isArray(rules[rule]) &&
                        [0, "off"].includes(
                          rules[rule][0] as string | number,
                        ))),
                )
              )
                typed = false;
            }
          }
          if (ignored) failures.push(`${target}: 被全局 ignores 排除`);
          if (!tsPreset || (r.typeAware && (!typed || !projectService)))
            failures.push(
              `${target}: TS preset/type-aware projectService 未生效`,
            );
          if (r.typeAware) {
            const tsPath = findConfig(files, files.parent(target), [
              "tsconfig.json",
            ]);
            if (
              !tsPath ||
              !tsIncludes(files, await tsconfig(files, tsPath), target)
            )
              failures.push(`${target}: projectService 默认 tsconfig 未覆盖`);
          }
        }
        if (failures.length)
          issue("lint", "mismatch", `${path}: ${failures.join("; ")}`);
        else prove(command, "lint");
      }
    });
    await section("testing", async () => {
      const r = requirements.testing;
      if (!r.enabled || !applicable) return;
      const candidates = own.filter((c) => c.tool === "vitest");
      if (!candidates.length) {
        issue(
          "testing",
          scriptErrors.length ? "unconfirmed" : "missing",
          `${prefix}: 未确认 Vitest 入口`,
        );
        return;
      }
      for (const command of candidates) {
        validateArguments(
          command,
          [
            "run",
            "--run",
            "--coverage",
            "--coverage.enabled",
            "--watch=false",
            "--passWithNoTests=false",
            "--passWithNoTests",
            "--passWithNoTests=true",
          ],
          ["--root", "--config", "-c"],
        );
        const explicit =
          argument(command, "--config") ?? argument(command, "-c");
        const path = explicit
          ? files.path(project.directory, explicit)
          : findConfig(files, project.directory, [
              "vitest.config.ts",
              "vitest.config.js",
              "vitest.config.mjs",
              "vitest.config.mts",
              "vitest.config.cjs",
              "vitest.config.cts",
              "vite.config.ts",
              "vite.config.js",
            ]);
        if (!path) {
          issue("testing", "missing", `${prefix}: 缺少 Vitest 配置`);
          continue;
        }
        const config = record(javascript(await files.text(path)));
        const test = record(config.test ?? {});
        for (const key of ["watch", "passWithNoTests"]) {
          if (test[key] !== undefined && typeof test[key] !== "boolean")
            throw new Unconfirmed(`Vitest test.${key} is not a boolean`);
        }
        const allowed = [
          "include",
          "exclude",
          "coverage",
          "passWithNoTests",
          "watch",
          "environment",
          "globals",
          "name",
          "testTimeout",
        ];
        if (
          Object.keys(config).some((k) => !["test"].includes(k)) ||
          Object.keys(test).some((k) => !allowed.includes(k))
        )
          throw new Unconfirmed(
            "unsupported Vitest configuration key (including projects/workspace/root)",
          );
        const testBase = files.path(
          project.directory,
          argument(command, "--root") ?? ".",
        );
        const actualTests = project.tests.filter((path) =>
          /\.(?:test|spec)\.[cm]?tsx?$/.test(path),
        );
        const included = test.include ?? [
          "**/*.test.ts",
          "**/*.spec.ts",
          "**/*.test.tsx",
          "**/*.spec.tsx",
          "**/*.test.mts",
          "**/*.test.cts",
        ];
        const excluded = test.exclude ?? ["**/node_modules/**", "**/.git/**"];
        if (
          !patternsCover(files, testBase, included, actualTests) ||
          actualTests.some((target) =>
            matches(excluded, localPath(testBase, target)),
          )
        ) {
          issue("testing", "mismatch", `${path}: 测试发现未覆盖全部已识别测试`);
          continue;
        }
        const nonWatch =
          command.args.includes("run") ||
          flag(command, "--run") ||
          command.args.includes("--watch=false") ||
          test.watch === false;
        if (
          (r.nonWatch && !nonWatch) ||
          (r.failOnNoTests &&
            (command.args.includes("--passWithNoTests=false")
              ? false
              : flag(command, "--passWithNoTests") ||
                test.passWithNoTests === true))
        ) {
          issue(
            "testing",
            "mismatch",
            `${path}: watch 或 passWithNoTests 配置不满足要求`,
          );
          continue;
        }
        prove(command, "test");
        if (r.coverage.enabled)
          await section("coverage", async () => {
            const coverage =
              test.coverage === undefined ? undefined : record(test.coverage);
            if (!coverage) {
              issue("coverage", "missing", `${path}: coverage 未配置`);
              return;
            }
            if (
              Object.keys(coverage).some(
                (k) =>
                  ![
                    "provider",
                    "reporter",
                    "reportsDirectory",
                    "include",
                    "exclude",
                    "thresholds",
                    "enabled",
                    "all",
                    "skipFull",
                  ].includes(k),
              )
            )
              throw new Unconfirmed("unsupported Vitest coverage key");
            if (
              coverage.provider !== undefined &&
              !["v8", "istanbul"].includes(coverage.provider as string)
            )
              throw new Unconfirmed("unsupported coverage provider");
            const major = await declaredMajor(
              files,
              projects,
              project,
              "vitest",
            );
            if (major === undefined || major < 4 || major > 5)
              throw new Unconfirmed(
                "untested-source semantics verified only for declared Vitest 4.x/5.x",
              );
            const c = r.coverage;
            if (!c.enabled) return;
            const failures: string[] = [];
            const thresholds = record(coverage.thresholds ?? {});
            if (thresholds.autoUpdate === true)
              failures.push("thresholds.autoUpdate 会修改门槛");
            for (const metric of metrics) {
              const observed = thresholds[metric];
              if (
                typeof observed === "number" &&
                (!Number.isFinite(observed) || observed < 0 || observed > 100)
              )
                failures.push(`${metric} 必须是有限的 0..100 百分比`);
              else if (
                typeof thresholds[metric] !== "number" ||
                thresholds[metric] < c.minimum[metric]
              )
                failures.push(`${metric} < ${c.minimum[metric]}`);
            }
            if (
              Object.keys(thresholds).some(
                (k) =>
                  ![...metrics, "perFile", "autoUpdate", "100"].includes(k),
              )
            )
              throw new Unconfirmed(
                "per-glob coverage thresholds are unsupported",
              );
            if (c.includeUntested) {
              if (
                !coverage.include ||
                !patternsCover(
                  files,
                  testBase,
                  coverage.include,
                  project.sources,
                )
              )
                failures.push("coverage.include 未覆盖全部源码");
              if (
                coverage.exclude !== undefined &&
                project.sources.some((p) =>
                  matches(coverage.exclude, localPath(testBase, p)),
                )
              )
                failures.push("coverage.exclude 排除源码");
            }
            const enabled =
              flag(command, "--coverage") ||
              flag(command, "--coverage.enabled") ||
              coverage.enabled === true;
            if (failures.length)
              issue("coverage", "mismatch", `${path}: ${failures.join("; ")}`);
            else if (enabled) prove(command, "coverage");
            // Thresholds without an enabled invocation never prove the coverage capability.
          });
      }
    });
  }
  await section("formatting", async () => {
    const r = requirements.formatting;
    if (!r.enabled) return;
    const candidates = commands.filter((c) => c.tool === "prettier");
    if (!candidates.length) {
      issue(
        "formatting",
        scriptErrors.length ? "unconfirmed" : "missing",
        "未确认 Prettier 检查入口",
      );
      return;
    }
    const targets = projects.flatMap((p) => [...p.sources, ...p.tests]);
    for (const project of projects) {
      if (project.manifest.prettier !== undefined) {
        const config = record(project.manifest.prettier);
        if (config.plugins !== undefined || config.overrides !== undefined)
          throw new Unconfirmed(
            "package.json Prettier plugins/overrides are unsupported",
          );
      }
    }
    for (const command of candidates) {
      if (r.checkOnly && !flag(command, "--check") && !flag(command, "-c"))
        continue;
      if (r.checkOnly && (flag(command, "--write") || flag(command, "-w")))
        continue;
      validateArguments(
        command,
        ["--check", "-c", "--list-different", "--write", "-w"],
        ["--config", "--ignore-path"],
      );
      const positions = positional(command, ["--config", "--ignore-path"]);
      if (
        !positions.length ||
        !targets.every((p) => commandTargets(files, command, positions, p))
      )
        continue;
      const path = argument(command, "--config")
        ? files.path(command.directory, argument(command, "--config")!)
        : findConfig(files, command.directory, [
            ".prettierrc",
            ".prettierrc.json",
            ".prettierrc.yaml",
            ".prettierrc.yml",
            ".prettierrc.js",
            ".prettierrc.mjs",
            ".prettierrc.cjs",
            ".prettierrc.ts",
            ".prettierrc.toml",
            "prettier.config.js",
            "prettier.config.mjs",
            "prettier.config.cjs",
            "prettier.config.ts",
          ]);
      const configurations = new Set(path ? [path] : []);
      if (!argument(command, "--config")) {
        for (const candidate of files.paths) {
          if (
            !/(?:^|\/)(?:\.prettierrc(?:\.[^/]+)?|prettier\.config\.[^/]+)$/.test(
              candidate,
            )
          )
            continue;
          const base = files.parent(candidate);
          if (
            targets.some(
              (target) => base === "." || target.startsWith(`${base}/`),
            )
          )
            configurations.add(candidate);
        }
      }
      for (const configPath of configurations) {
        const raw = await files.text(configPath);
        let configuration: unknown;
        if (/\.[cm]?[jt]s$/.test(configPath)) configuration = javascript(raw);
        else if (/\.ya?ml$/.test(configPath)) configuration = yaml(raw);
        else {
          try {
            configuration = JSON.parse(raw) as unknown;
          } catch {
            throw new Unconfirmed(
              `${configPath}: unsupported/invalid Prettier data configuration`,
            );
          }
        }
        const config = record(configuration);
        if (config.plugins !== undefined || config.overrides !== undefined)
          throw new Unconfirmed("Prettier plugins/overrides are unsupported");
      }
      const ignore = argument(command, "--ignore-path")
        ? files.path(command.directory, argument(command, "--ignore-path")!)
        : files.path(command.directory, ".prettierignore");
      if (files.exists(ignore)) {
        const patterns = ignorePatterns(await files.text(ignore));
        if (
          targets.some((p) =>
            ignoreMatch(patterns, localPath(command.directory, p)),
          )
        ) {
          issue("formatting", "mismatch", `${ignore}: 排除了源码或测试`);
          continue;
        }
      }
      if (!argument(command, "--ignore-path")) {
        const gitignore = files.path(command.directory, ".gitignore");
        if (files.exists(gitignore)) {
          const patterns = ignorePatterns(await files.text(gitignore));
          if (
            targets.some((p) =>
              ignoreMatch(patterns, localPath(command.directory, p)),
            )
          ) {
            issue("formatting", "mismatch", `${gitignore}: 排除了源码或测试`);
            continue;
          }
        }
      }
      prove(command, "formatting");
    }
    if (!candidates.some((c) => proved.get(c)?.has("formatting")))
      issue(
        "formatting",
        "mismatch",
        "未确认覆盖全部源码/测试且不写入的格式入口",
      );
  });
  for (const [command, set] of proved) {
    const existing = evidence.get(key(command)) ?? new Set();
    for (const capability of set) existing.add(capability);
    evidence.set(key(command), existing);
  }
  const covers = (commands: Command[], capability: Capability): boolean => {
    if (capability === "formatting")
      return commands.some((c) => evidence.get(key(c))?.has(capability));
    const applicable = projects.filter(
      (p) => p.sources.length + p.tests.length > 0,
    );
    return (
      applicable.length > 0 &&
      applicable.every((p) =>
        commands.some(
          (c) =>
            c.directory === p.directory &&
            evidence.get(key(c))?.has(capability),
        ),
      )
    );
  };
  const gateNames: string[] = [];
  await section("gate", () => {
    const r = requirements.qualityGate;
    if (!r.enabled) return;
    for (const name of Object.keys(
      record(root.manifest.scripts ?? {}),
    ).sort()) {
      const expanded = allCommands.get(`:${name}`);
      if (expanded && r.capabilities.every((c) => covers(expanded, c)))
        gateNames.push(name);
    }
    if (!gateNames.length)
      issue(
        "gate",
        Object.keys(record(root.manifest.scripts ?? {})).length === 0
          ? "missing"
          : scriptErrors.length
            ? "unconfirmed"
            : "mismatch",
        `根聚合入口未连接有效能力: ${r.capabilities.join(", ")}${scriptErrors.length ? `; ${scriptErrors.join("; ")}` : ""}`,
      );
  });
  if (
    requirements.testing.enabled &&
    requirements.testing.coverage.enabled &&
    !commands.some((c) => evidence.get(key(c))?.has("coverage"))
  )
    issue(
      "coverage",
      uncertain.has("testing") ||
        uncertain.has("coverage") ||
        scriptErrors.length
        ? "unconfirmed"
        : "missing",
      "未确认启用覆盖率且执行有效阈值的入口；只有 thresholds 不足以接入覆盖率",
    );
  await section("ci", async () => {
    if (!requirements.ci.enabled) return;
    await ci(files, scripts, root, requirements, gateNames, covers, issue);
  });
}

async function discover(
  files: Files,
  scopes: string[] | undefined,
): Promise<Project[]> {
  let directories = [""];
  if (scopes) {
    for (const scope of scopes) {
      if (
        scope.startsWith("/") ||
        /^[A-Za-z]:/.test(scope) ||
        scope.split(/[\\/]/).includes("..")
      )
        throw new Unconfirmed(
          "projectScopes must be bounded root-relative directories without traversal",
        );
      const dir = files.path("", scope);
      if (directories.includes(dir))
        throw new Unconfirmed("duplicate/root project scope");
      directories.push(dir);
    }
  } else if (files.exists("pnpm-workspace.yaml")) {
    const config = yaml(await files.text("pnpm-workspace.yaml"));
    const patterns = stringArray(config.packages);
    for (const pattern of patterns) glob(pattern, "");
    directories.push(
      ...files.paths
        .filter((p) => p.endsWith("/package.json"))
        .map((p) => p.slice(0, -"/package.json".length))
        .filter((directory) =>
          patterns.some((pattern) => glob(pattern, directory)),
        ),
    );
  } else if (files.paths.some((p) => p.endsWith("/package.json"))) {
    throw new Unconfirmed(
      "nested manifests without pnpm workspace declaration require projectScopes",
    );
  }
  directories = [...new Set(directories)].sort((a, b) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "en"),
  );
  if (directories.length > 129)
    throw new Unconfirmed("workspace exceeds 128 members");
  const result: Project[] = [];
  for (const directory of directories) {
    const path = files.path(directory, "package.json");
    if (!files.exists(path))
      throw new Unconfirmed(`scope lacks package.json: ${directory}`);
    const manifest = await files.json(path);
    if (
      manifest.workspaces !== undefined &&
      !files.exists("pnpm-workspace.yaml") &&
      !scopes
    )
      throw new Unconfirmed("only pnpm workspace discovery is supported");
    const candidates = files.paths.filter((p) => {
      const owner = directories
        .filter((d) => !d || p.startsWith(`${d}/`))
        .sort((a, b) => b.length - a.length)[0];
      return (
        owner === directory &&
        /\.(?:[cm]?ts|tsx)$/.test(p) &&
        !/\.d\.[cm]?ts$/.test(p) &&
        !/(?:^|\/)[^/]*config\.[cm]?ts$/.test(p)
      );
    });
    const tests = candidates.filter(
      (p) =>
        /(?:^|\/)(?:test|tests|__tests__)\//.test(p) ||
        /\.(?:test|spec)\.[cm]?tsx?$/.test(p),
    );
    result.push({
      directory,
      manifest,
      sources: candidates.filter((p) => !tests.includes(p)),
      tests,
    });
  }
  return result;
}
function dependency(
  projects: Project[],
  project: Project,
  name: string,
): unknown {
  for (const p of project.directory ? [project, projects[0]!] : [project])
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ]) {
      const value = p.manifest[field];
      if (value !== undefined && record(value)[name] !== undefined)
        return record(value)[name];
    }
  return undefined;
}
async function declaredMajor(
  files: Files,
  projects: Project[],
  project: Project,
  name: string,
): Promise<number | undefined> {
  let value = dependency(projects, project, name);
  if (
    typeof value === "string" &&
    value.startsWith("catalog:") &&
    files.exists("pnpm-workspace.yaml")
  ) {
    const workspace = yaml(await files.text("pnpm-workspace.yaml"));
    const catalogName = value.slice("catalog:".length);
    const catalog = catalogName
      ? record(record(workspace.catalogs)[catalogName])
      : record(workspace.catalog);
    value = catalog[name];
  }
  if (typeof value !== "string") return undefined;
  const match = /^(?:\^|~)?(\d+)\.\d+\.\d+$/.exec(value);
  return match ? Number(match[1]) : undefined;
}
function tsIncludes(files: Files, config: TsConfig, path: string): boolean {
  for (const p of [...config.includes.patterns, ...config.excludes.patterns])
    glob(p, "");
  if (
    config.files?.paths.some((p) => files.path(config.files!.base, p) === path)
  )
    return true;
  if (
    !config.explicitExclude &&
    config.outputDirectories.some(
      (out) => path === out || path.startsWith(`${out}/`),
    )
  )
    return false;
  const rel = localPath(config.includes.base, path);
  const included = config.includes.patterns.some((p) =>
    glob(p.includes("*") || /\.[cm]?tsx?$/.test(p) ? p : `${p}/**/*`, rel),
  );
  const excluded = config.excludes.patterns.some((p) =>
    glob(
      p.includes("*") ? p : `${p}/**/*`,
      localPath(config.excludes.base, path),
    ),
  );
  return included && !excluded;
}
function findConfig(
  files: Files,
  directory: string,
  names: string[],
): string | undefined {
  let current = directory;
  for (;;) {
    const found = names
      .map((name) => files.path(current, name))
      .filter((p) => files.exists(p));
    if (found.length > 1)
      throw new Unconfirmed(`ambiguous configuration: ${found.join(", ")}`);
    if (found[0]) return found[0];
    if (!current || current === ".") return undefined;
    current = files.parent(current);
  }
}
function validateArguments(
  command: Command,
  flags: string[],
  options: string[],
): void {
  const seen = new Set<string>();
  for (let i = 0; i < command.args.length; i++) {
    const value = command.args[i]!;
    if (!value.startsWith("-")) continue;
    const name = value.split("=")[0]!;
    const canonical =
      name === "-p"
        ? "--project"
        : name === "-c"
          ? command.tool === "prettier"
            ? "--check"
            : "--config"
          : name;
    if (seen.has(canonical))
      throw new Unconfirmed(`${command.tool}: duplicate option ${canonical}`);
    seen.add(canonical);
    if (flags.includes(value)) continue;
    if (options.includes(name)) {
      const optionValue = value.includes("=")
        ? value.slice(value.indexOf("=") + 1)
        : command.args[i + 1];
      if (!optionValue || optionValue.startsWith("-"))
        throw new Unconfirmed(`${command.tool}: missing value for ${name}`);
      if (!value.includes("=")) i++;
      continue;
    }
    throw new Unconfirmed(`${command.tool}: unsupported option ${value}`);
  }
}
function positional(command: Command, options: string[]): string[] {
  const output: string[] = [];
  for (let i = 0; i < command.args.length; i++) {
    const value = command.args[i]!;
    if (options.includes(value)) {
      i++;
      continue;
    }
    if (!value.startsWith("-")) output.push(value);
  }
  return output;
}
function commandTargets(
  files: Files,
  command: Command,
  targets: string[],
  path: string,
): boolean {
  for (const target of targets)
    if (target.includes("*") || target.includes("?")) glob(target, "");
  return targets.some((target) => {
    const relative = localPath(command.directory, path);
    if (target.includes("*") || target.includes("?"))
      return glob(target, relative);
    const root = files.path(command.directory, target);
    return root === path || !root || path.startsWith(`${root}/`);
  });
}
function ignorePatterns(text: string): string[] {
  const patterns = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("#"));
  for (const pattern of patterns) glob(pattern.replace(/\/$/, ""), "");
  return patterns;
}
function ignoreMatch(patterns: string[], path: string): boolean {
  return patterns.some((pattern) => {
    const p = pattern.replace(/^\//, "").replace(/\/$/, "");
    return (
      glob(p, path) ||
      glob(`${p}/**`, path) ||
      (!p.includes("/") && path.split("/").some((part) => glob(p, part)))
    );
  });
}

async function ci(
  files: Files,
  scripts: Scripts,
  root: Project,
  requirements: Requirements,
  gateNames: string[],
  covers: (commands: Command[], capability: Capability) => boolean,
  issue: (domain: Domain, status: Status, brief: string) => void,
): Promise<void> {
  const r = requirements.ci;
  if (!r.enabled) return;
  const paths = files.paths.filter((p) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p),
  );
  if (!paths.length) {
    issue("ci", "missing", "缺少 GitHub Actions 工作流");
    return;
  }
  let valid = false;
  for (const path of paths) {
    const workflow = yaml(await files.text(path));
    const on = record(workflow.on ?? {});
    if (r.pullRequest && !Object.hasOwn(on, "pull_request")) continue;
    if (r.mainPush) {
      if (!Object.hasOwn(on, "push")) continue;
      const push = on.push === null ? {} : record(on.push);
      if (
        Object.keys(push).some(
          (key) =>
            ![
              "branches",
              "branches-ignore",
              "paths",
              "paths-ignore",
              "tags",
              "tags-ignore",
            ].includes(key),
        )
      )
        throw new Unconfirmed(`${path}: unsupported push trigger key`);
      if (
        (push.tags !== undefined || push["tags-ignore"] !== undefined) &&
        push.branches === undefined
      )
        throw new Unconfirmed(
          `${path}: tags-only push does not establish a main branch trigger`,
        );
      if (
        push["branches-ignore"] !== undefined ||
        push.paths !== undefined ||
        push["paths-ignore"] !== undefined
      )
        throw new Unconfirmed(`${path}: filtered push trigger`);
      if (push.branches !== undefined && !matches(push.branches, "main"))
        continue;
    }
    if (
      r.pullRequest &&
      on.pull_request !== null &&
      Object.keys(record(on.pull_request)).length
    )
      throw new Unconfirmed(`${path}: filtered pull_request trigger`);
    if (workflow.defaults !== undefined || workflow.env !== undefined)
      throw new Unconfirmed(`${path}: workflow defaults/env are unsupported`);
    for (const job of Object.values(record(workflow.jobs))) {
      const j = record(job);
      if (
        j.if !== undefined ||
        j["continue-on-error"] !== undefined ||
        j.env !== undefined ||
        j.defaults !== undefined ||
        j.uses !== undefined ||
        j.needs !== undefined
      )
        continue;
      if (j.strategy !== undefined) {
        const strategy = record(j.strategy);
        const matrix = record(strategy.matrix);
        if (
          Object.keys(matrix).some(
            (key) =>
              key === "exclude" ||
              key === "include" ||
              !Array.isArray(matrix[key]) ||
              !(matrix[key] as unknown[]).length ||
              (matrix[key] as unknown[]).some(
                (v) => typeof v === "string" && v.includes("${{"),
              ),
          )
        )
          throw new Unconfirmed(`${path}: dynamic/filtered CI matrix`);
      }
      if (!Array.isArray(j.steps)) continue;
      let installed = !r.frozenInstall;
      let checkedOut = false;
      let passed = !r.qualityGate && !r.coverage;
      for (const step of j.steps) {
        const s = record(step);
        if (
          typeof s.uses === "string" &&
          s.uses.startsWith("actions/checkout@") &&
          s.if === undefined &&
          s.with === undefined
        )
          checkedOut = true;
        else if (
          typeof s.uses === "string" &&
          s.uses.startsWith("actions/checkout@") &&
          s.if === undefined
        ) {
          const settings = record(s.with);
          if (
            Object.keys(settings).every((k) =>
              ["persist-credentials", "fetch-depth"].includes(k),
            )
          )
            checkedOut = true;
        }
        if (typeof s.run !== "string") continue;
        if (
          s.if !== undefined ||
          s["continue-on-error"] !== undefined ||
          s.env !== undefined ||
          s["working-directory"] !== undefined ||
          (s.shell !== undefined && !["bash", "sh"].includes(s.shell as string))
        )
          continue;
        let tokens: string[];
        try {
          tokens = words(s.run.trim());
        } catch (error) {
          if (error instanceof Unconfirmed) continue;
          throw error;
        }
        if (checkedOut && tokens.join(" ") === "pnpm install --frozen-lockfile")
          installed = true;
        if (!checkedOut || !installed || tokens[0] !== "pnpm") continue;
        const name = tokens[1] === "run" ? tokens[2] : tokens[1];
        if (!name || tokens.length !== (tokens[1] === "run" ? 3 : 2)) continue;
        if (r.qualityGate && !gateNames.includes(name)) continue;
        const expanded = await scripts.expand(root, name);
        if (r.coverage && !covers(expanded, "coverage")) continue;
        passed = true;
      }
      if (installed && passed && checkedOut) valid = true;
    }
  }
  if (!valid)
    issue(
      "ci",
      "mismatch",
      "未确认 PR/main push 同一无条件 job 在 checkout、冻结安装之后调用包含覆盖率的有效质量门禁",
    );
}
