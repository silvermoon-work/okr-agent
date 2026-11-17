import { spawn } from "node:child_process";
import { extname, resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { createConfiguredContent } from "@silvermoon-work/ipfs-store/node";
import {
  ConfigurationError,
  configPath,
  readConfiguration,
  rootCid,
  writeConfiguration,
} from "./configuration.js";
import {
  boundedRead,
  DocumentError,
  InputError,
  schemaUri,
} from "./document.js";
import { startPreview } from "./preview.js";
import { taskBundleLimits } from "@silvermoon-work/task-protocol";

interface Flags {
  dataDir?: string;
  open?: boolean;
  ipfsGateway?: string;
  contentDataDir?: string;
}
class OperationError extends Error {
  constructor(
    message: string,
    readonly code = "OPERATION_FAILED",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Best effort only; this never wraps/relaunches the CLI. */
export async function openBrowser(
  url: string,
  signal?: AbortSignal,
): Promise<void> {
  const command =
    process.platform === "win32"
      ? "rundll32.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      windowsHide: true,
      timeout: 10000,
      ...(signal ? { signal } : {}),
    });
    let failed = false;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const terminate = () => {
      failed = true;
      // Native timeout/AbortSignal sends TERM, which Unix openers may ignore.
      // Keep ownership until close, but do not wait indefinitely to escalate.
      escalation ??= setTimeout(() => {
        child.kill("SIGKILL");
      }, 1000);
    };
    const timeout = setTimeout(terminate, 10000);
    const onError = () => {
      failed = true;
    };
    const onClose = (
      code: number | null,
      termination: NodeJS.Signals | null,
    ) => {
      clearTimeout(timeout);
      clearTimeout(escalation);
      signal?.removeEventListener("abort", terminate);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      if (!failed && code === 0 && !termination) resolve();
      else reject(new Error("Browser opener failed."));
    };
    child.on("error", onError);
    child.once("close", onClose);
    signal?.addEventListener("abort", terminate, { once: true });
    if (signal?.aborted) terminate();
  });
}

/** Owns stdio/signals/lifetime. Importing this module never starts the CLI. */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const lifetime = new AbortController();
  let signalCode = 0;
  const interrupt = () => {
    signalCode = 130;
    lifetime.abort();
  };
  const terminate = () => {
    signalCode = 143;
    lifetime.abort();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  let code = 0;
  const result = { emitted: false };
  const output = (value: unknown) => {
    process.stdout.write(JSON.stringify(value) + "\n");
    result.emitted = true;
  };
  const success = (data: unknown) => {
    output({ ok: true, data });
  };
  const diagnostic = (message: string) => {
    process.stderr.write(`${message}\n`);
  };
  const command = new Command()
    .name("ipfsaw")
    .description(
      "Run a browser Task with a local document, or preview using a legacy renderer binding.",
    )
    .argument("[document]", ".yaml, .yml or .json file to watch")
    .option(
      "--data-dir <path>",
      "ipfsaw mapping/state directory (not the IPFS content directory)",
    )
    .option("--no-open", "Print the ready result without opening a browser")
    .option(
      "--ipfs-gateway <url>",
      "Fetch missing CID blocks using the existing Task gateway override",
    )
    .option(
      "--content-data-dir <directory>",
      "Existing Task local content-store directory override",
    )
    .version("0.1.0-rc.1")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => {
        process.stdout.write(text);
      },
      writeErr: () => {
        /* Usage is reported as a safe JSON envelope below. */
      },
    })
    .addHelpText(
      "after",
      "\nExamples:\n  ipfsaw run --car .\\check.car --document .\\check.yaml --no-open\n  ipfsaw .\\check.yaml --no-open\n  ipfsaw registry list --data-dir .\\preview-state\n\nrun uses genuine browser Tasks; the root document/registry path retains the legacy renderer ABI.\nBusiness output is one JSON envelope; logs use stderr.\nApp directory: --data-dir > IPFSAW_DATA_DIR > ~/.silvermoon.work/ipfsaw.\nBindings are a startup snapshot. IPFS configuration is shared with Task.\n",
    )
    .action(async (document: string | undefined, flags: Flags) => {
      if (document === undefined) {
        command.outputHelp();
        return;
      }
      if (![".yaml", ".yml", ".json"].includes(extname(document).toLowerCase()))
        throw new InputError(
          "Pass a .yaml/.yml/.json file; stdin and unknown commands are not supported.",
        );
      const configuration = await readConfiguration(configPath(flags.dataDir));
      const store = await createConfiguredContent({
        ...(flags.ipfsGateway !== undefined
          ? { gateway: flags.ipfsGateway }
          : {}),
        ...(flags.contentDataDir !== undefined
          ? { dataDir: resolve(flags.contentDataDir) }
          : {}),
      });
      let preview: Awaited<ReturnType<typeof startPreview>> | undefined;
      let failure: unknown;
      try {
        preview = await startPreview({
          path: resolve(document),
          configuration,
          store,
          signal: lifetime.signal,
          diagnostic,
        });
        success({
          state: "listening",
          url: preview.url,
          schema: preview.schema,
          rendererCid: preview.rendererCid,
        });
        diagnostic(
          "Loopback preview is ready. Waiting for document changes; press Ctrl+C to stop.",
        );
        if (flags.open !== false && configuration.openBrowser !== false) {
          try {
            await openBrowser(preview.url, lifetime.signal);
          } catch {
            if (!lifetime.signal.aborted)
              diagnostic(
                "Warning: could not open a browser. Open data.url from the result printed on stdout.",
              );
          }
        }
        if (!lifetime.signal.aborted)
          await new Promise<void>((resolve) => {
            lifetime.signal.addEventListener(
              "abort",
              () => {
                resolve();
              },
              { once: true },
            );
          });
      } catch (error) {
        failure = error;
      }
      const failures: unknown[] = [];
      try {
        await preview?.close();
      } catch (error) {
        failures.push(error);
      }
      try {
        await store.close();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length)
        throw new OperationError("Preview cleanup failed.", "CLEANUP_FAILED", {
          cause: new AggregateError(failures),
        });
      if (failure)
        throw failure instanceof Error
          ? failure
          : new OperationError("Preview failed.");
    });
  const once = (value: string, previous: unknown): string => {
    if (previous !== undefined)
      throw new InputError("Pass each source/document option once.");
    if (!value) throw new InputError("Option values must not be empty.");
    return value;
  };
  const run = command
    .command("run")
    .configureHelp({ showGlobalOptions: true })
    .description(
      "Launch a standard browser Task; saving replaces the app and resets its state/router.",
    )
    .option("--cid <cid>", "Immutable browser Task Bundle root CID", once)
    .option(
      "--car <path>",
      "Complete local standard Task CAR (no upload)",
      once,
    )
    .requiredOption(
      "--document <path>",
      "Local YAML/JSON Task parameters, without an implicit envelope",
      once,
    )
    .addHelpText(
      "after",
      "\nChoose exactly one of --cid or --car. No registry binding is required.\nHTTP listening does not mean the browser startup Task completed.\nExamples:\n  ipfsaw run --cid <bundleCID> --document .\\document.yaml\n  ipfsaw run --car .\\check.car --document .\\check.json --no-open\n",
    )
    .action(async () => {
      const flags = run.optsWithGlobals<
        Flags & { cid?: string; car?: string; document: string }
      >();
      if (!!flags.cid === !!flags.car)
        throw new InputError("Choose exactly one of --cid or --car.");
      const source = flags.cid
        ? { cid: rootCid(flags.cid) }
        : {
            car: await boundedRead(
              resolve(flags.car!),
              taskBundleLimits.archiveBytes,
            ),
          };
      const configuration = await readConfiguration(configPath(flags.dataDir));
      const store = await createConfiguredContent({
        ...(flags.ipfsGateway !== undefined
          ? { gateway: flags.ipfsGateway }
          : {}),
        ...(flags.contentDataDir !== undefined
          ? { dataDir: resolve(flags.contentDataDir) }
          : {}),
      });
      let preview: Awaited<ReturnType<typeof startPreview>> | undefined;
      let failure: unknown;
      try {
        preview = await startPreview({
          path: resolve(flags.document),
          store,
          configuration,
          task: source,
          signal: lifetime.signal,
          diagnostic,
        });
        success({
          state: "listening",
          url: preview.url,
          bundleCid: preview.bundleCid,
          runtime: "browser",
        });
        diagnostic(
          "HTTP listening; browser startup is pending. Saving resets app/router state. Ctrl+C closes the host/apps.",
        );
        if (flags.open !== false && configuration.openBrowser !== false) {
          try {
            await openBrowser(preview.url, lifetime.signal);
          } catch {
            if (!lifetime.signal.aborted)
              diagnostic(
                "Warning: could not open a browser. Open data.url from stdout.",
              );
          }
        }
        if (!lifetime.signal.aborted)
          await new Promise<void>((resolve) => {
            lifetime.signal.addEventListener(
              "abort",
              () => {
                resolve();
              },
              { once: true },
            );
          });
      } catch (error) {
        failure = error;
      }
      const failures: unknown[] = [];
      try {
        await preview?.close();
      } catch (error) {
        failures.push(error);
      }
      try {
        await store.close();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length)
        throw new OperationError(
          "Browser host cleanup failed.",
          "CLEANUP_FAILED",
          { cause: new AggregateError(failures) },
        );
      if (failure)
        throw failure instanceof Error
          ? failure
          : new OperationError("Browser host failed.");
    });
  const registry = command
    .command("registry")
    .description(
      "Manage exact schema URI / renderer CID bindings without accessing IPFS.",
    )
    .option("--data-dir <path>", "Choose ipfsaw mapping/state directory")
    .action(() => {
      rejectPreviewFlags();
      registry.outputHelp();
    });
  const rejectPreviewFlags = () => {
    if (
      ["open", "ipfsGateway", "contentDataDir"].some(
        (name) => command.getOptionValueSource(name) === "cli",
      )
    )
      throw new InputError(
        "Registry commands do not accept preview-only options. Run ipfsaw registry --help.",
      );
  };
  const selectedConfig = (child: Command): string => {
    rejectPreviewFlags();
    return configPath(child.optsWithGlobals<{ dataDir?: string }>().dataDir);
  };
  const child = (name: string, description: string) =>
    registry
      .command(name)
      .description(description)
      .option("--data-dir <path>", "Choose ipfsaw mapping/state directory")
      .addHelpText(
        "after",
        `\nExample: ipfsaw registry ${name === "list" ? "list" : name === "add" ? "add urn:example:note:1 <cid>" : "remove urn:example:note:1"}\n`,
      );
  const add = child("add", "Authorize a schema URI / root CID binding.")
    .argument("<schema-uri>")
    .argument("<cid>")
    .option("--replace", "Explicitly replace a different existing CID")
    .action(
      async (
        schema: string,
        cidValue: string,
        flags: { replace?: boolean },
      ) => {
        const path = selectedConfig(add);
        schemaUri(schema);
        const cid = rootCid(cidValue);
        const config = await readConfiguration(path);
        const previous = config.renderers[schema];
        if (previous === cid) {
          success({ schema, cid, changed: false });
          return;
        }
        if (previous && !flags.replace)
          throw new OperationError(
            "Binding exists. Use --replace to authorize a different CID.",
            "REGISTRY_CONFLICT",
          );
        config.renderers[schema] = cid;
        await writeConfiguration(path, config, lifetime.signal);
        success({ schema, cid, changed: true });
      },
    );
  const list = child(
    "list",
    "List bindings from the selected local configuration.",
  ).action(async () => {
    const config = await readConfiguration(selectedConfig(list));
    const renderers = Object.entries(config.renderers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([schema, cid]) => ({ schema, cid }));
    success({ version: 1, renderers });
  });
  const remove = child(
    "remove",
    "Remove one binding without deleting shared content.",
  )
    .argument("<schema-uri>")
    .action(async (schema: string) => {
      const path = selectedConfig(remove);
      schemaUri(schema);
      const config = await readConfiguration(path);
      if (!Object.hasOwn(config.renderers, schema)) {
        success({ schema, removed: false });
        return;
      }
      delete config.renderers[schema];
      await writeConfiguration(path, config, lifetime.signal);
      success({ schema, removed: true });
    });
  try {
    await command.parseAsync([...argv], { from: "user" });
  } catch (error) {
    if (!(error instanceof CommanderError && error.exitCode === 0)) {
      code = 1;
      const errorCode =
        error instanceof CommanderError || error instanceof InputError
          ? "ARGUMENT_INVALID"
          : error instanceof ConfigurationError
            ? "CONFIGURATION_INVALID"
            : error instanceof DocumentError
              ? "DOCUMENT_INVALID"
              : error instanceof OperationError
                ? error.code
                : "OPERATION_FAILED";
      const message =
        error instanceof CommanderError
          ? "Invalid command usage. Run ipfsaw --help (or ipfsaw registry <command> --help)."
          : error instanceof InputError ||
              error instanceof DocumentError ||
              error instanceof ConfigurationError ||
              error instanceof OperationError
            ? error.message
            : "Operation failed. Check the document, configuration and approved renderer content.";
      if (!result.emitted)
        output({ ok: false, error: { code: errorCode, message } });
      diagnostic(message);
    }
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
  return signalCode || code;
}
