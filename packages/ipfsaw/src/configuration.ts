import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, parse, resolve } from "node:path";
import { CID } from "multiformats/cid";
import { boundedRead, InputError, record } from "./document.js";

export type ViewerLocation = { cid: string } | { car: string };

export interface Configuration {
  version: 1;
  aliases: Record<string, ViewerLocation>;
  openBrowser?: boolean;
}
export class ConfigurationError extends Error {}

export function dataDirectory(path?: string): string {
  const selected =
    path ??
    process.env.IPFSAW_DATA_DIR ??
    join(homedir(), ".silvermoon.work", "ipfsaw");
  if (!selected.trim() || selected.includes("\0"))
    throw new InputError(
      "ipfsaw data directory must be a nonempty filesystem path.",
    );
  const directory = resolve(selected);
  if (
    process.platform === "win32" &&
    /[<>:"|?*]/u.test(directory.slice(parse(directory).root.length))
  )
    throw new InputError(
      "ipfsaw data directory contains invalid path characters.",
    );
  return directory;
}
export function configPath(directory?: string): string {
  return join(dataDirectory(directory), "config.json");
}

export function rootCid(value: string): string {
  try {
    const cid = CID.parse(value);
    if (![0x70, 0x55].includes(cid.code)) throw new Error();
    return cid.toV1().toString();
  } catch {
    throw new InputError("Expected a UnixFS root CID without a path or URL.");
  }
}

export function viewerLocation(
  value: string,
  directory = process.cwd(),
): ViewerLocation | undefined {
  if (!value || value.trim() !== value || value.includes("\0"))
    throw new InputError("Viewer must be a nonempty CID, CAR path or alias.");
  let cid: CID | undefined;
  try {
    cid = CID.parse(value);
  } catch {
    // A non-CID selector may still be a CAR path or an alias.
  }
  if (cid) return { cid: rootCid(value) };
  if (/[\\/]/u.test(value) || extname(value).toLowerCase() === ".car")
    return { car: resolve(directory, value) };
  return undefined;
}

export function aliasName(value: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/u.test(value) || viewerLocation(value))
    throw new InputError(
      "Alias must start with a letter, contain at most 64 letters, digits, underscores or hyphens, and must not be a CID.",
    );
  return value;
}

export async function readConfiguration(path: string): Promise<Configuration> {
  let bytes: Uint8Array;
  try {
    bytes = await boundedRead(path, limitsConfig);
  } catch (error) {
    if (record(error) && error.code === "ENOENT")
      return { version: 1, aliases: {} };
    throw new ConfigurationError("Cannot read ipfsaw configuration.", {
      cause: error,
    });
  }
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (
      !record(value) ||
      value.version !== 1 ||
      !record(value.aliases) ||
      Object.keys(value).some(
        (key) => !["version", "aliases", "openBrowser"].includes(key),
      ) ||
      (Object.hasOwn(value, "openBrowser") &&
        typeof value.openBrowser !== "boolean")
    )
      throw new Error();
    const aliases: Record<string, ViewerLocation> = {};
    for (const [name, location] of Object.entries(value.aliases)) {
      aliasName(name);
      if (!record(location) || Object.keys(location).length !== 1)
        throw new Error();
      if (typeof location.cid === "string")
        aliases[name] = { cid: rootCid(location.cid) };
      else if (typeof location.car === "string") {
        const selected = viewerLocation(location.car, dirname(path));
        if (!selected || !("car" in selected)) throw new Error();
        aliases[name] = selected;
      } else throw new Error();
    }
    return {
      version: 1,
      aliases,
      ...(typeof value.openBrowser === "boolean"
        ? { openBrowser: value.openBrowser }
        : {}),
    };
  } catch (error) {
    throw new ConfigurationError(
      "Invalid ipfsaw configuration; expected version 1, aliases and optional openBrowser. Schema-based renderers are no longer supported. Original file was not changed.",
      { cause: error },
    );
  }
}

const limitsConfig = 1024 * 1024;

export async function writeConfiguration(
  path: string,
  config: Configuration,
  signal?: AbortSignal,
): Promise<void> {
  const bytes = JSON.stringify(config, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > limitsConfig)
    throw new Error("Configuration exceeds 1 MiB.");
  const temporary = join(dirname(path), `.ipfsaw-${randomUUID()}.json`);
  await mkdir(dirname(path), { recursive: true });
  try {
    signal?.throwIfAborted();
    await writeFile(temporary, bytes, {
      flag: "wx",
      mode: 0o600,
      ...(signal ? { signal } : {}),
    });
    signal?.throwIfAborted();
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
