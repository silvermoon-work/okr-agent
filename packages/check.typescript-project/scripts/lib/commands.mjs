import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import process from "node:process";

const standard = [
  "typecheck",
  "lint",
  "format",
  "format-check",
  "test",
  "test-coverage",
  "lint-package",
  "check",
  "build",
  "release",
  "release-dry-run",
];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function pnpmCommand(args) {
  const cli = process.env.npm_execpath;
  if (process.platform === "win32" && cli) {
    if (/\.[cm]?js$/i.test(cli)) return [process.execPath, [cli, ...args]];
    if (/\.exe$/i.test(cli)) return [cli, args];
  }
  return ["pnpm", args];
}
function ordered(projects) {
  const result = [];
  const visited = new Set();
  const visit = (project, stack) => {
    assert(!stack.includes(project.directory), "Cyclic project topology");
    if (visited.has(project.directory)) return;
    for (const name of project.dependencies) {
      const dependency = projects.find(
        (candidate) => candidate.manifest.name === name,
      );
      if (dependency) visit(dependency, [...stack, project.directory]);
    }
    visited.add(project.directory);
    result.push(project);
  };
  for (const project of projects) visit(project, []);
  return result;
}
export function configuration(projects) {
  assert(
    Array.isArray(projects) && projects.length > 0 && projects.length <= 129,
    "Project topology is unavailable",
  );
  const directories = new Set();
  const names = new Set();
  for (const project of projects) {
    assert(
      typeof project.directory === "string" &&
        !directories.has(project.directory),
      "Invalid/duplicate project directory",
    );
    assert(
      project.manifest && typeof project.manifest === "object",
      "Missing package manifest",
    );
    if (project.manifest.name) {
      assert(
        !names.has(project.manifest.name),
        "Ambiguous workspace package name",
      );
      names.add(project.manifest.name);
    }
    directories.add(project.directory);
    project.dependencies = [
      ...new Set(
        [
          "dependencies",
          "devDependencies",
          "optionalDependencies",
          "peerDependencies",
        ].flatMap((field) => Object.keys(project.manifest[field] ?? {})),
      ),
    ];
  }
  assert(directories.has("."), "Root project is required");
  ordered(projects);
  return projects;
}
export function projectStrategy(projects) {
  const scopes = projects.filter((project) => project.code !== false);
  return { kind: scopes.length > 1 ? "monorepo" : "single-package", scopes };
}
export function plan(projects, action, scope = ".") {
  configuration(projects);
  assert(
    standard.includes(action) &&
      !["build", "release", "release-dry-run"].includes(action),
    "Unsupported fixed action",
  );
  assert(
    projects.some((project) => project.directory === scope),
    "Unknown project scope",
  );
  const selected = ordered(projects).filter(
    (project) => scope === "." || project.directory === scope,
  );
  const strategy = projectStrategy(selected);
  const buildScope = new Set();
  const includeBuild = (project) => {
    if (buildScope.has(project.directory)) return;
    buildScope.add(project.directory);
    for (const name of project.dependencies) {
      const dependency = projects.find(
        (candidate) => candidate.manifest.name === name,
      );
      if (dependency) includeBuild(dependency);
    }
  };
  for (const project of selected) includeBuild(project);
  const builds = ordered(projects).filter((project) =>
    buildScope.has(project.directory),
  );
  const tasks = [];
  const tools = {
    typecheck: ["tsc", "--noEmit", "--project", "tsconfig.json"],
    lint: ["eslint", ".", "--max-warnings=0"],
    test: ["vitest", "run", "--watch=false", "--passWithNoTests=false"],
    "test-coverage": [
      "vitest",
      "run",
      "--watch=false",
      "--passWithNoTests=false",
      "--coverage.enabled=true",
    ],
    "lint-package": ["publint"],
  };
  const append = (name) => {
    if (name === "format" || name === "format-check") {
      tasks.push({
        directory: scope,
        args: [
          "exec",
          "prettier",
          name === "format" ? "--write" : "--check",
          ".",
        ],
      });
      return;
    }
    for (const project of name === "build"
      ? builds
      : name === "lint-package"
        ? selected
        : strategy.scopes) {
      if (name === "build") {
        if (project.manifest.scripts?.build !== undefined)
          tasks.push({ directory: project.directory, args: ["run", "build"] });
        continue;
      }
      if (name === "lint-package") {
        if (
          project.manifest.private === true ||
          (project.manifest.publishConfig === undefined &&
            project.manifest.scripts?.["lint-package"] === undefined)
        )
          continue;
        tasks.push({
          directory: project.directory,
          args: ["exec", ...tools[name]],
        });
        continue;
      }
      const kind = name === "test-coverage" ? "test" : name;
      if (project.code === false) continue;
      const config = project.configs?.[kind];
      if (config === undefined) {
        assert(
          !project.code,
          `Cannot determine ${kind} configuration for ${project.directory}`,
        );
        continue;
      }
      const path = relative(project.directory, config).split(sep).join("/");
      const args =
        kind === "test"
          ? [...tools[name], "--root", ".", "--config", path]
          : kind === "typecheck"
            ? ["tsc", "--noEmit", "--project", path]
            : [
                "eslint",
                ...(project.files ?? ["."]),
                "--max-warnings=0",
                "--config",
                path,
              ];
      tasks.push({ directory: project.directory, args: ["exec", ...args] });
    }
  };
  const extensions = (kind) => {
    for (const project of selected)
      for (const name of Object.keys(project.manifest.scripts ?? {}))
        if (name.startsWith(`${kind}-`) && !standard.includes(name))
          tasks.push({ directory: project.directory, args: ["run", name] });
  };
  if (action === "check") {
    append("format-check");
    append("build");
    append("typecheck");
    append("lint");
    append("test-coverage");
    extensions("test");
    append("lint-package");
    extensions("check");
  } else {
    append(action);
    if (action === "test" || action === "test-coverage") extensions("test");
  }
  return tasks;
}
export function execute(tasks, root, spawn = spawnSync) {
  for (const task of tasks) {
    const [tool, args] = pnpmCommand(task.args);
    const result = spawn(tool, args, {
      cwd: resolve(root, task.directory),
      stdio: "inherit",
      shell: false,
    });
    if (result.error) throw result.error;
    assert(
      result.status === 0 && !result.signal,
      `Action failed in ${task.directory}: pnpm ${task.args.join(" ")}`,
    );
  }
}
export function discover(root, list = execFileSync) {
  const [tool, args] = pnpmCommand([
    "--recursive",
    "--include-workspace-root",
    "list",
    "--depth",
    "-1",
    "--json",
  ]);
  const paths = existsSync(resolve(root, "pnpm-workspace.yaml"))
    ? JSON.parse(
        list(tool, args, { cwd: root, encoding: "utf8", shell: false }),
      ).map((entry) => entry.path)
    : [root];
  const directories = [
    ...new Set(
      [root, ...paths].map((path) => {
        const directory =
          relative(root, resolve(path)).split(sep).join("/") || ".";
        assert(
          directory !== ".." && !directory.startsWith("../"),
          "Workspace escapes root",
        );
        return directory;
      }),
    ),
  ];
  const configNames = {
    typecheck: ["tsconfig.json"],
    lint: [
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      "eslint.config.ts",
      "eslint.config.mts",
      "eslint.config.cts",
    ],
    test: [
      "vitest.config.ts",
      "vitest.config.js",
      "vitest.config.mjs",
      "vitest.config.mts",
      "vitest.config.cjs",
      "vitest.config.cts",
      "vite.config.ts",
      "vite.config.js",
    ],
  };
  let scanned = 0;
  const code = (directory, targets, path = resolve(root, directory)) => {
    let found = false;
    for (const entry of readdirSync(path, { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )) {
      assert(++scanned <= 16384, "Source topology exceeds inspection budget");
      const full = resolve(path, entry.name);
      if (entry.isDirectory()) {
        if (
          [
            "node_modules",
            ".git",
            ".silvermoon",
            ".turbo",
            "dist",
            "coverage",
            ".release-artifacts",
          ].includes(entry.name) ||
          directories.some(
            (member) => member !== directory && resolve(root, member) === full,
          )
        )
          continue;
        if (code(directory, targets, full)) found = true;
      } else if (
        entry.isFile() &&
        /\.(?:[cm]?ts|tsx)$/.test(entry.name) &&
        !/\.d\.[cm]?ts$|config\.[cm]?ts$/.test(entry.name)
      ) {
        found = true;
        targets.push(
          relative(resolve(root, directory), full).split(sep).join("/"),
        );
      }
    }
    return found;
  };
  return configuration(
    directories.map((directory) => {
      const manifest = JSON.parse(
        readFileSync(resolve(root, directory, "package.json"), "utf8"),
      );
      const configs = {};
      for (const [kind, names] of Object.entries(configNames)) {
        let candidate = resolve(root, directory);
        for (;;) {
          const found = names.filter((name) =>
            existsSync(resolve(candidate, name)),
          );
          assert(
            found.length <= 1,
            `Ambiguous ${kind} configuration in ${candidate}`,
          );
          const name = found[0];
          if (name) {
            configs[kind] = relative(root, resolve(candidate, name))
              .split(sep)
              .join("/");
            break;
          }
          if (candidate === resolve(root)) break;
          candidate = dirname(candidate);
        }
      }
      const files = [];
      return {
        directory,
        manifest,
        configs,
        code: code(directory, files),
        files,
      };
    }),
  );
}
export function run(action) {
  assert(process.argv.length === 2, "Fixed entries do not accept arguments");
  let root = process.cwd();
  let nearest;
  for (;;) {
    if (existsSync(resolve(root, "package.json"))) nearest ??= root;
    if (existsSync(resolve(root, "pnpm-workspace.yaml"))) break;
    const parent = dirname(root);
    if (parent === root) {
      root = nearest;
      break;
    }
    root = parent;
  }
  assert(root, "Cannot determine package root");
  const scope = relative(root, process.cwd()).split(sep).join("/") || ".";
  execute(plan(discover(root), action, scope), root);
}
