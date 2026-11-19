import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main, openBrowser } from "../src/cli.js";
import { fixtureDirectory, rendererFixture } from "./helpers.js";
import { configPath, readConfiguration } from "../src/configuration.js";
import type { PreviewOptions } from "../src/preview.js";

const mocks = vi.hoisted(() => ({
  content: vi.fn(),
  preview: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("@silvermoon-work/ipfs-store/node", () => ({
  createConfiguredContent: mocks.content,
}));
vi.mock("../src/preview.js", () => ({ startPreview: mocks.preview }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
interface Envelope {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}
function streams() {
  let out = "",
    err = "";
  vi.spyOn(process.stdout, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      out += String(chunk);
      return true;
    },
  );
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      err += String(chunk);
      return true;
    },
  );
  return {
    get out() {
      return out;
    },
    get err() {
      return err;
    },
    result: () => JSON.parse(out) as Envelope,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("public main(argv) interface", () => {
  it.each(["legacy", "task"] as const)(
    "exits %s preview successfully after the last page leaves and awaits owned cleanup",
    async (kind) => {
      const fixture = await fixtureDirectory();
      const renderer = await rendererFixture();
      const order: string[] = [];
      let disconnect!: () => void;
      let finish!: () => void;
      const cleanup = new Promise<void>((resolve) => {
        finish = resolve;
      });
      mocks.content.mockResolvedValue({
        close: () => {
          order.push("store");
          return Promise.resolve();
        },
      });
      mocks.preview.mockImplementation((options: PreviewOptions) => {
        disconnect = options.onNoClients!;
        return Promise.resolve({
          url: "http://127.0.0.1:1234/",
          close: async () => {
            await cleanup;
            order.push("preview");
          },
        });
      });
      const output = streams();
      let running: Promise<number> | undefined;
      try {
        let completed = false;
        running = main([
          ...(kind === "task"
            ? ["run", "--cid", renderer.cid, "--document", "doc.json"]
            : ["doc.json"]),
          "--data-dir",
          fixture.directory,
          "--no-open",
        ]).then((code) => {
          completed = true;
          return code;
        });
        await vi.waitFor(() => {
          expect(output.result().data?.state).toBe("listening");
        });
        disconnect();
        await Promise.resolve();
        expect(completed).toBe(false);
        finish();
        expect(await running).toBe(0);
        expect(order).toEqual(["preview", "store"]);
        expect(output.err).toContain("All preview pages disconnected");
        expect(output.out.trim().split("\n")).toHaveLength(1);
      } finally {
        finish();
        await running;
        await renderer.store.close();
        await fixture.cleanup();
      }
    },
  );

  it("has no import side effects and prints help/version to stdout with no network", async () => {
    for (const args of [
      [],
      ["--help"],
      ["-h"],
      ["registry"],
      ["registry", "--help"],
      ["registry", "add", "-h"],
      ["registry", "list", "--help"],
      ["registry", "remove", "--help"],
      ["run", "--help"],
      ["--version"],
    ]) {
      const output = streams();
      expect(await main(args)).toBe(0);
      expect(output.out).toMatch(/ipfsaw|0\.1\.0-rc\.2/);
      expect(output.err).toBe("");
      vi.restoreAllMocks();
    }
    expect(mocks.content).not.toHaveBeenCalled();
  });
  it.each([
    ["--unknown"],
    ["registry", "wat"],
    ["registry", "add"],
    ["registry", "remove"],
    ["registry", "list", "--replace"],
    ["registry", "add", "bad", "bad"],
    ["registry", "remove", "bad"],
    ["registry", "add", "urn:x:1", "bad"],
    ["-"],
    ["a.json", "b.json"],
    ["registry", "list", "--json"],
    ["renderer", "list"],
    ["--config", "config.json"],
    ["--content-gateway", "http://local.invalid"],
    ["registry", "list", "--data-dir", ""],
    ["registry", "list", "--ipfs-gateway", "http://local.invalid"],
    ["registry", "--content-data-dir", "ignored"],
    ["--no-open", "registry", "remove", "urn:x:1"],
  ])(
    "returns one safe ARGUMENT_INVALID JSON envelope and failure 1 for %j",
    async (...args) => {
      const output = streams();
      expect(await main(args)).toBe(1);
      expect(output.result().error?.code).toBe("ARGUMENT_INVALID");
      expect(output.out.trim().split("\n")).toHaveLength(1);
      expect(output.err.length).toBeGreaterThan(0);
      expect(mocks.content).not.toHaveBeenCalled();
    },
  );
  it("supports argv default and cleans signal handlers for every invocation", async () => {
    streams();
    const args = process.argv;
    const before = [
      process.listenerCount("SIGINT"),
      process.listenerCount("SIGTERM"),
    ];
    process.argv = [args[0]!, args[1]!, "--version"];
    try {
      expect(await main()).toBe(0);
    } finally {
      process.argv = args;
    }
    expect([
      process.listenerCount("SIGINT"),
      process.listenerCount("SIGTERM"),
    ]).toEqual(before);
  });
  it.each([
    ["run", "--document", "doc.json"],
    ["run", "--cid", "bad", "--document", "doc.json"],
    ["run", "--car", "a.car", "--cid", "bad", "--document", "doc.json"],
    ["run", "--cid", "bad"],
    ["run", "--document", "a.json", "--document", "b.json", "--cid", "bad"],
    ["run", "--cid", "one", "--cid", "two", "--document", "doc.json"],
    ["run", "--car", "one", "--car", "two", "--document", "doc.json"],
    ["run", "--car", "", "--document", "doc.json"],
  ])(
    "rejects invalid new Task source selection before opening content: %j",
    async (...args) => {
      const output = streams();
      expect(await main(args)).toBe(1);
      expect(output.result().error?.code).toBe("ARGUMENT_INVALID");
      expect(output.out.trim().split("\n")).toHaveLength(1);
      expect(mocks.content).not.toHaveBeenCalled();
    },
  );
  it.each(["cid", "car"] as const)(
    "runs the explicit %s path without registry bindings and emits HTTP listening only",
    async (source) => {
      const fixture = await fixtureDirectory();
      const renderer = await rendererFixture();
      const output = streams();
      const close = vi.fn().mockResolvedValue(undefined);
      const storeClose = vi.fn().mockResolvedValue(undefined);
      mocks.content.mockResolvedValue({ close: storeClose });
      mocks.preview.mockResolvedValue({
        url: "http://127.0.0.1:1234/",
        bundleCid: renderer.cid,
        close,
      });
      const car = join(fixture.directory, "task.car");
      await writeFile(car, new Uint8Array([1, 2, 3]));
      let running: Promise<number> | undefined;
      try {
        running = main([
          "run",
          source === "cid" ? "--cid" : "--car",
          source === "cid" ? renderer.cid : car,
          "--document",
          join(fixture.directory, "raw.yaml"),
          "--data-dir",
          fixture.directory,
          "--content-data-dir",
          join(fixture.directory, "content"),
          "--ipfs-gateway",
          "http://127.0.0.1:1",
          "--no-open",
        ]);
        await vi.waitFor(() => {
          expect(output.result().data?.state).toBe("listening");
        });
        expect(output.result().data).toEqual({
          state: "listening",
          url: "http://127.0.0.1:1234/",
          bundleCid: renderer.cid,
          runtime: "browser",
        });
        expect(output.err).toContain("startup is pending");
        expect(output.err).not.toContain("PRIVATE");
        expect(mocks.content).toHaveBeenCalledWith({
          dataDir: join(fixture.directory, "content"),
          gateway: "http://127.0.0.1:1",
        });
        expect(mocks.preview).toHaveBeenCalledWith(
          expect.objectContaining({
            task:
              source === "cid"
                ? { cid: renderer.cid }
                : { car: Buffer.from([1, 2, 3]) },
            configuration: { version: 1, renderers: {} },
          }),
        );
        process.emit("SIGINT");
        expect(await running).toBe(130);
        expect(close).toHaveBeenCalledOnce();
        expect(storeClose).toHaveBeenCalledOnce();
      } finally {
        process.emit("SIGTERM");
        await running;
        await renderer.store.close();
        await fixture.cleanup();
      }
    },
  );
  it.each(["startup", "opener", "cleanup"] as const)(
    "reports %s failures on the Task path without leaking details or emitting twice",
    async (scenario) => {
      const fixture = await fixtureDirectory();
      const renderer = await rendererFixture();
      const output = streams();
      const storeClose = vi.fn().mockResolvedValue(undefined);
      const close = vi
        .fn()
        .mockImplementation(() =>
          scenario === "cleanup"
            ? Promise.reject(new Error("secret close"))
            : Promise.resolve(),
        );
      mocks.content.mockResolvedValue({ close: storeClose });
      if (scenario === "startup")
        mocks.preview.mockRejectedValue(new Error("secret source"));
      else
        mocks.preview.mockResolvedValue({
          url: "http://127.0.0.1:1234/",
          bundleCid: renderer.cid,
          close,
        });
      mocks.spawn.mockImplementation(() => {
        const child = new EventEmitter();
        queueMicrotask(() => {
          child.emit("close", 1, null);
        });
        return child;
      });
      let running: Promise<number> | undefined;
      try {
        running = main([
          "run",
          "--cid",
          renderer.cid,
          "--document",
          "raw.json",
          "--data-dir",
          fixture.directory,
        ]);
        if (scenario === "startup") {
          expect(await running).toBe(1);
          expect(output.result().ok).toBe(false);
        } else {
          await vi.waitFor(() => {
            expect(output.err).toContain("Warning:");
          });
          process.emit("SIGTERM");
          expect(await running).toBe(143);
          expect(output.result().ok).toBe(true);
          if (scenario === "cleanup")
            expect(output.err).toContain("cleanup failed");
        }
        expect(output.out.trim().split("\n")).toHaveLength(1);
        expect(output.err).not.toContain("secret");
        expect(output.err).not.toContain("SECRET");
        expect(storeClose).toHaveBeenCalledOnce();
      } finally {
        process.emit("SIGTERM");
        await running;
        await renderer.store.close();
        await fixture.cleanup();
      }
    },
  );
  it("manages sorted exact bindings atomically without creating a Store", async () => {
    const fixture = await fixtureDirectory();
    const one = await rendererFixture();
    const two = await rendererFixture("different code never executed");
    const path = configPath(fixture.directory);
    const invoke = async (args: string[]) => {
      const output = streams();
      const code = await main([
        "--data-dir",
        fixture.directory,
        "registry",
        ...args,
      ]);
      vi.restoreAllMocks();
      return {
        code,
        out: output.out,
        err: output.err,
        result: output.result(),
      };
    };
    try {
      expect((await invoke(["list"])).result).toEqual({
        ok: true,
        data: { version: 1, renderers: [] },
      });
      expect((await invoke(["add", "urn:z:1", one.cid])).result.data).toEqual({
        schema: "urn:z:1",
        cid: one.cid,
        changed: true,
      });
      expect(
        (await invoke(["add", "urn:z:1", one.cid])).result.data?.changed,
      ).toBe(false);
      const before = await readFile(path, "utf8");
      expect(
        (await invoke(["add", "urn:z:1", two.cid])).result.error?.code,
      ).toBe("REGISTRY_CONFLICT");
      expect(await readFile(path, "utf8")).toBe(before);
      expect(
        (await invoke(["add", "urn:z:1", two.cid, "--replace"])).result.data
          ?.changed,
      ).toBe(true);
      expect((await invoke(["add", "urn:a:1", one.cid])).code).toBe(0);
      expect((await invoke(["list"])).result.data).toEqual({
        version: 1,
        renderers: [
          { schema: "urn:a:1", cid: one.cid },
          { schema: "urn:z:1", cid: two.cid },
        ],
      });
      expect((await invoke(["remove", "urn:z:1"])).result.data).toEqual({
        schema: "urn:z:1",
        removed: true,
      });
      expect((await invoke(["remove", "urn:z:1"])).result.data?.removed).toBe(
        false,
      );
      await writeFile(path, "{bad-secret-content");
      expect((await invoke(["list"])).result.error?.code).toBe(
        "CONFIGURATION_INVALID",
      );
      expect((await invoke(["list"])).out).not.toContain("bad-secret");
      expect(mocks.content).not.toHaveBeenCalled();
    } finally {
      await one.store.close();
      await two.store.close();
      await fixture.cleanup();
    }
  });
  it("honors app data directory at root/group/leaf, env precedence and browser preferences", async () => {
    const fixture = await fixtureDirectory();
    const renderer = await rendererFixture();
    try {
      const path = configPath(fixture.directory);
      await writeFile(path, '{"version":1,"openBrowser":false,"renderers":{}}');
      vi.stubEnv("IPFSAW_DATA_DIR", join(fixture.directory, "must-not-use"));
      streams();
      expect(
        await main([
          "registry",
          "add",
          "urn:x:1",
          renderer.cid,
          "--data-dir",
          fixture.directory,
        ]),
      ).toBe(0);
      expect((await readConfiguration(path)).openBrowser).toBe(false);
      expect(
        await main([
          "registry",
          "--data-dir",
          fixture.directory,
          "remove",
          "urn:x:1",
        ]),
      ).toBe(0);
      expect((await readConfiguration(path)).renderers).toEqual({});
    } finally {
      await renderer.store.close();
      await fixture.cleanup();
    }
  });
  it.each(["SIGINT", "SIGTERM"] as const)(
    "waits for preview cleanup and owned Store on %s and separates app/content directories",
    async (signal) => {
      const fixture = await fixtureDirectory();
      await writeFile(
        configPath(fixture.directory),
        '{"version":1,"openBrowser":false,"renderers":{}}',
      );
      let finish!: () => void;
      const closed = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const order: string[] = [];
      const closePreview = vi.fn(async () => {
        await closed;
        order.push("preview");
      });
      const closeStore = vi.fn(() => {
        order.push("store");
        return Promise.resolve();
      });
      mocks.content.mockResolvedValue({ close: closeStore });
      mocks.preview.mockResolvedValue({
        url: "http://127.0.0.1:1234/",
        schema: "urn:fixture:1",
        rendererCid: "fixture-cid",
        close: closePreview,
      });
      const output = streams();
      try {
        let completed = false;
        const contentDirectory = join(fixture.directory, "content");
        const running = main([
          "doc.json",
          "--data-dir",
          fixture.directory,
          "--ipfs-gateway",
          "http://local.invalid",
          "--content-data-dir",
          contentDirectory,
        ]).then((code) => {
          completed = true;
          return code;
        });
        await vi.waitFor(() => {
          expect(output.result().data?.state).toBe("listening");
        });
        expect(output.result().data).toEqual({
          state: "listening",
          url: "http://127.0.0.1:1234/",
          schema: "urn:fixture:1",
          rendererCid: "fixture-cid",
        });
        process.emit(signal);
        await vi.waitFor(() => {
          expect(closePreview).toHaveBeenCalled();
        });
        expect(completed).toBe(false);
        finish();
        expect(await running).toBe(signal === "SIGINT" ? 130 : 143);
        expect(order).toEqual(["preview", "store"]);
        expect(mocks.content).toHaveBeenCalledWith({
          gateway: "http://local.invalid",
          dataDir: contentDirectory,
        });
        expect(output.err).not.toContain("SECRET");
        expect(output.out.trim().split("\n")).toHaveLength(1);
        expect(mocks.spawn).not.toHaveBeenCalled();
      } finally {
        finish();
        await fixture.cleanup();
      }
    },
  );
  it("never passes app --data-dir as a Store override and reports startup/cleanup failure safely", async () => {
    const fixture = await fixtureDirectory();
    const close = vi
      .fn()
      .mockRejectedValue(new Error("SECRET cleanup details"));
    mocks.content.mockResolvedValue({ close });
    mocks.preview.mockRejectedValue(new Error("SECRET renderer source"));
    const output = streams();
    try {
      expect(
        await main(["doc.json", "--data-dir", fixture.directory, "--no-open"]),
      ).toBe(1);
      expect(close).toHaveBeenCalledOnce();
      expect(output.result().error?.code).toBe("CLEANUP_FAILED");
      expect(mocks.content).toHaveBeenCalledWith({});
      expect(output.err).not.toContain("SECRET");
      expect(output.out).not.toContain("SECRET");
    } finally {
      await fixture.cleanup();
    }
  });
  it("reports failed Store setup without raw details", async () => {
    const fixture = await fixtureDirectory();
    mocks.content.mockRejectedValue(new Error("SECRET shared configuration"));
    const output = streams();
    try {
      expect(await main(["doc.json", "--data-dir", fixture.directory])).toBe(1);
      expect(output.result().error?.code).toBe("OPERATION_FAILED");
      expect(output.out + output.err).not.toContain("SECRET");
    } finally {
      await fixture.cleanup();
    }
  });
  it("opens by default, warns on opener failure and still waits for cancellation", async () => {
    const fixture = await fixtureDirectory();
    mocks.content.mockResolvedValue({ close: () => Promise.resolve() });
    mocks.preview.mockResolvedValue({
      url: "http://127.0.0.1:1234/",
      close: () => Promise.resolve(),
    });
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => {
        child.emit("error", new Error("opener failed"));
        child.emit("close", 1, null);
      });
      return child;
    });
    const output = streams();
    try {
      const running = main(["doc.json", "--data-dir", fixture.directory]);
      await vi.waitFor(() => {
        expect(output.err).toContain("Warning:");
      });
      process.emit("SIGINT");
      expect(await running).toBe(130);
      expect(output.err).not.toContain("SECRET");
      expect(output.out.trim().split("\n")).toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });
  it("observes opener completion and nonzero/signal failures", async () => {
    for (const [code, signal] of [
      [0, null],
      [1, null],
      [null, "SIGTERM"],
    ] as const) {
      mocks.spawn.mockImplementation(() => {
        const child = new EventEmitter();
        queueMicrotask(() => {
          child.emit("close", code, signal);
        });
        return child;
      });
      if (code === 0)
        await expect(openBrowser("http://127.0.0.1")).resolves.toBeUndefined();
      else await expect(openBrowser("http://127.0.0.1")).rejects.toThrow();
    }
  });
  it("awaits the owned opener's close after cancellation, rather than returning on its error event", async () => {
    const abort = new AbortController();
    const child = new EventEmitter();
    mocks.spawn.mockReturnValue(child);
    let completed = false;
    const opening = openBrowser("http://127.0.0.1", abort.signal).finally(
      () => {
        completed = true;
      },
    );
    const rejected = expect(opening).rejects.toThrow("Browser opener");
    abort.abort();
    child.emit("error", new Error("Controlled cancellation"));
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ signal: abort.signal }),
    );
    child.emit("close", null, "SIGTERM");
    await rejected;
  });
  it.each(["timeout", "abort"] as const)(
    "escalates an opener ignoring TERM after %s, then awaits close and removes owned resources",
    async (reason) => {
      vi.useFakeTimers();
      const abort = new AbortController();
      const kill = vi.fn<(signal: NodeJS.Signals) => boolean>(() => true);
      const child = Object.assign(new EventEmitter(), { kill });
      mocks.spawn.mockImplementation(
        (
          _command: unknown,
          _args: unknown,
          options: { timeout: number; signal?: AbortSignal },
        ) => {
          // Model Node's native timeout/AbortSignal behavior without a Unix process.
          const timeout = setTimeout(() => kill("SIGTERM"), options.timeout);
          const onAbort = () => {
            kill("SIGTERM");
            child.emit("error", new Error("Controlled cancellation"));
          };
          options.signal?.addEventListener("abort", onAbort, { once: true });
          child.once("close", () => {
            clearTimeout(timeout);
            options.signal?.removeEventListener("abort", onAbort);
          });
          return child;
        },
      );
      let completed = false;
      const opening = openBrowser("http://127.0.0.1", abort.signal).then(
        () => {
          completed = true;
          return "success";
        },
        () => {
          completed = true;
          return "failure";
        },
      );
      try {
        if (reason === "timeout") await vi.advanceTimersByTimeAsync(10000);
        else abort.abort();
        expect(kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
        await vi.advanceTimersByTimeAsync(999);
        expect(kill).toHaveBeenCalledTimes(1);
        expect(completed).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(kill).toHaveBeenLastCalledWith("SIGKILL");
        expect(completed).toBe(false);
        child.emit("close", null, "SIGKILL");
        expect(await opening).toBe("failure");
        expect(child.listenerCount("error")).toBe(0);
        expect(child.listenerCount("close")).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        child.emit("close", null, "SIGKILL");
        await opening;
        vi.useRealTimers();
      }
    },
  );
  it("escalates an already-aborted opener and retains its error handler until close", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    abort.abort();
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    const opening = openBrowser("http://127.0.0.1", abort.signal).then(
      () => "success",
      () => "failure",
    );
    try {
      child.emit("error", new Error("Controlled cancellation"));
      await vi.advanceTimersByTimeAsync(1000);
      expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
      child.emit("error", new Error("Controlled kill failure"));
      child.emit("close", null, "SIGKILL");
      expect(await opening).toBe("failure");
      expect(child.listenerCount("error")).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      child.emit("close", null, "SIGKILL");
      await opening;
      vi.useRealTimers();
    }
  });
  it("cancels escalation and abort listeners when the opener closes normally or during its grace period", async () => {
    vi.useFakeTimers();
    try {
      for (const cancelled of [false, true]) {
        const abort = new AbortController();
        const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
        mocks.spawn.mockReturnValue(child);
        const opening = openBrowser("http://127.0.0.1", abort.signal).then(
          () => "success",
          () => "failure",
        );
        if (cancelled) {
          abort.abort();
          child.emit("error", new Error("Controlled cancellation"));
        }
        child.emit("close", cancelled ? null : 0, cancelled ? "SIGTERM" : null);
        expect(await opening).toBe(cancelled ? "failure" : "success");
        abort.abort();
        await vi.advanceTimersByTimeAsync(20000);
        expect(child.kill).not.toHaveBeenCalled();
        expect(child.listenerCount("error")).toBe(0);
        expect(child.listenerCount("close")).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally {
      vi.useRealTimers();
    }
  });
  it("reports cleanup failure after listening without writing a second business envelope", async () => {
    const fixture = await fixtureDirectory();
    mocks.content.mockResolvedValue({ close: () => Promise.resolve() });
    mocks.preview.mockResolvedValue({
      url: "http://127.0.0.1:1234/",
      close: () => Promise.reject(new Error("SECRET cleanup")),
    });
    const output = streams();
    try {
      const running = main([
        "doc.json",
        "--data-dir",
        fixture.directory,
        "--no-open",
      ]);
      await vi.waitFor(() => {
        expect(output.out).toContain('"listening"');
      });
      process.emit("SIGTERM");
      expect(await running).toBe(143);
      expect(output.out.trim().split("\n")).toHaveLength(1);
      expect(output.err).toContain("Preview cleanup failed");
      expect(output.err).not.toContain("SECRET");
    } finally {
      await fixture.cleanup();
    }
  });
});
