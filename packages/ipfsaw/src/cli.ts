import { spawn } from "node:child_process";
import { extname, resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { createConfiguredContent } from "@silvermoon-work/ipfs-store/node";
import {
  ConfigurationError,
  aliasName,
  configPath,
  readConfiguration,
  viewerLocation,
  writeConfiguration,
} from "./configuration.js";
import { boundedRead, DocumentError, InputError } from "./document.js";
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
  const onNoClients = () => {
    diagnostic("All preview pages disconnected. Closing the local host.");
    lifetime.abort();
  };
  const command = new Command()
    .name("ipfsaw")
    .description(
      "View a local document using an explicit immutable Viewer or a registered alias.",
    )
    .option(
      "--data-dir <path>",
      "ipfsaw alias/state directory (not the IPFS content directory)",
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
    .version("0.1.0-rc.2")
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
      "\nExamples:\n  ipfsaw view .\\check.car .\\check.yaml --no-open\n  ipfsaw view events .\\events.jsonl\n  ipfsaw alias add events <viewerCID>\n  ipfsaw alias list --data-dir .\\preview-state\n\nViewers are selected explicitly, never from a document's $schema.\nBusiness output is one JSON envelope; logs use stderr.\nApp directory: --data-dir > IPFSAW_DATA_DIR > ~/.silvermoon.work/ipfsaw.\nAliases are a startup snapshot. IPFS configuration is shared with Task.\n",
    )
    .action(() => {
      command.outputHelp();
    });
  const view = command
    .command("view")
    .configureHelp({ showGlobalOptions: true })
    .description(
      "View a JSON/YAML/JSONL file using a Viewer CID, CAR path or alias.",
    )
    .argument("<viewer>", "Viewer root CID, CAR path or registered alias")
    .argument("<document>", "Local JSON, YAML or JSONL file to watch")
    .addHelpText(
      "after",
      "\nCID selectors are immutable. CAR paths contain a path separator or end in .car.\nOther selectors are exact, case-sensitive aliases. No $schema lookup occurs.\nJSONL is passed as {records:[...]} in file order; invalid lines are not skipped.\nHTTP listening does not mean the browser Viewer completed startup.\nExamples:\n  ipfsaw view <viewerCID> .\\document.yaml\n  ipfsaw view .\\check.car .\\check.json --no-open\n",
    )
    .action(async (selector: string, document: string) => {
      const flags = view.optsWithGlobals<Flags>();
      if (
        ![".yaml", ".yml", ".json", ".jsonl"].includes(
          extname(document).toLowerCase(),
        )
      )
        throw new InputError(
          "Pass a .yaml/.yml/.json/.jsonl file; stdin is not supported.",
        );
      const configuration = await readConfiguration(configPath(flags.dataDir));
      const direct = viewerLocation(selector);
      const name = direct ? undefined : aliasName(selector);
      const location =
        direct ??
        (name && Object.hasOwn(configuration.aliases, name)
          ? configuration.aliases[name]
          : undefined);
      if (!location)
        throw new OperationError(
          "Viewer alias is not registered. Use ipfsaw alias add <alias> <viewer>.",
          "ALIAS_NOT_FOUND",
        );
      const source =
        "cid" in location
          ? location
          : {
              car: await boundedRead(
                location.car,
                taskBundleLimits.archiveBytes,
              ),
            };
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
          store,
          viewer: source,
          signal: lifetime.signal,
          diagnostic,
          onNoClients,
        });
        success({
          state: "listening",
          url: preview.url,
          viewerCid: preview.bundleCid ?? preview.rendererCid,
        });
        diagnostic(
          "HTTP listening; Viewer startup is pending. Ctrl+C closes the local preview.",
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
        throw new OperationError("Preview cleanup failed.", "CLEANUP_FAILED", {
          cause: new AggregateError(failures),
        });
      if (failure)
        throw failure instanceof Error
          ? failure
          : new OperationError("Viewer host failed.");
    });
  const aliases = command
    .command("alias")
    .description(
      "Manage exact Viewer aliases without fetching or executing their content.",
    )
    .option("--data-dir <path>", "Choose ipfsaw alias/state directory")
    .action(() => {
      rejectPreviewFlags();
      aliases.outputHelp();
    });
  const rejectPreviewFlags = () => {
    if (
      ["open", "ipfsGateway", "contentDataDir"].some(
        (name) => command.getOptionValueSource(name) === "cli",
      )
    )
      throw new InputError(
        "Alias commands do not accept preview-only options. Run ipfsaw alias --help.",
      );
  };
  const selectedConfig = (child: Command): string => {
    rejectPreviewFlags();
    return configPath(child.optsWithGlobals<{ dataDir?: string }>().dataDir);
  };
  const child = (name: string, description: string) =>
    aliases
      .command(name)
      .description(description)
      .option("--data-dir <path>", "Choose ipfsaw alias/state directory")
      .addHelpText(
        "after",
        `\nExample: ipfsaw alias ${name === "list" ? "list" : name === "add" ? "add events <viewerCID>" : "remove events"}\n`,
      );
  const add = child("add", "Register a Viewer CID or CAR path under an alias.")
    .argument("<alias>")
    .argument("<viewer>")
    .option("--replace", "Explicitly replace a different existing Viewer")
    .action(
      async (name: string, selector: string, flags: { replace?: boolean }) => {
        const path = selectedConfig(add);
        aliasName(name);
        const location = viewerLocation(selector);
        if (!location)
          throw new InputError(
            "Register a Viewer CID or CAR path, not another alias.",
          );
        const config = await readConfiguration(path);
        const previous = Object.hasOwn(config.aliases, name)
          ? config.aliases[name]
          : undefined;
        if (JSON.stringify(previous) === JSON.stringify(location)) {
          success({ alias: name, ...location, changed: false });
          return;
        }
        if (previous && !flags.replace)
          throw new OperationError(
            "Alias exists. Use --replace to authorize a different Viewer.",
            "ALIAS_CONFLICT",
          );
        config.aliases[name] = location;
        await writeConfiguration(path, config, lifetime.signal);
        success({ alias: name, ...location, changed: true });
      },
    );
  const list = child(
    "list",
    "List bindings from the selected local configuration.",
  ).action(async () => {
    const config = await readConfiguration(selectedConfig(list));
    const entries = Object.entries(config.aliases)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([alias, location]) => ({ alias, ...location }));
    success({ version: 1, aliases: entries });
  });
  const remove = child(
    "remove",
    "Remove one alias without deleting Viewer content.",
  )
    .argument("<alias>")
    .action(async (name: string) => {
      const path = selectedConfig(remove);
      aliasName(name);
      const config = await readConfiguration(path);
      if (!Object.hasOwn(config.aliases, name)) {
        success({ alias: name, removed: false });
        return;
      }
      delete config.aliases[name];
      await writeConfiguration(path, config, lifetime.signal);
      success({ alias: name, removed: true });
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
          ? "Invalid command usage. Run ipfsaw --help (or ipfsaw alias <command> --help)."
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
