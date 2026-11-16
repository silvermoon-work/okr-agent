import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { CID } from "multiformats/cid";
import { boundedRead, InputError, record, schemaUri } from "./document.js";

export interface Configuration {
  version: 1;
  renderers: Record<string, string>;
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

export async function readConfiguration(path: string): Promise<Configuration> {
  let bytes: Uint8Array;
  try {
    bytes = await boundedRead(path, limitsConfig);
  } catch (error) {
    if (record(error) && error.code === "ENOENT")
      return { version: 1, renderers: {} };
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
      !record(value.renderers) ||
      Object.keys(value).some(
        (key) => !["version", "renderers", "openBrowser"].includes(key),
      ) ||
      (Object.hasOwn(value, "openBrowser") &&
        typeof value.openBrowser !== "boolean")
    )
      throw new Error();
    const renderers: Record<string, string> = Object.create(null) as Record<
      string,
      string
    >;
    for (const [schema, cid] of Object.entries(value.renderers)) {
      schemaUri(schema);
      if (typeof cid !== "string") throw new Error();
      renderers[schema] = rootCid(cid);
    }
    return {
      version: 1,
      renderers,
      ...(typeof value.openBrowser === "boolean"
        ? { openBrowser: value.openBrowser }
        : {}),
    };
  } catch (error) {
    throw new ConfigurationError(
      "Invalid ipfsaw configuration; expected version 1, renderers and optional openBrowser. Original file was not changed.",
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
