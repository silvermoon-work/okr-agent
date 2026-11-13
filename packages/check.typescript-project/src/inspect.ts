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
  tsIncludes,
  typeAwarePreset,
  typescriptPreset,
} from "./static.js";
import { Scripts, words, projectStrategy, type Project } from "./commands.js";
import {
  metrics,
  fixedRequirements,
  type Requirements,
} from "./requirements.js";
import { relative, resolve } from "node:path";
import { convention, type InspectionEvidence } from "./convention.js";
import { repository } from "./repository.js";
import { scriptProfile } from "./script-profile.js";
import { qualityWorkflow, type QualityProfile } from "./quality-workflow.js";

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
  internal: InspectionEvidence,
): Promise<void> {
  if (
    typeof input !== "object" ||
    Object.keys(input).length !== 1 ||
    typeof input.projectDirectory !== "string"
  )
    throw new Error(
      "Invalid input: only absolute projectDirectory is accepted",
    );
  const requirements = fixedRequirements();
  const files = new Files(input.projectDirectory, signal);
  const failures = new Map<Domain, number>();
  let scopeContext:
    { member: string; path: string | undefined; details: string } | undefined;
  const scoped = new Map<
    string,
    { domain: Domain; status: Status; evidence: string; members: string[] }
  >();
  const scopeIssue = (
    domain: Domain,
    status: Status,
    path: string,
    reason: string,
    member: string,
    evidence: string,
  ) => {
    failures.set(domain, (failures.get(domain) ?? 0) + 1);
    const key = JSON.stringify([domain, status, path, reason]);
    const entry = scoped.get(key);
    if (entry) {
      entry.members.push(evidence);
      return;
    }
    scoped.set(key, {
      domain,
      status,
      evidence: `${path}: ${reason}`,
      members: [evidence || member],
    });
  };
  const issue = (domain: Domain, status: Status, evidence: string) => {
    failures.set(domain, (failures.get(domain) ?? 0) + 1);
    report(`${domain}-${status}` as ProblemCode, evidence);
  };
  const section = async (
    domain: Domain,
    action: () => Promise<void> | void,
  ): Promise<boolean> => {
    signal.throwIfAborted();
    const before = failures.get(domain) ?? 0;
    try {
      await action();
    } catch (error) {
      if (!(error instanceof Unconfirmed)) throw error;
      if (scopeContext?.path)
        scopeIssue(
          domain,
          "unconfirmed",
          scopeContext.path,
          error.message,
          scopeContext.member,
          `成员=${scopeContext.member}；配置=${scopeContext.path}；实际 root=${scopeContext.member}；${scopeContext.details}`,
        );
      else
        issue(
          domain,
          "unconfirmed",
          `${scopeContext ? `成员=${scopeContext.member}；实际 root=${scopeContext.member}；` : ""}${error.message}`,
        );
    }
    return (failures.get(domain) ?? 0) === before;
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
    projects = await discover(files);
  } catch (error) {
    if (!(error instanceof Unconfirmed)) throw error;
    report("scope-unconfirmed", error.message);
    return;
  }
  const root = projects[0]!;
  const strategy = projectStrategy(projects);
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
  const scripts = new Scripts(files);
  const configurationPaths = files.paths.filter(
    (path) =>
      !projects.some((project) =>
        path.startsWith(`${files.path(project.directory, "scripts")}/`),
      ),
  );
  for (const project of projects) {
    await section("gate", () => {
      for (const problem of scripts.validate(project))
        issue("gate", problem.status, problem.brief);
    });
  }
  await section("gate", async () => {
    await scriptProfile(
      files,
      projects,
      internal.scripts,
      internal.publisher,
      (status, brief) => {
        issue("gate", status, brief);
      },
    );
  });
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
      if (actual.some((v) => !Number.isSafeInteger(v)))
        throw new Unconfirmed("packageManager version exceeds numeric bounds");
    }
    if (r.lockfile && !files.exists("pnpm-lock.yaml"))
      issue("dependency", "missing", "缺少 pnpm-lock.yaml");
  });
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
  for (const project of strategy.scopes) {
    const prefix = project.directory || ".";
    scopeContext = { member: prefix, path: undefined, details: "" };
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
      const path = findConfig(files, project.directory, ["tsconfig.json"]);
      scopeContext!.path = path;
      if (!path) {
        issue(
          "typescript",
          "missing",
          `${files.path(project.directory, "tsconfig.json")}: 自身及共享根配置缺失`,
        );
        return;
      }
      const config = await tsconfig(files, path);
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
            (config.options.strict !== true && config.options[name] !== true),
        )
      )
        failures.push("有效 strict 子选项不完整或被关闭");
      for (const option of r.safetyOptions)
        if (config.options[option] !== true) failures.push(`${option} != true`);
      const unmatched = targets.filter(
        (target) => !tsIncludes(files, config, target),
      );
      if (unmatched.length) failures.push("源文件/测试未全部纳入该类型配置");
      if (failures.length)
        scopeIssue(
          "typescript",
          "mismatch",
          path,
          failures.join("; "),
          prefix,
          `成员=${prefix}；配置=${path}；执行 root=${prefix}；TS include 按配置来源解析；include=${JSON.stringify(config.includes)}；exclude=${JSON.stringify(config.excludes)}；未匹配文件=${JSON.stringify(unmatched)}`,
        );
    });
    await section("lint", async () => {
      scopeContext!.path = undefined;
      scopeContext!.details = "";
      const r = requirements.lint;
      if (!r.enabled || !applicable) return;
      const targets = chosen(project, r.includeSource, r.includeTests);
      const path = findConfig(files, project.directory, [
        "eslint.config.js",
        "eslint.config.mjs",
        "eslint.config.ts",
        "eslint.config.cjs",
        "eslint.config.mts",
        "eslint.config.cts",
      ]);
      scopeContext!.path = path;
      if (!path) {
        issue("lint", "missing", `${prefix}: 缺少 ESLint flat config`);
        return;
      }
      const raw = javascript(await files.text(path));
      if (!Array.isArray(raw))
        throw new Unconfirmed(
          "ESLint default export must be a flat array/config wrapper",
        );
      const configs = raw.flat().map(record);
      scopeContext!.details = `files=${JSON.stringify(configs.map((config) => config.files))}；目标文件=${JSON.stringify(targets)}`;
      // The fixed runner passes --config explicitly: ESLint resolves globs from cwd.
      const configBase = project.directory || ".";
      const failures: string[] = [];
      for (const target of targets) {
        const rel = localPath(files.path("", configBase), target);
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
              Object.keys(config).every((k) => k === "ignores" || k === "name")
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
                      [0, "off"].includes(rules[rule][0] as string | number))),
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
        scopeIssue(
          "lint",
          "mismatch",
          path,
          [
            ...new Set(
              failures.map((failure) =>
                failure.slice(failure.indexOf(": ") + 2),
              ),
            ),
          ].join("; "),
          prefix,
          `成员=${prefix}；配置=${path}；执行 root=${configBase}；${scopeContext!.details}；${failures.join("; ")}`,
        );
    });
    await section("testing", async () => {
      scopeContext!.path = undefined;
      scopeContext!.details = "";
      const r = requirements.testing;
      if (!r.enabled || !applicable) return;
      const path = findConfig(files, project.directory, [
        "vitest.config.ts",
        "vitest.config.js",
        "vitest.config.mjs",
        "vitest.config.mts",
        "vitest.config.cjs",
        "vitest.config.cts",
        "vite.config.ts",
        "vite.config.js",
      ]);
      scopeContext!.path = path;
      if (!path) {
        issue("testing", "missing", `${prefix}: 缺少 Vitest 配置`);
        return;
      }
      const config = record(javascript(await files.text(path)));
      const test = record(config.test ?? {});
      scopeContext!.details = `include=${JSON.stringify(test.include)}；exclude=${JSON.stringify(test.exclude)}`;
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
          `unsupported Vitest configuration key (including projects/workspace/root)；观察字段=${JSON.stringify(Object.keys(config))}/${JSON.stringify(Object.keys(test))}`,
        );
      const testBase = project.directory || ".";
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
      const unmatched = actualTests.filter(
        (target) =>
          !patternsCover(files, testBase, included, [target]) ||
          matches(excluded, localPath(files.path("", testBase), target)),
      );
      if (unmatched.length) {
        scopeIssue(
          "testing",
          "mismatch",
          path,
          `测试发现未覆盖全部已识别测试；include=${JSON.stringify(included)}；exclude=${JSON.stringify(excluded)}`,
          prefix,
          `成员=${prefix}；配置=${path}；实际 root=${testBase}；未匹配文件=${JSON.stringify(unmatched)}`,
        );
        return;
      }
      if (
        (r.nonWatch && test.watch === true) ||
        (r.failOnNoTests && test.passWithNoTests === true)
      ) {
        scopeIssue(
          "testing",
          "mismatch",
          path,
          `watch=${JSON.stringify(test.watch)} 或 passWithNoTests=${JSON.stringify(test.passWithNoTests)} 配置不满足要求`,
          prefix,
          `成员=${prefix}；配置=${path}；实际 root=${testBase}；include=${JSON.stringify(included)}`,
        );
        return;
      }
      if (r.coverage.enabled)
        await section("coverage", async () => {
          const coverage =
            test.coverage === undefined ? undefined : record(test.coverage);
          if (!coverage) {
            issue("coverage", "missing", `${path}: coverage 未配置`);
            return;
          }
          scopeContext!.details = `include=${JSON.stringify(coverage.include)}；exclude=${JSON.stringify(coverage.exclude)}；源码=${JSON.stringify(project.sources)}`;
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
          const major = await declaredMajor(files, projects, project, "vitest");
          if (major === undefined || major < 4 || major > 5)
            throw new Unconfirmed(
              "untested-source semantics verified only for declared Vitest 4.x/5.x",
            );
          const c = r.coverage;
          if (!c.enabled) return;
          const failures: string[] = [];
          const unmatched: string[] = [];
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
              (k) => ![...metrics, "perFile", "autoUpdate", "100"].includes(k),
            )
          )
            throw new Unconfirmed(
              "per-glob coverage thresholds are unsupported",
            );
          if (c.includeUntested) {
            unmatched.push(
              ...project.sources.filter(
                (target) =>
                  !coverage.include ||
                  !patternsCover(files, testBase, coverage.include, [target]) ||
                  (coverage.exclude !== undefined &&
                    matches(
                      coverage.exclude,
                      localPath(files.path("", testBase), target),
                    )),
              ),
            );
            if (
              !coverage.include ||
              !patternsCover(files, testBase, coverage.include, project.sources)
            )
              failures.push("coverage.include 未覆盖全部源码");
            if (
              coverage.exclude !== undefined &&
              project.sources.some((p) =>
                matches(
                  coverage.exclude,
                  localPath(files.path("", testBase), p),
                ),
              )
            )
              failures.push("coverage.exclude 排除源码");
          }
          if (failures.length)
            scopeIssue(
              "coverage",
              "mismatch",
              path,
              failures.join("; "),
              prefix,
              `成员=${prefix}；配置=${path}；实际 root=${testBase}；include=${JSON.stringify(coverage.include)}；exclude=${JSON.stringify(coverage.exclude)}；源码=${JSON.stringify(project.sources)}；未匹配文件=${JSON.stringify(unmatched)}`,
            );
        });
    });
  }
  scopeContext = undefined;
  for (const entry of scoped.values())
    report(
      `${entry.domain}-${entry.status}` as ProblemCode,
      `${entry.evidence}；影响范围: ${entry.members.join("；")}`,
    );
  await section("formatting", async () => {
    const r = requirements.formatting;
    if (!r.enabled) return;
    const targets = [
      ...new Set([
        ...projects.flatMap((p) => [...p.sources, ...p.tests]),
        ...configurationPaths.filter(
          (path) =>
            /(?:^|\/)(?:package\.json|pnpm-workspace\.yaml|turbo\.json|release\.config\.json|tsconfig[^/]*\.json|(?:eslint|vitest|vite|prettier)\.config\.[cm]?[jt]s|\.prettierrc(?:\.[^/]+)?)$/.test(
              path,
            ) || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path),
        ),
      ]),
    ];
    for (const project of projects) {
      if (project.manifest.prettier !== undefined) {
        const config = record(project.manifest.prettier);
        if (config.plugins !== undefined || config.overrides !== undefined)
          throw new Unconfirmed(
            "package.json Prettier plugins/overrides are unsupported",
          );
      }
    }
    for (const project of projects) {
      const path = findConfig(files, project.directory, [
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
      {
        for (const candidate of configurationPaths) {
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
      const ignore = files.path(project.directory, ".prettierignore");
      if (files.exists(ignore)) {
        const patterns = ignorePatterns(await files.text(ignore));
        const excluded = targets.filter((p) =>
          ignoreMatch(patterns, localPath(project.directory, p)),
        );
        if (excluded.length) {
          issue(
            "formatting",
            "mismatch",
            `${ignore}: 排除了必要格式检查目标: ${excluded.join(", ")}`,
          );
          continue;
        }
      }
      {
        const gitignore = files.path(project.directory, ".gitignore");
        if (files.exists(gitignore)) {
          const patterns = ignorePatterns(await files.text(gitignore));
          const excluded = targets.filter((p) =>
            ignoreMatch(patterns, localPath(project.directory, p)),
          );
          if (excluded.length) {
            issue(
              "formatting",
              "mismatch",
              `${gitignore}: 排除了必要格式检查目标: ${excluded.join(", ")}`,
            );
            continue;
          }
        }
      }
    }
  });
  let quality: QualityProfile | undefined;
  await section("ci", async () => {
    if (!requirements.ci.enabled) return;
    const origin = await repository(files);
    if (!origin.github) return;
    if (origin.primary !== "main")
      throw new Unconfirmed(
        `首版尚不支持主分支 ${origin.primary} 的触发覆盖证明`,
      );
    quality = await qualityWorkflow(files, internal.ciWorkflow, issue);
    if (quality) await ci(files, requirements, issue);
  });
  await convention(files, projects, internal, report, quality ?? null);
}

async function discover(files: Files): Promise<Project[]> {
  let directories = [""];
  if (files.exists("pnpm-workspace.yaml")) {
    const config = yaml(await files.text("pnpm-workspace.yaml"));
    const patterns =
      config.packages === undefined ? [] : stringArray(config.packages);
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
      "nested manifests without pnpm workspace declaration have unknown ownership",
    );
  }
  directories = [...new Set(directories)].sort((a, b) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "en"),
  );
  const undeclared = files.paths.filter(
    (path) =>
      path.endsWith("/package.json") &&
      !directories.includes(path.slice(0, -"/package.json".length)),
  );
  if (undeclared.length)
    throw new Unconfirmed(
      `未声明的嵌套 package.json 职责无法确认: ${undeclared.join(", ")}`,
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
      !files.exists("pnpm-workspace.yaml")
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
  requirements: Requirements,
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
  const reasons = new Set<string>();
  let unknown = false;
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
        !Array.isArray(j.steps) ||
        !j.steps.some((step) => {
          const run = record(step).run;
          return (
            typeof run === "string" &&
            /^pnpm (?:(?:run )?check|install(?: --frozen-lockfile)?)$/.test(
              run.trim(),
            )
          );
        })
      )
        continue;
      if (
        j.if !== undefined ||
        j["continue-on-error"] !== undefined ||
        j.env !== undefined ||
        j.defaults !== undefined ||
        j.uses !== undefined ||
        j.needs !== undefined
      ) {
        if (
          j.if !== undefined ||
          j.env !== undefined ||
          j.defaults !== undefined ||
          j.uses !== undefined ||
          j.needs !== undefined
        )
          unknown = true;
        continue;
      }
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
      let installedWithTools = !r.frozenInstall;
      let checkedOut = false;
      let selectedNode = false;
      let selectedPnpm = false;
      let supportedJob = true;
      let passed = false;
      let declaredCheck = false;
      const observedNode: unknown[] = [];
      const observedPnpm: unknown[] = [];
      for (const step of j.steps) {
        const s = record(step);
        const settings = record(s.with ?? {});
        if (
          typeof s.uses === "string" &&
          s.uses.startsWith("actions/setup-node@")
        )
          observedNode.push(settings);
        if (
          typeof s.uses === "string" &&
          s.uses.startsWith("pnpm/action-setup@")
        )
          observedPnpm.push(settings);
        const unconditional =
          s.if === undefined &&
          s["continue-on-error"] === undefined &&
          s.env === undefined &&
          s["working-directory"] === undefined;
        if (!unconditional) {
          supportedJob = false;
          if (
            s.if !== undefined ||
            s.env !== undefined ||
            s["working-directory"] !== undefined
          )
            unknown = true;
        }
        if (
          typeof s.uses === "string" &&
          ![
            "actions/checkout@",
            "actions/setup-node@",
            "pnpm/action-setup@",
          ].some((prefix) => (s.uses as string).startsWith(prefix))
        ) {
          supportedJob = false;
          unknown = true;
        }
        if (
          unconditional &&
          checkedOut &&
          typeof s.uses === "string" &&
          s.uses.startsWith("actions/setup-node@") &&
          settings["node-version-file"] === ".node-version" &&
          settings["node-version"] === undefined
        )
          selectedNode = true;
        if (
          unconditional &&
          checkedOut &&
          typeof s.uses === "string" &&
          s.uses.startsWith("pnpm/action-setup@") &&
          settings.version === undefined &&
          (settings.run_install === undefined ||
            settings.run_install === false) &&
          (settings.package_json_file === undefined ||
            settings.package_json_file === "package.json")
        )
          selectedPnpm = true;
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
          if (error instanceof Unconfirmed) {
            supportedJob = false;
            unknown = true;
            continue;
          }
          throw error;
        }
        if (tokens.join(" ") === "pnpm install --frozen-lockfile") {
          if (checkedOut) installed = true;
          if (checkedOut && selectedNode && selectedPnpm)
            installedWithTools = true;
          continue;
        }
        if (tokens.join(" ") === "pnpm install") {
          supportedJob = false;
          reasons.add(`${path}: check job 使用了非冻结安装 pnpm install`);
          continue;
        }
        if (
          tokens.join(" ") !== "pnpm check" &&
          tokens.join(" ") !== "pnpm run check"
        ) {
          supportedJob = false;
          unknown = true;
        }
        if (tokens[0] !== "pnpm") continue;
        const name = tokens[1] === "run" ? tokens[2] : tokens[1];
        if (!name || tokens.length !== (tokens[1] === "run" ? 3 : 2)) continue;
        if (name !== "check") continue;
        declaredCheck = true;
        if (checkedOut && installed) passed = true;
      }
      if (
        installed &&
        passed &&
        checkedOut &&
        selectedNode &&
        selectedPnpm &&
        installedWithTools &&
        supportedJob
      )
        valid = true;
      else {
        if (!checkedOut) reasons.add(`${path}: check job 缺少有效 checkout`);
        if (!selectedNode)
          reasons.add(
            `${path}: check job actions/setup-node.with 观察 ${JSON.stringify(observedNode)}；要求 node-version-file: .node-version 且不覆盖 node-version`,
          );
        if (!selectedPnpm)
          reasons.add(
            `${path}: check job pnpm/action-setup.with 观察 ${JSON.stringify(observedPnpm)}；要求读取根 packageManager，不覆盖 version/package_json_file，不隐式安装`,
          );
        if (!installed)
          reasons.add(
            `${path}: check job 未在 checkout 后声明 pnpm install --frozen-lockfile；要求先冻结安装`,
          );
        else if (selectedNode && selectedPnpm && !installedWithTools)
          reasons.add(
            `${path}: pnpm install --frozen-lockfile 位于根工具选择之前；要求先选择根工具再冻结安装`,
          );
        if (!supportedJob)
          reasons.add(`${path}: check job 含不受支持的动作或执行覆盖`);
        if (!declaredCheck)
          reasons.add(
            `${path}: check job steps.run 未声明根 pnpm check 入口；要求 pnpm check`,
          );
        else if (!passed && installed)
          reasons.add(
            `${path}: 已声明 pnpm check，但不在 checkout/冻结安装之后；要求先安装后 check`,
          );
        if ((!selectedNode || !selectedPnpm) && installed && passed)
          reasons.add(
            `${path}: 已观察 pnpm install --frozen-lockfile 和 pnpm check；执行有效性受根工具选择阻断，未断言入口缺失`,
          );
      }
    }
  }
  if (!valid)
    issue(
      "ci",
      unknown ? "unconfirmed" : "mismatch",
      reasons.size
        ? [...reasons].join("; ")
        : "未确认覆盖 PR/main push 的同一无条件 check job，按序完成 checkout、根工具选择、冻结安装及 pnpm check 入口调用",
    );
}
