import { delimiter, posix, win32 } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const path = Type.String({ minLength: 1 });
export const ExecutionEnvironment = Type.Object(
  {
    path: Type.Array(path, { minItems: 1 }),
    pathExtensions: Type.Optional(
      Type.Array(
        Type.Union([
          Type.Literal(".COM"),
          Type.Literal(".EXE"),
          Type.Literal(".BAT"),
          Type.Literal(".CMD"),
        ]),
        { minItems: 1, uniqueItems: true },
      ),
    ),
    home: Type.Optional(path),
    userProfile: Type.Optional(path),
    appData: Type.Optional(path),
    localAppData: Type.Optional(path),
    xdgConfigHome: Type.Optional(path),
    nvmDir: Type.Optional(path),
    nvmHome: Type.Optional(path),
    nvmSymlink: Type.Optional(path),
    pnpmHome: Type.Optional(path),
    npmConfig: Type.Optional(
      Type.Object(
        {
          registry: Type.Optional(Type.String({ minLength: 1 })),
          userConfig: Type.Optional(path),
          globalConfig: Type.Optional(path),
          prefix: Type.Optional(path),
          global: Type.Optional(Type.Boolean()),
          location: Type.Optional(
            Type.Union([
              Type.Literal("project"),
              Type.Literal("user"),
              Type.Literal("global"),
            ]),
          ),
        },
        { additionalProperties: false, minProperties: 1 },
      ),
    ),
  },
  { additionalProperties: false },
);
export type ExecutionEnvironment = Static<typeof ExecutionEnvironment>;

const paths = {
  home: "HOME",
  userProfile: "USERPROFILE",
  appData: "APPDATA",
  localAppData: "LOCALAPPDATA",
  xdgConfigHome: "XDG_CONFIG_HOME",
  nvmDir: "NVM_DIR",
  nvmHome: "NVM_HOME",
  nvmSymlink: "NVM_SYMLINK",
  pnpmHome: "PNPM_HOME",
} as const;
const npmPaths = {
  userConfig: "npm_config_userconfig",
  globalConfig: "npm_config_globalconfig",
  prefix: "npm_config_prefix",
} as const;

export function registryUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Registry URL must be an absolute HTTP(S) URL.");
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[\s\\]/.test(value) ||
    value.includes("${")
  )
    throw new Error(
      "Registry URL must not contain credentials, interpolation, query, fragment or whitespace.",
    );
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function absoluteHostPath(
  value: string,
  platform = process.platform,
): boolean {
  return (
    !/[\0\r\n]/.test(value) &&
    (platform === "win32"
      ? win32.isAbsolute(value) && !/^[/\\](?![/\\])/.test(value)
      : posix.isAbsolute(value))
  );
}

export function validateExecutionEnvironment(
  value: unknown,
  platform: NodeJS.Platform = process.platform,
): asserts value is ExecutionEnvironment {
  if (!Value.Check(ExecutionEnvironment, value))
    throw new Error(
      `Invalid executionEnvironment schema at ${[...Value.Errors(ExecutionEnvironment, value)].map((error) => error.path).join(", ")}.`,
    );
  for (const directory of value.path)
    if (
      !absoluteHostPath(directory, platform) ||
      directory.includes(platform === "win32" ? ";" : ":")
    )
      throw new Error(
        "Execution PATH entries must be unambiguous absolute host paths.",
      );
  for (const key of Object.keys(paths) as (keyof typeof paths)[]) {
    const directory = value[key];
    if (directory !== undefined && !absoluteHostPath(directory, platform))
      throw new Error("Execution context paths must be absolute host paths.");
  }
  for (const key of Object.keys(npmPaths) as (keyof typeof npmPaths)[]) {
    const directory = value.npmConfig?.[key];
    if (directory !== undefined && !absoluteHostPath(directory, platform))
      throw new Error("npm configuration paths must be absolute host paths.");
  }
  if (
    platform === "win32"
      ? !value.pathExtensions
      : value.pathExtensions !== undefined ||
        value.userProfile !== undefined ||
        value.appData !== undefined ||
        value.localAppData !== undefined
  )
    throw new Error(
      "Execution context fields conflict with the execution platform.",
    );
  if (value.npmConfig?.registry !== undefined)
    registryUrl(value.npmConfig.registry);
}

/** Call only on the authorized execution host, never to attest to a remote host. */
export function captureExecutionEnvironment(
  source: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): ExecutionEnvironment {
  function read(name: string): string | undefined {
    // Inspect names only for alias ambiguity; never copy values of unapproved keys.
    const aliases = Object.getOwnPropertyNames(source).filter(
      (key) => key.toLowerCase() === name.toLowerCase(),
    );
    const values = aliases
      .map((key) => source[key])
      .filter((value) => value !== undefined);
    if (new Set(values).size > 1)
      throw new Error(`Conflicting execution-context aliases for ${name}.`);
    return values[0];
  }
  const rawPath = read("PATH");
  if (rawPath === undefined)
    throw new Error("Authorized execution PATH must be supplied.");
  const value: ExecutionEnvironment = {
    path: rawPath
      .split(platform === "win32" ? ";" : ":")
      .map((directory) => directory.replace(/^"|"$/g, "")),
  };
  if (platform === "win32") {
    const extensions = read("PATHEXT");
    if (extensions === undefined)
      throw new Error("Authorized Windows PATHEXT must be supplied.");
    const selected = extensions.toUpperCase().split(";").filter(Boolean);
    if (
      selected.some(
        (extension) => ![".COM", ".EXE", ".BAT", ".CMD"].includes(extension),
      )
    )
      throw new Error("Unsupported captured Windows executable extension.");
    value.pathExtensions = selected as NonNullable<
      ExecutionEnvironment["pathExtensions"]
    >;
  }
  for (const [field, variable] of Object.entries(paths)) {
    if (
      platform !== "win32" &&
      ["userProfile", "appData", "localAppData"].includes(field)
    )
      continue;
    const result = read(variable);
    if (result !== undefined) Object.assign(value, { [field]: result });
  }
  const npmConfig: NonNullable<ExecutionEnvironment["npmConfig"]> = {};
  for (const [field, variable] of Object.entries(npmPaths)) {
    const result = read(variable);
    if (result !== undefined) Object.assign(npmConfig, { [field]: result });
  }
  const registry = read("npm_config_registry");
  const global = read("npm_config_global");
  const location = read("npm_config_location");
  if (registry !== undefined) npmConfig.registry = registry;
  if (global !== undefined) {
    if (!["true", "false"].includes(global))
      throw new Error("Unsupported npm global environment value.");
    npmConfig.global = global === "true";
  }
  if (location !== undefined) {
    if (!["project", "user", "global"].includes(location))
      throw new Error("Unsupported npm location environment value.");
    npmConfig.location = location as "project" | "user" | "global";
  }
  if (Object.keys(npmConfig).length) value.npmConfig = npmConfig;
  validateExecutionEnvironment(value, platform);
  return value;
}

export function executionEnvironment(
  value: ExecutionEnvironment,
  system: Partial<Pick<NodeJS.ProcessEnv, "SystemRoot" | "WINDIR">> = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
  },
): NodeJS.ProcessEnv {
  validateExecutionEnvironment(value);
  const env: NodeJS.ProcessEnv = { PATH: value.path.join(delimiter) };
  if (value.pathExtensions) env.PATHEXT = value.pathExtensions.join(";");
  for (const key of Object.keys(paths) as (keyof typeof paths)[])
    if (value[key] !== undefined) env[paths[key]] = value[key];
  for (const key of Object.keys(npmPaths) as (keyof typeof npmPaths)[])
    if (value.npmConfig?.[key] !== undefined)
      env[npmPaths[key]] = value.npmConfig[key];
  if (value.npmConfig?.registry !== undefined)
    env.npm_config_registry = value.npmConfig.registry;
  if (value.npmConfig?.global !== undefined)
    env.npm_config_global = String(value.npmConfig.global);
  if (value.npmConfig?.location !== undefined)
    env.npm_config_location = value.npmConfig.location;
  for (const key of ["SystemRoot", "WINDIR"] as const)
    if (system[key] !== undefined) {
      if (!absoluteHostPath(system[key]))
        throw new Error("Invalid trusted Worker system path.");
      env[key] = system[key];
    }
  return env;
}
