import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { Command, CommanderError } from "commander";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";
import {
  directoryTree,
  writeDirectory,
  writeStreamFile,
} from "@silvermoon-work/task-builder-cli/node";
import { fileTree, type ReadOptions } from "@silvermoon-work/task-builder/tree";
import { buildCheckBundle, transformCheckTree } from "./index.js";
import { createCheckProject, version } from "./project.js";

export interface CheckBuilderCliOptions extends ReadOptions {
  readonly cwd?: string;
  readonly stdout?: { write(text: string): unknown };
  readonly stderr?: { write(text: string): unknown };
  readonly signalExitCode?: () => 130 | 143;
}

class DeliveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

async function info(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
function inside(root: string, path: string): boolean {
  const distance = relative(root, path);
  return (
    distance === "" ||
    (!distance.startsWith(`..${sep}`) &&
      distance !== ".." &&
      !distance.includes(":"))
  );
}
async function safePath(path: string): Promise<void> {
  let current = resolve(path);
  for (;;) {
    const entry = await info(current);
    if (entry?.isSymbolicLink())
      throw new Error(`Output must not traverse a symbolic link: ${current}`);
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function validateOptions(program: Command, argv: readonly string[]): void {
  let command = program;
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!;
    if (token === "--") break;
    if (token.startsWith("-") && token !== "-") {
      const flag = token.split("=")[0]!;
      const help = flag === "--help" || flag === "-h";
      const option = command.options.find(
        (item) => item.short === flag || item.long === flag,
      );
      if (!option && !help)
        throw new DeliveryError("INVALID_ARGUMENT", `Unknown option ${flag}.`);
      if (
        token.includes("=") &&
        (help || (!option!.required && !option!.optional))
      )
        throw new DeliveryError(
          "INVALID_ARGUMENT",
          `${flag} does not accept a value.`,
        );
      const key = `${command.name()}:${help ? "help" : option!.name()}`;
      if (seen.has(key))
        throw new DeliveryError(
          "INVALID_ARGUMENT",
          `Duplicate option ${flag}.`,
        );
      seen.add(key);
      if (flag === "--version" && argv.length !== 1)
        throw new DeliveryError(
          "INVALID_ARGUMENT",
          "--version is a standalone root option.",
        );
      if (option?.required && !token.includes("=")) index++;
    } else if (command === program) {
      command =
        program.commands.find((item) => item.name() === token) ?? program;
    }
  }
}

async function build(
  config: string,
  outDir: string | undefined,
  car: boolean,
  cwd: string,
  options: ReadOptions,
) {
  const file = resolve(cwd, config);
  let root = dirname(file);
  for (let ancestor = root; ; ancestor = dirname(ancestor)) {
    if ((await info(join(ancestor, "pnpm-workspace.yaml")))?.isFile()) {
      root = ancestor;
      break;
    }
    if (dirname(ancestor) === ancestor) break;
  }
  const path = relative(root, file).split(sep).join("/");
  const input = await directoryTree(root);
  const readOptions = {
    ...options,
    ...(outDir !== undefined ? { outDirectory: resolve(cwd, outDir) } : {}),
  };
  const definition = await transformCheckTree(input, path, readOptions);
  const directory = resolve(root, definition.outDirectory);
  const archivePath = `${directory}.car`;
  await safePath(directory);
  if (car) await safePath(archivePath);
  const protect = (path: string) => {
    if (inside(directory, path) || (car && path === archivePath))
      throw new Error("Output must not contain or replace build inputs.");
  };
  if (typeof definition.options.source.contract !== "string")
    throw new Error("Expected source contract path.");
  for (const path of [
    file,
    resolve(root, definition.options.source.entry),
    resolve(root, definition.options.source.contract),
  ])
    protect(path);
  for (const rule of definition.options.include ?? []) {
    const parts = rule.from.split("/");
    const wildcard = parts.findIndex((part) => /[*?]/.test(part));
    const base = resolve(root, ...parts.slice(0, wildcard < 0 ? -1 : wildcard));
    if (
      inside(base, directory) ||
      inside(directory, base) ||
      (car && inside(base, archivePath))
    )
      throw new Error("Resources must not traverse output paths.");
  }
  const { realpath } = await import("node:fs/promises");
  const observed: typeof input = {
    async list(path, readOptions) {
      protect(await realpath(resolve(root, path)));
      return input.list(path, readOptions);
    },
    async read(path, readOptions) {
      protect(await realpath(resolve(root, path)));
      return input.read(path, readOptions);
    },
  };
  const tree = await buildCheckBundle(observed, path, readOptions);
  const staging = join(dirname(file), `.check-task-builder-${randomUUID()}`);
  let archive: Awaited<ReturnType<typeof encodeTaskBundleCar>> | undefined;
  let updating = false;
  let data:
    | {
        module: {
          directory: string;
          declaration: string;
          files: readonly string[];
        };
        cid: string;
        car: { path: string } | null;
      }
    | undefined;
  let failure: unknown;
  try {
    const files = await writeDirectory(tree, staging, options);
    archive = await encodeTaskBundleCar(await directoryTree(staging), options);
    if (car) await writeStreamFile(archive.stream, `${staging}.car`, options);
    options.signal?.throwIfAborted();
    updating = true;
    for (const path of files) {
      options.signal?.throwIfAborted();
      const target = join(directory, ...path.split("/"));
      await safePath(target);
      await mkdir(dirname(target), { recursive: true });
      await rename(join(staging, ...path.split("/")), target);
    }
    const installedDirectory = await directoryTree(directory);
    const installed = await encodeTaskBundleCar(
      fileTree(
        new Map(
          files.map((path) => [
            path,
            (readOptions: ReadOptions) =>
              installedDirectory.read(path, readOptions),
          ]),
        ),
      ),
      options,
    );
    try {
      if (installed.cid !== archive.cid)
        throw new Error("Delivered Bundle identity changed.");
    } finally {
      await installed.close();
    }
    data = {
      module: { directory, declaration: join(directory, "task.yaml"), files },
      cid: archive.cid,
      car: null,
    };
    if (car) {
      await safePath(archivePath);
      await rename(`${staging}.car`, archivePath);
      data.car = { path: archivePath };
    }
    options.signal?.throwIfAborted();
  } catch (error) {
    failure = error;
  } finally {
    try {
      await archive?.close();
      await rm(staging, { recursive: true, force: true });
      await rm(`${staging}.car`, { force: true });
    } catch (cause) {
      failure = new DeliveryError(
        "CLEANUP_UNCERTAIN",
        `Staging cleanup could not be confirmed: ${String(cause)}`,
        data,
      );
    }
  }
  if (failure) {
    if (failure instanceof DeliveryError) throw failure;
    if (updating && !data)
      throw new DeliveryError(
        "DELIVERY_UNCERTAIN",
        "Some selected files may have changed; the module is not a verified delivery.",
      );
    if (options.signal?.aborted)
      throw new DeliveryError(
        "INTERRUPTED",
        "Operation canceled; staging cleanup completed. Only reported deliveries were verified.",
        data,
      );
    if (data)
      throw new DeliveryError(
        "CAR_WRITE_FAILED",
        "Module was verified, but CAR delivery failed. Any old CAR is not this invocation's result.",
        data,
      );
    throw failure instanceof Error
      ? failure
      : new Error("Build failed.", { cause: failure });
  }
  return data;
}

/** One noninteractive invocation; business envelopes are always written to stdout. */
export async function runCheckBuilderCli(
  argv: readonly string[],
  options: CheckBuilderCliOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const cwd = resolve(options.cwd ?? process.cwd());
  const readOptions: ReadOptions = options.signal
    ? { signal: options.signal }
    : {};
  const program = new Command();
  let result: unknown;
  try {
    program
      .name("check-task-builder")
      .description(
        "Create Check projects and build standard Task Bundles/CARs.",
      )
      .version(await version())
      .enablePositionalOptions()
      .exitOverride()
      .configureOutput({
        writeOut: (text) => {
          stdout.write(text);
        },
        writeErr: () => undefined,
      })
      .addHelpText(
        "after",
        "\nExamples:\n  check-task-builder init text-check\n  check-task-builder build check.build.yaml --no-car\n",
      );
    program
      .command("init")
      .description(
        "Create an editable Check project; never install or overwrite.",
      )
      .argument("<directory>", "New directory; parent must exist")
      .option(
        "--package-name <name>",
        "npm package name (default: directory basename)",
      )
      .option(
        "--task-name <name>",
        "Task name (default: unscoped package name)",
      )
      .addHelpText(
        "after",
        "\nExample: check-task-builder init text-check --task-name text-check\n",
      )
      .action(
        async (
          directory: string,
          flags: { packageName?: string; taskName?: string },
        ) => {
          readOptions.signal?.throwIfAborted();
          const output = resolve(cwd, directory);
          await safePath(output);
          if (await info(output))
            throw new DeliveryError(
              "OUTPUT_EXISTS",
              "Target already exists; nothing was overwritten.",
            );
          if (!(await stat(dirname(output))).isDirectory())
            throw new Error("Parent must be a directory.");
          const tree = await createCheckProject({
            name: flags.packageName ?? basename(output),
            ...(flags.taskName !== undefined
              ? { taskName: flags.taskName }
              : {}),
          });
          const files = await writeDirectory(tree, output, readOptions);
          result = {
            directory: output,
            files,
            nextSteps: ["pnpm install", "pnpm typecheck", "pnpm build"],
          };
        },
      );
    program
      .command("build")
      .description(
        "Validate then replace selected Bundle files and sibling CAR; never clean.",
      )
      .argument("[build-file]", "Check build description", "check.build.yaml")
      .option("--out-dir <directory>", "Output directory relative to cwd")
      .option("--no-car", "Do not update or remove any CAR")
      .addHelpText(
        "after",
        "\nExample: check-task-builder build --out-dir dist/text-check\n",
      )
      .action(
        async (file: string, flags: { outDir?: string; car: boolean }) => {
          result = await build(file, flags.outDir, flags.car, cwd, readOptions);
        },
      );
    validateOptions(program, argv);
    if (!argv.length) program.outputHelp();
    else await program.parseAsync([...argv], { from: "user" });
    if (result !== undefined && options.signal?.aborted)
      throw new DeliveryError(
        "INTERRUPTED",
        "Operation canceled after confirmed delivery and cleanup; verified results are retained.",
        result,
      );
    if (result !== undefined)
      stdout.write(`${JSON.stringify({ ok: true, data: result })}\n`);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    const uncertain =
      error instanceof AggregateError ||
      (error instanceof DeliveryError && error.code.endsWith("UNCERTAIN"));
    const canceled =
      options.signal?.aborted &&
      !uncertain &&
      ((error instanceof DeliveryError && error.code === "INTERRUPTED") ||
        error === options.signal.reason ||
        (error instanceof Error && error.name === "AbortError"));
    const code = uncertain
      ? error instanceof DeliveryError
        ? error.code
        : "CLEANUP_UNCERTAIN"
      : canceled
        ? "INTERRUPTED"
        : error instanceof CommanderError
          ? "INVALID_ARGUMENT"
          : error instanceof DeliveryError
            ? error.code
            : "OPERATION_FAILED";
    const message =
      error instanceof Error ? error.message : "Operation failed.";
    stdout.write(
      `${JSON.stringify({ ok: false, ...(error instanceof DeliveryError && error.data ? { data: error.data } : {}), error: { code, message } })}\n`,
    );
    return canceled ? (options.signalExitCode?.() ?? 130) : 1;
  }
}
