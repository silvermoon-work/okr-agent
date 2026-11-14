import { satisfies, valid, validRange } from "semver";
import type { ProblemReporter } from "@silvermoon-work/check-task-sdk";
import type { Project } from "./commands.js";
import type { ProblemCode } from "./contract.js";
import {
  type Files,
  Unconfirmed,
  dataYaml,
  record,
  stringArray,
} from "./files.js";
import {
  javascript,
  jsonc,
  tsconfig,
  tsIncludes,
  workersTestPlugin,
} from "./static.js";
import { environmentBindings, workerModule } from "./worker-module.js";

class Finding extends Error {
  constructor(
    readonly status: "missing" | "mismatch" | "unconfirmed",
    message: string,
  ) {
    super(message);
  }
}
/** A generic domain already reports this cause; platform checks wait for it. */
class Prerequisite extends Error {}
function requireValue(
  condition: unknown,
  status: Finding["status"],
  message: string,
): asserts condition {
  if (!condition) throw new Finding(status, message);
}
function requirePrerequisite(condition: unknown): asserts condition {
  if (!condition) throw new Prerequisite();
}
function inherited(files: Files, directory: string, names: string[]) {
  let current = directory;
  for (;;) {
    if (names.some((name) => files.exists(files.path(current, name))))
      return true;
    if (!current || current === ".") return false;
    current = files.parent(current);
  }
}
function generic(project: Project): boolean {
  return project.sources.length + project.tests.length > 0;
}
function object(value: unknown, path: string): Record<string, unknown> {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    value === undefined ? "missing" : "mismatch",
    `${path}: expected an object`,
  );
  return record(value);
}
function string(value: unknown, path: string): string {
  requireValue(
    typeof value === "string" && value.length > 0,
    value === undefined ? "missing" : "mismatch",
    `${path}: required nonempty string`,
  );
  return value;
}
function strings(value: unknown, path: string): string[] {
  requireValue(
    Array.isArray(value) && value.every((item) => typeof item === "string"),
    value === undefined ? "missing" : "mismatch",
    `${path}: expected a string list`,
  );
  return stringArray(value);
}
function local(
  files: Files,
  base: string,
  value: unknown,
  path: string,
): string {
  const raw = string(value, path).replace(/^\.\//, "");
  requireValue(
    raw &&
      (raw === "." ||
        (!/[:\\*?[\]{}]/.test(raw) &&
          raw
            .split("/")
            .every((part) => part && part !== "." && part !== ".."))),
    "mismatch",
    `${path}: path must stay within its package`,
  );
  return files.path(base, raw);
}
function keys(
  value: Record<string, unknown>,
  supported: string[],
  path: string,
) {
  requireValue(
    Object.keys(value).every((key) => supported.includes(key)),
    "unconfirmed",
    `${path}: unsupported fields ${Object.keys(value)
      .filter((key) => !supported.includes(key))
      .join(", ")}`,
  );
}
async function installed(
  files: Files,
  projects: Project[],
  project: Project,
  name: string,
  expected?: string,
): Promise<string> {
  const owner =
    record(project.manifest.devDependencies ?? {})[name] === undefined
      ? projects[0]!
      : project;
  const declared = record(owner.manifest.devDependencies ?? {})[name];
  requireValue(
    typeof declared === "string",
    "missing",
    `${project.directory || "."}: ${name} devDependency is required`,
  );
  const lockText = await files.optionalText("pnpm-lock.yaml");
  requirePrerequisite(lockText !== undefined);
  const lock = dataYaml(lockText);
  const entry = object(
    record(record(lock.importers)[owner.directory || "."]).devDependencies,
    "lock importer",
  )[name];
  const selected = object(entry, `lock importer ${name}`);
  requireValue(
    selected.specifier === declared,
    "mismatch",
    `${name}: declaration and lock importer differ`,
  );
  const version = string(selected.version, `lock importer ${name}`).split(
    "(",
  )[0]!;
  requireValue(
    valid(version) === version && !version.includes("-"),
    "unconfirmed",
    `${name}: stable registry version cannot be confirmed`,
  );
  let range = declared;
  if (range.startsWith("catalog:")) {
    const workspaceText = await files.optionalText("pnpm-workspace.yaml");
    requireValue(
      workspaceText !== undefined,
      "missing",
      "pnpm-workspace.yaml: platform tool catalog is required",
    );
    const workspace = dataYaml(workspaceText);
    const catalog = range.slice("catalog:".length);
    range = string(
      record(catalog ? record(workspace.catalogs)[catalog] : workspace.catalog)[
        name
      ],
      `${name}: catalog`,
    );
  }
  requireValue(
    validRange(range) && satisfies(version, range),
    "mismatch",
    `${name}: locked version does not satisfy declaration`,
  );
  if (expected)
    requireValue(
      version === expected,
      "unconfirmed",
      `${name}@${version}: reviewed profile supports ${expected}`,
    );
  return version;
}
async function typeDeclarations(
  files: Files,
  project: Project,
  bindings: string[],
  nodeImports: Set<string>,
) {
  const path = files.path(project.directory, "tsconfig.json");
  requirePrerequisite(
    files.exists(path) ||
      !generic(project) ||
      inherited(files, project.directory, ["tsconfig.json"]),
  );
  requireValue(
    files.exists(path),
    "missing",
    `${path}: platform type configuration is required`,
  );
  const config = await tsconfig(files, path);
  const types =
    config.options.types === undefined ? [] : stringArray(config.options.types);
  const candidates = new Set(
    types
      .filter((type) => type.endsWith(".d.ts"))
      .map((type) => local(files, project.directory, type, `${path}: types`)),
  );
  const fallback = files.path(project.directory, "worker-configuration.d.ts");
  if (files.exists(fallback)) candidates.add(fallback);
  requireValue(
    candidates.size === 1,
    candidates.size ? "unconfirmed" : "missing",
    `${path}: one explicit local generated runtime declaration is required`,
  );
  const declaration = [...candidates][0]!;
  requireValue(
    types.some(
      (type) =>
        type.endsWith(".d.ts") &&
        local(files, project.directory, type, path) === declaration,
    ) || tsIncludes(files, config, declaration),
    "mismatch",
    `${path}: generated runtime declaration is not included`,
  );
  const source = await files.optionalText(declaration);
  requireValue(
    source !== undefined,
    "missing",
    `${declaration}: generated types missing`,
  );
  const names = environmentBindings(source);
  for (const binding of bindings)
    requireValue(
      names.has(binding),
      "mismatch",
      `${declaration}: binding ${binding} is absent from Cloudflare.Env`,
    );
  if (nodeImports.size)
    requireValue(
      types.includes("node"),
      "missing",
      `${path}: node imports require explicit Node types`,
    );
}
async function workerTests(
  files: Files,
  projects: Project[],
  project: Project,
  configPath: string,
  required = true,
) {
  const names = [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mjs",
    "vitest.config.mts",
    "vitest.config.cjs",
    "vitest.config.cts",
    "vite.config.ts",
    "vite.config.js",
  ];
  const candidates = names
    .map((name) => files.path(project.directory, name))
    .filter((path) => files.exists(path));
  if (!required && !candidates.length) return;
  if (generic(project))
    requirePrerequisite(
      candidates.length === 1 ||
        (!candidates.length && inherited(files, project.directory, names)),
    );
  requireValue(
    candidates.length === 1,
    candidates.length ? "unconfirmed" : "missing",
    `${project.directory || "."}: one package-local Workers Vitest configuration is required`,
  );
  const path = candidates[0]!;
  const config = record(javascript(await files.text(path), true));
  if (!required && config.plugins === undefined) return;
  requireValue(
    Array.isArray(config.plugins) && config.plugins.length === 1,
    "missing",
    `${path}: one literal cloudflareTest plugin is required`,
  );
  const plugin = object(config.plugins[0], `${path}: plugin`);
  const options = object(
    (plugin as Record<PropertyKey, unknown>)[workersTestPlugin],
    `${path}: cloudflareTest`,
  );
  keys(options, ["wrangler"], `${path}: cloudflareTest`);
  const wrangler = object(options.wrangler, `${path}: cloudflareTest.wrangler`);
  keys(wrangler, ["configPath"], `${path}: cloudflareTest.wrangler`);
  requireValue(
    local(
      files,
      project.directory,
      wrangler.configPath,
      `${path}: configPath`,
    ) === configPath,
    "mismatch",
    `${path}: plugin points to a different Wrangler configuration`,
  );
  const test = record(config.test ?? {});
  requireValue(
    test.environment === undefined && test.runner === undefined,
    "mismatch",
    `${path}: Workers plugin does not support custom environment/runner`,
  );
  requireValue(
    record(test.coverage ?? {}).provider === "istanbul",
    "mismatch",
    `${path}: Workers coverage must use Istanbul, not native V8`,
  );
  await installed(
    files,
    projects,
    project,
    "@cloudflare/vitest-plugin",
    "1.8.2",
  );
  const vitest = await installed(files, projects, project, "vitest");
  requireValue(
    satisfies(vitest, "^4.1.0 || ^5.0.0"),
    "unconfirmed",
    `${path}: Vitest version is outside the reviewed plugin peer range`,
  );
  const coverage = await installed(
    files,
    projects,
    project,
    "@vitest/coverage-istanbul",
  );
  requireValue(
    coverage === vitest,
    "mismatch",
    `${path}: Istanbul and Vitest versions must match`,
  );
}
const interpretedWranglerFields = new Set([
  "assets",
  "compatibility_date",
  "compatibility_flags",
  "durable_objects",
  "main",
  "migrations",
  "name",
]);
const ordinaryWranglerFields = new Set([
  "$schema",
  "access",
  "account_id",
  "base_dir",
  "cache",
  "compliance_region",
  "dev",
  "first_party_worker",
  "jsx_factory",
  "jsx_fragment",
  "keep_names",
  "keep_vars",
  "limits",
  "logfwdr",
  "logpush",
  "minify",
  "no_bundle",
  "observability",
  "placement",
  "preserve_file_names",
  "preview_urls",
  "route",
  "routes",
  "send_metrics",
  "tsconfig",
  "upload_source_maps",
  "workers_dev",
]);
const unsupportedWranglerFields = new Set([
  "addresses",
  "agent_memory",
  "ai",
  "ai_search",
  "ai_search_namespaces",
  "alias",
  "analytics",
  "analytics_engine_datasets",
  "artifacts",
  "browser",
  "build",
  "cloudchamber",
  "connect",
  "containers",
  "d1_databases",
  "data_blobs",
  "define",
  "dependencies_instrumentation",
  "dispatch_namespaces",
  "env",
  "exports",
  "find_additional_modules",
  "flagship",
  "hyperdrive",
  "images",
  "k2",
  "kv_namespaces",
  "media",
  "mtls_certificates",
  "pages_build_output_dir",
  "pipelines",
  "previews",
  "python_modules",
  "queues",
  "r2_buckets",
  "ratelimits",
  "rules",
  "secrets",
  "secrets_store_secrets",
  "send_email",
  "services",
  "site",
  "stream",
  "streaming_tail_consumers",
  "tail_consumers",
  "text_blobs",
  "triggers",
  "unsafe",
  "unsafe_hello_world",
  "vars",
  "vectorize",
  "version_metadata",
  "vpc_networks",
  "vpc_services",
  "wasm_modules",
  "worker_loaders",
  "workflows",
]);
function reviewedWranglerField(
  key: string,
): "interpreted" | "ordinary" | "unsupported" | "unknown" {
  if (interpretedWranglerFields.has(key)) return "interpreted";
  if (ordinaryWranglerFields.has(key)) return "ordinary";
  if (unsupportedWranglerFields.has(key)) return "unsupported";
  return "unknown";
}
async function inspectWorker(
  files: Files,
  projects: Project[],
  project: Project,
) {
  const base = project.directory;
  for (const name of ["wrangler.toml", "cloudflare.config.ts"])
    requireValue(
      !files.exists(files.path(base, name)),
      "unconfirmed",
      `${base || "."}: ${name} is outside the JSON/JSONC profile`,
    );
  const candidates = ["wrangler.jsonc", "wrangler.json"]
    .map((name) => files.path(base, name))
    .filter((path) => files.exists(path));
  requireValue(
    candidates.length === 1,
    candidates.length ? "unconfirmed" : "missing",
    `${base || "."}: one Wrangler JSON/JSONC configuration is required`,
  );
  const path = candidates[0]!;
  const config = jsonc(await files.text(path));
  for (const key of Object.keys(config)) {
    const review = reviewedWranglerField(key);
    if (review === "interpreted" || review === "ordinary") continue;
    throw new Finding(
      "unconfirmed",
      review === "unsupported"
        ? `${path}: ${key} capability is outside the reviewed profile`
        : `${path}: ${key} is outside the reviewed Wrangler schema`,
    );
  }
  requireValue(
    /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(string(config.name, `${path}: name`)),
    "unconfirmed",
    `${path}: name shape is outside the reviewed profile`,
  );
  const date = string(config.compatibility_date, `${path}: compatibility_date`);
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date &&
      date <= new Date().toISOString().slice(0, 10),
    "mismatch",
    `${path}: compatibility_date must be a valid non-future date`,
  );
  const flags =
    config.compatibility_flags === undefined
      ? []
      : strings(config.compatibility_flags, `${path}: compatibility_flags`);
  requireValue(
    flags.every((flag) => ["nodejs_compat", "nodejs_als"].includes(flag)),
    "unconfirmed",
    `${path}: compatibility flag semantics are unsupported`,
  );
  await installed(files, projects, project, "wrangler", "4.162.0");
  const nodeText = await files.optionalText(".node-version");
  requirePrerequisite(nodeText !== undefined);
  const node = nodeText.trim().replace(/^v/, "");
  requireValue(
    valid(node) && satisfies(node, ">=22.12.0"),
    "mismatch",
    `${path}: reviewed Wrangler needs developer Node >=22.12.0`,
  );
  const bindingNames: string[] = [];
  const localClasses = new Set<string>();
  const objects =
    config.durable_objects === undefined
      ? {}
      : object(config.durable_objects, `${path}: durable_objects`);
  keys(objects, ["bindings"], `${path}: durable_objects`);
  const bindings = objects.bindings ?? [];
  requireValue(
    Array.isArray(bindings),
    "mismatch",
    `${path}: durable_objects.bindings must be a list`,
  );
  if (config.assets !== undefined) {
    const assets = object(config.assets, `${path}: assets`);
    keys(
      assets,
      [
        "directory",
        "binding",
        "html_handling",
        "not_found_handling",
        "run_worker_first",
        "base_path",
      ],
      `${path}: assets`,
    );
    const directory = local(
      files,
      base,
      assets.directory,
      `${path}: assets.directory`,
    );
    const kind = await files.kind(directory);
    requireValue(
      kind !== "file",
      "mismatch",
      `${path}: assets.directory is a file`,
    );
    requireValue(
      kind === "directory",
      "unconfirmed",
      `${path}: asset output directory is not available`,
    );
    if (assets.binding !== undefined)
      bindingNames.push(string(assets.binding, `${path}: assets.binding`));
    for (const [key, values] of [
      [
        "html_handling",
        [
          "auto-trailing-slash",
          "force-trailing-slash",
          "drop-trailing-slash",
          "none",
        ],
      ],
      ["not_found_handling", ["single-page-application", "404-page", "none"]],
    ] as const)
      requireValue(
        assets[key] === undefined ||
          (values as readonly unknown[]).includes(assets[key]),
        "mismatch",
        `${path}: invalid assets.${key}`,
      );
    if (assets.base_path !== undefined)
      requireValue(
        typeof assets.base_path === "string",
        "mismatch",
        `${path}: assets.base_path must be a string`,
      );
    if (
      assets.run_worker_first !== undefined &&
      typeof assets.run_worker_first !== "boolean"
    ) {
      const routes = strings(
        assets.run_worker_first,
        `${path}: assets.run_worker_first`,
      );
      requireValue(
        routes.every((route) => /^!?\/[A-Za-z0-9_./*:-]*$/.test(route)),
        "unconfirmed",
        `${path}: asset routing pattern is unsupported`,
      );
    }
    requireValue(
      config.main !== undefined ||
        !assets.run_worker_first ||
        (Array.isArray(assets.run_worker_first) &&
          !assets.run_worker_first.length),
      "mismatch",
      `${path}: run_worker_first requires a Worker entrypoint`,
    );
  }
  requireValue(
    config.main !== undefined || config.assets !== undefined,
    "missing",
    `${path}: main or assets is required`,
  );
  if (config.main === undefined) {
    requireValue(
      !bindings.length &&
        (config.migrations === undefined ||
          (Array.isArray(config.migrations) && !config.migrations.length)),
      "mismatch",
      `${path}: local DO requires a Worker entrypoint`,
    );
    await workerTests(files, projects, project, path, false);
    return;
  }
  const main = local(files, base, config.main, `${path}: main`);
  requireValue(
    !(await files.directory(main)),
    "mismatch",
    `${path}: main must be a file, not a directory`,
  );
  const source = await files.optionalText(main);
  requireValue(
    source !== undefined,
    /(?:^|\/)(?:dist|build)\//.test(main) ? "unconfirmed" : "missing",
    `${path}: Worker entrypoint is not available`,
  );
  const shape = workerModule(source, /\.[cm]?tsx?$/.test(main));
  requireValue(
    shape.fetch || bindings.length > 0,
    shape.indirect ? "unconfirmed" : "mismatch",
    `${main}: a statically confirmed module fetch export is required`,
  );
  requireValue(
    !shape.nodeImports.size ||
      flags.includes("nodejs_compat") ||
      (flags.includes("nodejs_als") &&
        [...shape.nodeImports].every((name) => name === "node:async_hooks")),
    "mismatch",
    `${main}: node imports do not match compatibility flags`,
  );
  for (const raw of bindings) {
    const binding = object(raw, `${path}: DO binding`);
    keys(
      binding,
      ["name", "class_name", "script_name", "environment"],
      `${path}: DO binding`,
    );
    requireValue(
      binding.script_name === undefined && binding.environment === undefined,
      "unconfirmed",
      `${path}: external/environment DO references are unsupported`,
    );
    const name = string(binding.name, `${path}: DO name`);
    const className = string(binding.class_name, `${path}: DO class_name`);
    requireValue(
      shape.classes.has(className),
      shape.indirect ? "unconfirmed" : "mismatch",
      `${main}: DO class ${className} is not a confirmed local export`,
    );
    requireValue(
      shape.durable.has(className),
      "unconfirmed",
      `${main}: DO ${className} base class cannot be confirmed`,
    );
    bindingNames.push(name);
    localClasses.add(className);
  }
  requireValue(
    new Set(bindingNames).size === bindingNames.length,
    "mismatch",
    `${path}: duplicate binding names`,
  );
  if (localClasses.size)
    requireValue(
      config.migrations !== undefined,
      "missing",
      `${path}: local DO migration declaration is required`,
    );
  if (config.migrations !== undefined) {
    requireValue(
      Array.isArray(config.migrations),
      "mismatch",
      `${path}: migrations must be a list`,
    );
    const tags = new Set<string>();
    const created = new Set<string>();
    for (const raw of config.migrations) {
      const migration = object(raw, `${path}: migration`);
      keys(migration, ["tag", "new_sqlite_classes"], `${path}: migration`);
      const tag = string(migration.tag, `${path}: migration tag`);
      requireValue(
        !tags.has(tag),
        "mismatch",
        `${path}: duplicate migration tag`,
      );
      tags.add(tag);
      for (const className of migration.new_sqlite_classes === undefined
        ? []
        : strings(
            migration.new_sqlite_classes,
            `${path}: new_sqlite_classes`,
          )) {
        requireValue(
          shape.durable.has(className) && !created.has(className),
          "mismatch",
          `${path}: migration class ${className} is not a unique local DO export`,
        );
        created.add(className);
      }
    }
    for (const className of localClasses)
      requireValue(
        created.has(className),
        "mismatch",
        `${path}: bound DO has no supported create migration`,
      );
  }
  await typeDeclarations(files, project, bindingNames, shape.nodeImports);
  await workerTests(files, projects, project, path);
}
export async function cloudflare(
  files: Files,
  projects: Project[],
  report: ProblemReporter<ProblemCode>,
) {
  for (const project of projects.filter(
    (project) => project.delivery === "cloudflare",
  )) {
    try {
      await inspectWorker(files, projects, project);
    } catch (error) {
      if (error instanceof Prerequisite) continue;
      if (error instanceof Finding)
        report(`cloudflare-${error.status}`, error.message);
      else if (error instanceof Unconfirmed)
        report(
          "cloudflare-unconfirmed",
          `${project.directory || "."}: ${error.message}`,
        );
      else throw error;
    }
  }
}
