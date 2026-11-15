import { parseDocument } from "yaml";
import {
  defineChecker,
  executeCheck,
  mergeCheckerRegistries,
  type ProblemReporter,
  type CheckItem,
  type CheckerResult,
} from "@silvermoon-work/check-task-sdk";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  Input,
  ProblemCode as ProblemCodeSchema,
  type ProblemCode,
} from "../contract.js";
import {
  Files,
  Unconfirmed,
  glob,
  matches,
  record,
  slash,
  stringArray,
} from "../files.js";
import {
  compilerConsistency,
  javascript,
  tsconfig,
  tsIncludes,
  typeAwarePreset,
  typescriptPreset,
  workersTestPlugin,
} from "../static.js";
import { Scripts, projectStrategy, type Project } from "../commands.js";
import { metrics, fixedRequirements } from "../requirements.js";
import { relative, resolve } from "node:path";
import { maintenanceRegistry, type InspectionEvidence } from "./maintenance.js";
import { repository } from "../repository.js";
import { scriptProfile } from "../script-profile.js";
import { qualityWorkflow, type QualityProfile } from "../quality-workflow.js";
import { nativeWorkflow } from "../native-workflow.js";
import { projectDeliverables } from "../deliverables.js";
import { cloudflare } from "../cloudflare.js";
import { collectProblems, type FindingGroup, ruleScope } from "./rules.js";
import {
  configurationRegistry,
  configurationTargetSchema,
  type ConfigurationKind,
} from "./configuration.js";
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

export function projectRegistry(
  input: Input,
  signal: AbortSignal,
  internal: InspectionEvidence,
) {
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
  const empty = Type.Object({}, { additionalProperties: false });
  const member = Type.Object(
    { directory: Type.String() },
    { additionalProperties: false },
  );
  const configuration = configurationTargetSchema;
  const schemas = {
    project: Input,
    topology: empty,
    scripts: empty,
    dependency: empty,
    member,
    "member-context": member,
    "member-scripts": member,
    typescript: configuration,
    lint: configuration,
    vitest: configuration,
    testing: configuration,
    coverage: configuration,
    formatting: empty,
    ci: empty,
    cloudflare: empty,
    "manifest-fault": member,
    "typescript-scope": empty,
    "script-profile": empty,
  };
  type Item =
    | {
        [K in keyof typeof schemas]: {
          checker: K;
          target: Static<(typeof schemas)[K]>;
        };
      }[keyof typeof schemas]
    | CheckItem<ReturnType<typeof maintenanceRegistry>>;
  type Result = CheckerResult<Item, ProblemCode>;
  const { section } = ruleScope<Item>(signal);
  const collect = collectProblems<Item>;
  let projects: Project[] = [];
  let root: Project | undefined;
  let configurationPaths: string[] = [];
  let quality: QualityProfile | undefined;
  let ciFacts: Promise<Result> | undefined;
  const testConfigurations = new Map<
    string,
    { path: string; test: Record<string, unknown> }
  >();
  const manifestFaults = new Map<string, string>();
  const scripts = new Scripts(files);
  const scriptContexts = new Map<string, Promise<Result>>();
  const projectFor = ({ directory }: { directory: string }): Project => {
    const project = projects.find(
      (candidate) => candidate.directory === directory,
    );
    if (!project) throw new Error(`Unknown project selector: ${directory}`);
    return project;
  };
  const configPath = (kind: ConfigurationKind, project: Project): string => {
    try {
      return (
        findConfig(
          files,
          project.directory,
          kind === "typescript"
            ? ["tsconfig.json"]
            : kind === "lint"
              ? [
                  "eslint.config.js",
                  "eslint.config.mjs",
                  "eslint.config.ts",
                  "eslint.config.cjs",
                  "eslint.config.mts",
                  "eslint.config.cts",
                ]
              : [
                  [
                    "vitest.config.ts",
                    "vitest.config.js",
                    "vitest.config.mjs",
                    "vitest.config.mts",
                    "vitest.config.cjs",
                    "vitest.config.cts",
                  ],
                  ["vite.config.ts", "vite.config.js"],
                ],
        ) ?? `missing:${project.directory}`
      );
    } catch (error) {
      if (!(error instanceof Unconfirmed)) throw error;
      return `unconfirmed:${project.directory}`;
    }
  };
  const configurationTarget = (
    kind: ConfigurationKind,
    project: Project,
  ): Static<typeof configuration> => {
    const path = configPath(kind, project);
    return {
      path,
      directories: projects
        .filter(
          (candidate) =>
            candidate.sources.length + candidate.tests.length > 0 &&
            candidate.delivery === project.delivery &&
            configPath(kind, candidate) === path,
        )
        .map((candidate) => candidate.directory)
        .sort(),
    };
  };
  let topologyFacts: Promise<void> | undefined;
  const loadTopology = () =>
    (topologyFacts ??= (async () => {
      projects = await discover(files, manifestFaults);
      root = projects.find((project) => !project.directory);
      configurationPaths = files.paths.filter(
        (path) =>
          !projects.some((project) =>
            path.startsWith(`${files.path(project.directory, "scripts")}/`),
          ),
      );
      await projectDeliverables(
        files,
        projects,
        () => {},
        new Set(
          [...manifestFaults.keys()].map((directory) => directory || "."),
        ),
      );
    })());
  const entryRules = {
    project: defineChecker({
      target: schemas.project,
      check: async (): Promise<Result> => {
        try {
          await files.scan();
        } catch (error) {
          if (!(error instanceof Unconfirmed)) throw error;
          return {
            pass: false,
            problems: [{ code: "scope-unconfirmed", brief: error.message }],
          };
        }
        if (files.links.length) {
          return {
            pass: false,
            problems: [
              {
                code: "scope-unconfirmed",
                brief: `未跟随符号链接: ${files.links.join(", ")}`,
              },
            ],
          };
        }
        return {
          pass: true,
          children: [
            { checker: "topology", target: {} },
            { checker: "maintenance.root", target: {} },
          ],
        };
      },
    }),
    topology: defineChecker({
      target: empty,
      check: async (): Promise<Result> => {
        try {
          await loadTopology();
        } catch (error) {
          if (!(error instanceof Unconfirmed)) throw error;
          return {
            pass: false,
            problems: [{ code: "scope-unconfirmed", brief: error.message }],
          };
        }
        const children: Item[] = [
          ...(root &&
          (await loadMemberContext({ directory: root.directory })).pass
            ? [{ checker: "scripts" as const, target: {} }]
            : []),
          ...[...manifestFaults.keys()].map((directory) => ({
            checker: "manifest-fault" as const,
            target: { directory },
          })),
          ...projects.map((project) => ({
            checker: "member" as const,
            target: { directory: project.directory },
          })),
          { checker: "typescript-scope", target: {} },
          { checker: "formatting", target: {} },
          { checker: "ci", target: {} },
        ];
        if (root)
          children.push(
            { checker: "dependency", target: {} },
            { checker: "cloudflare", target: {} },
          );
        return { pass: true, children };
      },
    }),
    "manifest-fault": defineChecker({
      target: member,
      check: async ({ directory }): Promise<Result> => {
        await Promise.resolve();
        const brief = manifestFaults.get(directory);
        if (!brief) throw new Error("Unknown manifest failure selector.");
        return {
          pass: false,
          problems: [{ code: "scope-unconfirmed", brief }],
        };
      },
    }),
    member: defineChecker({
      target: member,
      check: async (selector): Promise<Result> => {
        await Promise.resolve();
        const project = projectFor(selector);
        const children: Item[] = [
          { checker: "member-context", target: selector },
        ];
        if (projectStrategy([project]).scopes.length)
          children.push(
            {
              checker: "typescript",
              target: configurationTarget("typescript", project),
            },
            { checker: "lint", target: configurationTarget("lint", project) },
            {
              checker: "vitest",
              target: configurationTarget("vitest", project),
            },
          );
        return { pass: true, children };
      },
    }),
  };
  const loadMemberContext = async (
    selector: Static<typeof member>,
  ): Promise<Result> => {
    const project = projectFor(selector);
    const existing = scriptContexts.get(project.directory);
    if (existing) return existing;
    const safe = section("scope", async () => {
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
    });
    scriptContexts.set(project.directory, safe);
    return safe;
  };
  const memberRules = {
    "member-context": defineChecker({
      target: member,
      check: async (selector): Promise<Result> => {
        const value = await loadMemberContext(selector);
        return value.pass
          ? {
              pass: true,
              children: [{ checker: "member-scripts", target: selector }],
            }
          : value;
      },
    }),
    "member-scripts": defineChecker({
      target: member,
      check: (selector): Promise<Result> => {
        const project = projectFor(selector);
        return section("gate", ({ issue }) => {
          for (const problem of scripts.validate(project))
            issue("gate", problem.status, problem.brief);
        });
      },
    }),
    scripts: defineChecker({
      target: empty,
      check: async (): Promise<Result> => {
        const safe = await section("scope", async () => {
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
        });
        if (!safe.pass) return safe;
        return {
          pass: true,
          children: [{ checker: "script-profile", target: {} }],
        };
      },
    }),
    "script-profile": defineChecker({
      target: empty,
      check: async (): Promise<Result> => {
        const eligible: Project[] = [];
        for (const project of projects) {
          const context = await loadMemberContext({
            directory: project.directory,
          });
          if (context.pass) eligible.push(project);
        }
        return section("gate", async ({ issue }) => {
          await scriptProfile(
            files,
            eligible,
            internal.scripts,
            internal.publisher,
            (status, brief) => {
              issue("gate", status, brief);
            },
          );
        });
      },
    }),
    "typescript-scope": defineChecker({
      target: empty,
      check: async (): Promise<Result> => {
        await Promise.resolve();
        return requirements.typescript.enabled &&
          !manifestFaults.size &&
          !projects.some(
            (project) => project.sources.length + project.tests.length > 0,
          )
          ? {
              pass: false,
              problems: [
                {
                  code: "typescript-unconfirmed",
                  brief:
                    "启用 TypeScript 要求，但项目范围内没有可观察的 TS 源码或测试",
                },
              ],
            }
          : { pass: true, children: [] };
      },
    }),
    dependency: defineChecker({
      target: empty,
      check: (): Promise<Result> =>
        section("dependency", ({ issue }) => {
          if (!root) throw new Error("Root manifest prerequisite missing.");
          const r = requirements.dependencyManagement;
          if (!r.enabled) return;
          const declared = root.manifest.packageManager;
          if (declared === undefined)
            issue(
              "dependency",
              "missing",
              "package.json: packageManager 未声明",
            );
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
              throw new Unconfirmed(
                "packageManager version exceeds numeric bounds",
              );
          }
          if (r.lockfile && !files.exists("pnpm-lock.yaml"))
            issue("dependency", "missing", "缺少 pnpm-lock.yaml");
        }),
    }),
  };
  const configurationChecks = {
    typescript: (
      selector: Static<typeof member>,
      group: FindingGroup,
    ): Promise<Result> => {
      const project = projectFor(selector);
      const { section, scopeContext } = ruleScope<Item>(
        signal,
        project.directory || ".",
        group,
      );
      const prefix = project.directory || ".";
      const applicable = project.sources.length + project.tests.length > 0;
      return section("typescript", async ({ issue, scopeIssue }) => {
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
          if (config.options[option] !== true)
            failures.push(`${option} != true`);
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
    },
    lint: (
      selector: Static<typeof member>,
      group: FindingGroup,
    ): Promise<Result> => {
      const project = projectFor(selector);
      const { section, scopeContext } = ruleScope<Item>(
        signal,
        project.directory || ".",
        group,
      );
      const prefix = project.directory || ".";
      const applicable = project.sources.length + project.tests.length > 0;
      return section("lint", async ({ issue, scopeIssue }) => {
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
              const isIgnored = matches(config.ignores, rel, true);
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
            if (config.files !== undefined && !matches(config.files, rel, true))
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
            // Without any tsconfig the typescript domain reports the root cause.
            if (
              tsPath &&
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
    },
    vitest: async (
      selector: Static<typeof member>,
      group: FindingGroup,
    ): Promise<Result> => {
      const project = projectFor(selector);
      const { section, scopeContext } = ruleScope<Item>(
        signal,
        project.directory || ".",
        group,
      );
      const prefix = project.directory || ".";
      const applicable = project.sources.length + project.tests.length > 0;
      const result = await section("testing", async ({ issue }) => {
        scopeContext!.path = undefined;
        scopeContext!.details = "";
        const r = requirements.testing;
        if (!r.enabled || !applicable) return;
        // Vitest gives vitest.config.* priority over vite.config.*, so the
        // latter is only consulted when no vitest.config.* exists.
        const path = findConfig(files, project.directory, [
          [
            "vitest.config.ts",
            "vitest.config.js",
            "vitest.config.mjs",
            "vitest.config.mts",
            "vitest.config.cjs",
            "vitest.config.cts",
          ],
          ["vite.config.ts", "vite.config.js"],
        ]);
        scopeContext!.path = path;
        if (!path) {
          issue("testing", "missing", `${prefix}: 缺少 Vitest 配置`);
          return;
        }
        const config = record(
          javascript(await files.text(path), project.delivery === "cloudflare"),
        );
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
        const topAllowed = [
          "test",
          ...(project.delivery === "cloudflare" ? ["plugins"] : []),
        ];
        const unsupported = [
          ...Object.keys(config).filter((k) => !topAllowed.includes(k)),
          ...Object.keys(test)
            .filter((k) => !allowed.includes(k))
            .map((k) => `test.${k}`),
        ];
        if (unsupported.length)
          throw new Unconfirmed(
            `unsupported Vitest configuration key: ${unsupported.join(", ")}（含 projects/workspace/root 的配置不在可证明范围内）；观察字段=${JSON.stringify(Object.keys(config))}/${JSON.stringify(Object.keys(test))}`,
          );
        if (
          config.plugins !== undefined &&
          (!Array.isArray(config.plugins) ||
            config.plugins.some(
              (plugin: unknown) =>
                !plugin ||
                typeof plugin !== "object" ||
                !(workersTestPlugin in plugin),
            ))
        )
          throw new Unconfirmed(
            "only literal cloudflareTest plugins are supported",
          );
        testConfigurations.set(project.directory, { path, test });
      });
      return result.pass
        ? {
            pass: true,
            children: testConfigurations.has(project.directory)
              ? [
                  {
                    checker: "testing",
                    target: configurationTarget("testing", project),
                  },
                  {
                    checker: "coverage",
                    target: configurationTarget("coverage", project),
                  },
                ]
              : [],
          }
        : result;
    },
    testing: (
      selector: Static<typeof member>,
      group: FindingGroup,
    ): Promise<Result> => {
      const project = projectFor(selector);
      const { section, scopeContext } = ruleScope<Item>(
        signal,
        project.directory || ".",
        group,
      );
      const prefix = project.directory || ".";
      const confirmed = testConfigurations.get(project.directory);
      if (!confirmed)
        throw new Error("Vitest configuration prerequisite missing.");
      const { path, test } = confirmed;
      scopeContext!.path = path;
      const r = requirements.testing;
      return section("testing", ({ scopeIssue }) => {
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
      });
    },
    coverage: (
      selector: Static<typeof member>,
      group: FindingGroup,
    ): Promise<Result> => {
      const project = projectFor(selector);
      const { section, scopeContext } = ruleScope<Item>(
        signal,
        project.directory || ".",
        group,
      );
      const prefix = project.directory || ".";
      const confirmed = testConfigurations.get(project.directory);
      if (!confirmed)
        throw new Error("Vitest configuration prerequisite missing.");
      const { path, test } = confirmed;
      scopeContext!.path = path;
      const r = requirements.testing;
      const testBase = project.directory || ".";
      return section("coverage", async ({ issue, scopeIssue }) => {
        if (!r.coverage.enabled) return;
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
                "autoAttachSubprocess",
              ].includes(k),
          )
        )
          throw new Unconfirmed("unsupported Vitest coverage key");
        if (
          Object.hasOwn(coverage, "autoAttachSubprocess") &&
          typeof coverage.autoAttachSubprocess !== "boolean"
        )
          throw new Unconfirmed(
            `coverage.autoAttachSubprocess 观察值=${JSON.stringify(coverage.autoAttachSubprocess)}；要求 boolean（true/false），仅控制子进程采集，不证明覆盖率启用或源码映射正确`,
          );
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
            typeof observed !== "number" ||
            !Number.isFinite(observed) ||
            observed < 0 ||
            observed > 100
          )
            failures.push(
              `thresholds.${metric} 观察值=${observed === undefined ? "未声明" : JSON.stringify(observed)}；必须显式声明有限的 0..100 百分比，数值由项目决定`,
            );
        }
        if (
          Object.keys(thresholds).some(
            (k) => ![...metrics, "perFile", "autoUpdate", "100"].includes(k),
          )
        )
          throw new Unconfirmed("per-glob coverage thresholds are unsupported");
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
              matches(coverage.exclude, localPath(files.path("", testBase), p)),
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
    },
  };
  const configurationRules = configurationRegistry(
    signal,
    (kind, directory) => configPath(kind, projectFor({ directory })),
    configurationChecks,
  );
  const repositoryRules = {
    formatting: defineChecker({
      target: empty,
      check: (): Promise<Result> =>
        section("formatting", async ({ issue }) => {
          const r = requirements.formatting;
          if (!r.enabled) return;
          const targets = [
            ...new Set([
              ...projects.flatMap((p) => [...p.sources, ...p.tests]),
              ...configurationPaths.filter(
                (path) =>
                  /(?:^|\/)(?:silvermoon\.yaml|package\.json|pnpm-workspace\.yaml|turbo\.json|release\.config\.json|tsconfig[^/]*\.json|(?:eslint|vitest|vite|prettier)\.config\.[cm]?[jt]s|\.prettierrc(?:\.[^/]+)?)$/.test(
                    path,
                  ) || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path),
              ),
            ]),
          ];
          for (const project of projects) {
            if (project.manifest.prettier !== undefined) {
              const config = record(project.manifest.prettier);
              if (
                config.plugins !== undefined ||
                config.overrides !== undefined
              )
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
              if (/\.[cm]?[jt]s$/.test(configPath))
                configuration = javascript(raw);
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
              if (
                config.plugins !== undefined ||
                config.overrides !== undefined
              )
                throw new Unconfirmed(
                  "Prettier plugins/overrides are unsupported",
                );
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
        }),
    }),
    cloudflare: defineChecker({
      target: empty,
      check: (): Promise<Result> =>
        collect((report) => cloudflare(files, projects, report)),
    }),
  };
  const loadCiFacts = (): Promise<Result> =>
    (ciFacts ??= section("ci", async ({ issue }) => {
      if (!requirements.ci.enabled) return;
      const origin = await repository(files);
      if (!origin.github) return;
      if (origin.primary !== "main")
        throw new Unconfirmed(
          `首版尚不支持主分支 ${origin.primary} 的触发覆盖证明`,
        );
      quality = await qualityWorkflow(files, internal.ciWorkflow, issue);
      await nativeWorkflow(files, projects, issue);
    }));
  const maintenance = maintenanceRegistry(files, internal, async () => {
    try {
      await loadTopology();
    } catch (error) {
      if (!(error instanceof Unconfirmed)) throw error;
      return {
        projects: [],
        quality: null,
        unavailableMembers: new Set<string>(),
      };
    }
    await loadCiFacts();
    return {
      projects,
      quality: quality ?? null,
      unavailableMembers: new Set(
        [...manifestFaults.keys()].map((directory) => directory || "."),
      ),
    };
  });
  return mergeCheckerRegistries(
    mergeCheckerRegistries(entryRules, memberRules),
    mergeCheckerRegistries(
      configurationRules,
      mergeCheckerRegistries(
        repositoryRules,
        mergeCheckerRegistries(maintenance, {
          ci: defineChecker({ target: empty, check: loadCiFacts }),
        }),
      ),
    ),
  );
}

export async function inspect(
  input: Input,
  signal: AbortSignal,
  report: ProblemReporter<ProblemCode>,
  internal: InspectionEvidence,
): Promise<void> {
  const result = await executeCheck<ReturnType<typeof projectRegistry>>({
    registry: (signal) => projectRegistry(input, signal, internal),
    root: { checker: "project", target: input },
    signal,
  });
  if (!result.pass)
    for (const problem of result.problems) {
      if (!Value.Check(ProblemCodeSchema, problem.code))
        throw new Error("Invalid project problem.");
      report(problem.code, problem.brief);
    }
}

async function discover(
  files: Files,
  faults: Map<string, string>,
): Promise<Project[]> {
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
    for (const path of files.paths) {
      const parts = path.split("/");
      for (let length = 1; length < parts.length; length++) {
        const directory = parts.slice(0, length).join("/");
        if (patterns.some((pattern) => glob(pattern, directory)))
          directories.push(directory);
      }
    }
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
    if (!files.exists(path)) {
      faults.set(
        directory,
        directory
          ? `scope lacks package.json: ${directory}`
          : "根目录缺少 package.json，无法确定项目范围",
      );
      continue;
    }
    let manifest: Record<string, unknown>;
    try {
      manifest = await files.json(path);
    } catch (error) {
      if (!(error instanceof Unconfirmed)) throw error;
      faults.set(directory, error.message);
      continue;
    }
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
  const root = projects.find((candidate) => !candidate.directory);
  for (const p of project.directory && root ? [project, root] : [project])
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
// `names` is one group of equal candidates, or ordered groups where an earlier
// group takes priority over later ones. Several files inside one group are
// ambiguous.
function findConfig(
  files: Files,
  directory: string,
  names: string[] | string[][],
): string | undefined {
  const groups = Array.isArray(names[0])
    ? (names as string[][])
    : [names as string[]];
  let current = directory;
  for (;;) {
    for (const group of groups) {
      const found = group
        .map((name) => files.path(current, name))
        .filter((p) => files.exists(p));
      if (found.length > 1)
        throw new Unconfirmed(`ambiguous configuration: ${found.join(", ")}`);
      if (found[0]) return found[0];
    }
    if (!current || current === ".") return undefined;
    current = files.parent(current);
  }
}
function ignorePatterns(text: string): string[] {
  const patterns = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("#"));
  for (const pattern of patterns)
    glob(pattern.replace(/^!/, "").replace(/\/$/, ""), "");
  return patterns;
}
// gitignore semantics: the last matching pattern decides, `!` re-includes, and
// a path stays excluded when one of its parent directories is excluded.
function ignoreMatch(patterns: string[], path: string): boolean {
  const decide = (candidate: string): boolean => {
    let ignored = false;
    for (const pattern of patterns) {
      const negated = pattern.startsWith("!");
      const p = (negated ? pattern.slice(1) : pattern)
        .replace(/^\//, "")
        .replace(/\/$/, "");
      const name = candidate.split("/").at(-1)!;
      if (glob(p, candidate) || (!p.includes("/") && glob(p, name)))
        ignored = !negated;
    }
    return ignored;
  };
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++)
    if (decide(parts.slice(0, i).join("/"))) return true;
  return decide(path);
}
