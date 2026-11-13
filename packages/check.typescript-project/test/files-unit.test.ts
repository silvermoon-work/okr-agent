import { lstat, open, readdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dataYaml, Files, Unconfirmed } from "../src/files.js";

vi.mock("node:fs/promises", () => ({
  lstat: vi.fn(),
  open: vi.fn(),
  readdir: vi.fn(),
  realpath: vi.fn(),
}));
const root = resolve(".");
beforeEach(() => {
  vi.mocked(lstat).mockResolvedValue({
    isSymbolicLink: () => false,
  } as Awaited<ReturnType<typeof lstat>>);
  vi.mocked(realpath).mockImplementation((path) =>
    Promise.resolve(String(path)),
  );
});
afterEach(() => vi.resetAllMocks());
function files() {
  return new Files(root, new AbortController().signal);
}
function handle(
  content = "{}",
  changes: {
    size?: number;
    mtimeMs?: number;
    regular?: boolean;
    extra?: boolean;
  } = {},
) {
  const stat = vi
    .fn()
    .mockResolvedValueOnce({
      size: content.length,
      mtimeMs: 1,
      isFile: () => changes.regular !== false,
    })
    .mockResolvedValue({
      size: changes.size ?? content.length,
      mtimeMs: changes.mtimeMs ?? 1,
    });
  const close = vi.fn().mockResolvedValue(undefined);
  const read = vi.fn().mockImplementation((buffer: Buffer, offset: number) => {
    if (offset) return Promise.resolve({ bytesRead: 0 });
    buffer.write(content);
    return Promise.resolve({
      bytesRead: content.length + (changes.extra ? 1 : 0),
    });
  });
  const file = { stat, close, read };
  vi.mocked(open).mockResolvedValue(
    file as unknown as Awaited<ReturnType<typeof open>>,
  );
  return file;
}
it("refuses relative roots, escaping paths and redirected filesystem components", async () => {
  expect(() => new Files("relative", new AbortController().signal)).toThrow(
    "absolute",
  );
  expect(() => files().path("", "..")).toThrow("escapes");
  vi.mocked(lstat).mockResolvedValueOnce({
    isSymbolicLink: () => true,
  } as Awaited<ReturnType<typeof lstat>>);
  await expect(files().guard("a")).rejects.toThrow("symbolic link");
  vi.mocked(realpath).mockResolvedValueOnce(resolve(root, "redirected"));
  await expect(files().guard("a")).rejects.toThrow("noncanonical");
});
it.each([
  [{ regular: false }, "regular file"],
  [{ extra: true }, "changed during read"],
  [{ size: 3 }, "changed during read"],
  [{ mtimeMs: 2 }, "changed during read"],
])(
  "closes handles when configuration validation fails",
  async (changes, reason) => {
    const file = handle("{}", changes);
    await expect(files().text("a.json")).rejects.toThrow(reason);
    expect(file.close).toHaveBeenCalledOnce();
  },
);
it("caches confirmed reads and preserves JSON and filesystem errors", async () => {
  const file = handle();
  const subject = files();
  await expect(subject.json("a.json")).resolves.toEqual({});
  await expect(subject.text("a.json")).resolves.toBe("{}");
  expect(file.close).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
  handle("{");
  await expect(files().json("bad.json")).rejects.toThrow("invalid JSON");
  handle("[]");
  await expect(files().json("array.json")).rejects.toThrow("static object");
  vi.mocked(lstat).mockRejectedValueOnce(
    Object.assign(new Error("missing"), { code: "ENOENT" }),
  );
  await expect(files().optionalText("missing")).resolves.toBeUndefined();
  vi.mocked(lstat).mockRejectedValueOnce(new Error("permission denied"));
  await expect(files().optionalText("denied")).rejects.toThrow(
    "permission denied",
  );
});
function entry(name: string, kind: string) {
  return {
    name,
    isSymbolicLink: () => kind === "link",
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
  };
}
it("enumerates sorted files and nested entries, recording links without following them", async () => {
  vi.mocked(readdir)
    .mockResolvedValueOnce([
      entry("z", "file"),
      entry("link", "link"),
      entry("dir", "directory"),
      entry("node_modules", "directory"),
    ] as unknown as Awaited<ReturnType<typeof readdir>>)
    .mockResolvedValueOnce([entry("a", "file")] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
  const subject = files();
  await subject.scan();
  expect(subject.paths).toEqual(["dir/a", "z"]);
  expect(subject.links).toEqual(["link"]);
  expect(readdir).toHaveBeenCalledTimes(2);
});
it("rejects unsupported entries and excessive enumeration", async () => {
  vi.mocked(readdir).mockResolvedValueOnce([
    entry("socket", "socket"),
  ] as unknown as Awaited<ReturnType<typeof readdir>>);
  await expect(files().scan()).rejects.toThrow("unsupported filesystem entry");
  vi.mocked(readdir).mockResolvedValueOnce(
    Array.from({ length: 16_385 }, () =>
      entry("same", "file"),
    ) as unknown as Awaited<ReturnType<typeof readdir>>,
  );
  await expect(files().scan()).rejects.toThrow("16384");
});
it("rejects YAML warnings and duplicate keys", () => {
  expect(() => dataYaml("x: 1\nx: 2")).toThrow(Unconfirmed);
  expect(() => dataYaml("x: !unknown value")).toThrow(Unconfirmed);
});
