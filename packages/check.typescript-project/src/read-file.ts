import { lstat, open, realpath } from "node:fs/promises";

export async function guardPath(path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const info = await lstat(path);
  if (info.isSymbolicLink() || (await realpath(path)) !== path)
    throw new Error(`Cannot inspect a linked or redirected path: ${path}`);
  return info;
}

export async function readProjectFile(
  path: string,
  signal: AbortSignal,
  budget = { bytes: 0 },
): Promise<string> {
  await guardPath(path, signal);
  const file = await open(path, "r");
  const failures: unknown[] = [];
  let text = "";
  try {
    const before = await file.stat();
    if (!before.isFile()) throw new Error(`Not a regular file: ${path}`);
    if (before.size > 1_048_576 || budget.bytes + before.size > 16_777_216)
      throw new Error(
        "Project file read budget exceeded (1MiB/file, 16MiB total).",
      );
    budget.bytes += before.size;
    const buffer = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      signal.throwIfAborted();
      const result = await file.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    const after = await file.stat();
    if (
      offset !== before.size ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    )
      throw new Error(`Project file changed during read: ${path}`);
    await guardPath(path, signal);
    signal.throwIfAborted();
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, offset),
    );
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await file.close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      `Project file read and cleanup failed: ${path}`,
    );
  return text;
}
