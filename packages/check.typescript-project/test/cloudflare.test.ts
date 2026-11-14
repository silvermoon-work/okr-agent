import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Files, dataYaml, record } from "../src/files.js";
import { cloudflare } from "../src/cloudflare.js";
import { inspect } from "../src/inspect.js";
import { fixture, put, testEvidence, vitestConfig } from "./fixture.js";
import { type Project } from "../src/commands.js";
import { stringify } from "yaml";

let root: string;
beforeEach(async () => {
  root = resolve("dist", `.cloudflare-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  await fixture(root);
  await put(root, "silvermoon.yaml", {
    deliverables: [{ path: ".", type: "cloudflare" }],
  });
  const manifest = record(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown,
  );
  await put(root, "package.json", {
    ...manifest,
    devDependencies: {
      ...record(manifest.devDependencies),
      wrangler: "catalog:",
    },
  });
  const workspace = dataYaml(
    await readFile(join(root, "pnpm-workspace.yaml"), "utf8"),
  );
  record(workspace.catalog).wrangler = "^4.162.0";
  await put(root, "pnpm-workspace.yaml", stringify(workspace));
  const lock = dataYaml(await readFile(join(root, "pnpm-lock.yaml"), "utf8"));
  record(record(record(lock.importers)["."]).devDependencies).wrangler = {
    specifier: "catalog:",
    version: "4.162.0",
  };
  await put(root, "pnpm-lock.yaml", stringify(lock));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
async function config(value: Record<string, unknown> = {}) {
  await put(root, "wrangler.jsonc", {
    name: "fixture-worker",
    compatibility_date: "2026-01-01",
    ...value,
  });
}
async function tools(additions: Record<string, string>) {
  const manifest = record(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown,
  );
  const workspace = dataYaml(
    await readFile(join(root, "pnpm-workspace.yaml"), "utf8"),
  );
  const lock = dataYaml(await readFile(join(root, "pnpm-lock.yaml"), "utf8"));
  for (const [name, version] of Object.entries(additions)) {
    record(manifest.devDependencies)[name] = "catalog:";
    record(workspace.catalog)[name] = `^${version}`;
    record(record(record(lock.importers)["."]).devDependencies)[name] = {
      specifier: "catalog:",
      version,
    };
  }
  await put(root, "package.json", manifest);
  await put(root, "pnpm-workspace.yaml", stringify(workspace));
  await put(root, "pnpm-lock.yaml", stringify(lock));
}
async function server(objects = false) {
  await config({
    main: "src/worker.ts",
    ...(objects
      ? {
          durable_objects: {
            bindings: [
              { name: "ROOM", class_name: "Room" },
              { name: "LOG", class_name: "Log" },
            ],
          },
          migrations: [{ tag: "v1", new_sqlite_classes: ["Room", "Log"] }],
        }
      : {}),
  });
  await put(
    root,
    "src/worker.ts",
    `${objects ? 'import {DurableObject} from "cloudflare:workers"; export class Room extends DurableObject<Env> {} export class Log extends DurableObject<Env> {}' : ""}
export default { async fetch(): Promise<Response> { throw new Error("DO NOT EXECUTE"); } } satisfies ExportedHandler<Env>;`,
  );
  await put(
    root,
    "worker-configuration.d.ts",
    `declare namespace Cloudflare { interface Env { ${objects ? "ROOM: DurableObjectNamespace<Room>; LOG: DurableObjectNamespace<Log>;" : ""} } } interface Env extends Cloudflare.Env {}`,
  );
  const ts = record(
    JSON.parse(await readFile(join(root, "tsconfig.json"), "utf8")) as unknown,
  );
  ts.compilerOptions = { types: ["./worker-configuration.d.ts"] };
  await put(root, "tsconfig.json", ts);
  await put(
    root,
    "vitest.config.ts",
    `import {cloudflareTest} from "@cloudflare/vitest-plugin";\n${vitestConfig.replace("defineConfig({ test:", 'defineConfig({ plugins: [cloudflareTest({wrangler:{configPath:"./wrangler.jsonc"}})], test:').replace('provider: "v8"', 'provider: "istanbul"')}`,
  );
  await tools({
    "@cloudflare/vitest-plugin": "1.8.2",
    "@vitest/coverage-istanbul": "5.0.4",
  });
}
async function check(full = false) {
  const problems: { code: string; brief: string }[] = [];
  if (full) {
    await inspect(
      { projectDirectory: root },
      new AbortController().signal,
      (code, brief) => problems.push({ code, brief }),
      await testEvidence(),
    );
  } else {
    const files = new Files(root, new AbortController().signal);
    await files.scan();
    await cloudflare(
      files,
      [
        {
          directory: "",
          delivery: "cloudflare",
          manifest: await files.json("package.json"),
          sources: ["src/index.ts"],
          tests: ["test/index.test.ts"],
        },
      ],
      (code, brief) => problems.push({ code, brief }),
    );
  }
  return problems;
}
it("supports assets-only without main, binding, generated types or a Workers plugin while keeping generic gates", async () => {
  await mkdir(join(root, "public"));
  await config({
    assets: {
      directory: "./public",
      not_found_handling: "single-page-application",
    },
    durable_objects: { bindings: [] },
    migrations: [],
  });
  expect(await check(true)).toEqual([]);
  await put(root, "tsconfig.base.json", { compilerOptions: { strict: false } });
  expect(
    (await check(true)).some(
      (problem) => problem.code === "typescript-mismatch",
    ),
  ).toBe(true);
});
it.each([false, true])(
  "supports module API/SSR and optional multiple local DO (%s) without executing target code",
  async (objects) => {
    await server(objects);
    expect(await check(true)).toEqual([]);
  },
);
it("does not apply platform rules to npm/custom/undeclared packages", async () => {
  const files = new Files(root, new AbortController().signal);
  await files.scan();
  const projects: Project[] = ["npm", "custom", undefined].map((delivery) => ({
    directory: "",
    manifest: {},
    sources: [],
    tests: [],
    ...(delivery ? { delivery } : {}),
  }));
  const report = vi.fn();
  await cloudflare(files, projects, report);
  expect(report).not.toHaveBeenCalled();
});
it.each([
  [{}, "missing", "main or assets"],
  [{ name: "" }, "mismatch", "name"],
  [{ name: "bad_name" }, "unconfirmed", "name shape"],
  [{ compatibility_date: "2026-02-30" }, "mismatch", "date"],
  [{ compatibility_date: "2999-01-01" }, "mismatch", "date"],
  [{ compatibility_flags: [1] }, "mismatch", "string list"],
  [{ compatibility_flags: ["unknown_flag"] }, "unconfirmed", "flag"],
  [{ env: {} }, "unconfirmed", "env"],
  [{ services: [] }, "unconfirmed", "services"],
  [{ vectorize: [] }, "unconfirmed", "vectorize"],
  [{ vars: { TOKEN: "present" } }, "unconfirmed", "vars"],
  [{ find_additional_modules: true }, "unconfirmed", "find_additional_modules"],
  [{ not_a_field: true }, "unconfirmed", "reviewed Wrangler schema"],
  [{ assets: [] }, "mismatch", "assets"],
  [{ assets: {} }, "missing", "directory"],
  [{ assets: { directory: "../outside" } }, "mismatch", "path"],
  [{ assets: { directory: "README.md" } }, "mismatch", "file"],
  [{ assets: { directory: "dist/client" } }, "unconfirmed", "directory"],
  [{ main: "src/absent.ts" }, "missing", "entrypoint"],
  [{ main: "dist/worker.js" }, "unconfirmed", "entrypoint"],
  [{ main: "../escape.ts" }, "mismatch", "path"],
] as const)(
  "reports bounded configuration problems: %j",
  async (value, status, brief) => {
    await config(value);
    expect(await check()).toContainEqual(
      expect.objectContaining({
        code: `cloudflare-${status}`,
        brief: expect.stringContaining(brief) as unknown,
      }),
    );
  },
);
it.each(["wrangler.toml", "cloudflare.config.ts", "wrangler.json"])(
  "does not guess an unsupported or competing configuration: %s",
  async (name) => {
    await config();
    await put(
      root,
      name,
      name.endsWith(".json") ? "{}" : 'throw new Error("DO NOT EXECUTE");',
    );
    expect((await check())[0]?.code).toBe("cloudflare-unconfirmed");
  },
);
it("does not reject reviewed ordinary Wrangler metadata", async () => {
  await mkdir(join(root, "public"));
  await config({
    assets: { directory: "./public" },
    workers_dev: false,
    minify: true,
    account_id: "0123456789abcdef0123456789abcdef",
    routes: [{ pattern: "example.com/*", zone_name: "example.com" }],
    observability: { enabled: true },
  });
  expect(await check()).toEqual([]);
});
it("reports missing native configuration rather than treating intention as platform success", async () => {
  expect((await check())[0]?.code).toBe("cloudflare-missing");
});
it.each([
  [{ html_handling: "wrong" }, "mismatch"],
  [{ not_found_handling: "wrong" }, "mismatch"],
  [{ base_path: 1 }, "mismatch"],
  [{ run_worker_first: true }, "mismatch"],
  [{ run_worker_first: ["/api/*"] }, "mismatch"],
  [{ run_worker_first: ["relative"] }, "unconfirmed"],
  [{ run_worker_first: 1 }, "mismatch"],
  [{ unknown: true }, "unconfirmed"],
] as const)(
  "validates only supported asset option shapes: %j",
  async (value, status) => {
    await mkdir(join(root, "public"));
    await config({ assets: { directory: "public", ...value } });
    expect((await check())[0]?.code).toBe(`cloudflare-${status}`);
  },
);
it("accepts explicit asset routing on a readable Worker and matching Env", async () => {
  await server();
  await mkdir(join(root, "public"));
  await config({
    main: "./src/worker.ts",
    assets: {
      directory: "public",
      binding: "ASSETS",
      run_worker_first: ["/api/*", "!/api/docs/*"],
      html_handling: "none",
      base_path: "/app/",
    },
  });
  await put(
    root,
    "worker-configuration.d.ts",
    "declare namespace Cloudflare { interface Env { ASSETS: Fetcher; } }",
  );
  expect(await check(true)).toEqual([]);
});
it.each([
  [
    {
      durable_objects: {
        bindings: [{ name: "ROOM", class_name: "Room", script_name: "other" }],
      },
    },
    "unconfirmed",
  ],
  [
    {
      durable_objects: { bindings: [{ name: "ROOM", class_name: "Missing" }] },
    },
    "mismatch",
  ],
  [{ durable_objects: { bindings: [{ name: "ROOM" }] } }, "missing"],
  [{ durable_objects: { bindings: "wrong" } }, "mismatch"],
  [{ durable_objects: { code_update_strategy: {} } }, "unconfirmed"],
  [{ migrations: [{ tag: "v1", renamed_classes: [] }] }, "unconfirmed"],
  [
    { migrations: [{ tag: "v1", new_sqlite_classes: ["Missing"] }] },
    "mismatch",
  ],
  [
    {
      migrations: [{ tag: "v1", new_sqlite_classes: ["Room"] }, { tag: "v1" }],
    },
    "mismatch",
  ],
  [
    { migrations: [{ tag: "v1", new_sqlite_classes: ["Room", "Room"] }] },
    "mismatch",
  ],
  [{ migrations: [] }, "mismatch"],
  [{ migrations: {} }, "mismatch"],
] as const)(
  "reports bounded local DO/migration problems: %j",
  async (value, status) => {
    await server(true);
    const current = record(
      JSON.parse(
        await readFile(join(root, "wrangler.jsonc"), "utf8"),
      ) as unknown,
    );
    await config({ ...current, ...value });
    expect((await check())[0]?.code).toBe(`cloudflare-${status}`);
  },
);
it("does not ignore a local DO with missing create migration or conflicting binding identity", async () => {
  await server(true);
  const current = record(
    JSON.parse(await readFile(join(root, "wrangler.jsonc"), "utf8")) as unknown,
  );
  delete current.migrations;
  await config(current);
  expect((await check())[0]?.code).toBe("cloudflare-missing");
  current.migrations = [{ tag: "v1", new_sqlite_classes: ["Room", "Log"] }];
  current.assets = { directory: "public", binding: "ROOM" };
  await mkdir(join(root, "public"));
  await config(current);
  expect((await check())[0]?.brief).toContain("duplicate binding");
});
it.each([
  [
    "worker-configuration.d.ts",
    "declare namespace Cloudflare { interface Env {} }",
    "mismatch",
  ],
  [
    "worker-configuration.d.ts",
    "interface Env { ROOM: unknown; LOG: unknown; }",
    "unconfirmed",
  ],
  ["src/worker.ts", "export default {fetch: 1};", "mismatch"],
  ["src/worker.ts", 'export {default} from "./unknown";', "unconfirmed"],
  ["src/worker.ts", "export default configureWorker();", "unconfirmed"],
] as const)(
  "rejects missing static type/export relationships in %s",
  async (path, value, status) => {
    await server(true);
    await put(root, path, value);
    expect((await check())[0]?.code).toBe(`cloudflare-${status}`);
  },
);
it.each([
  ['provider: "istanbul"', 'provider: "v8"', "mismatch"],
  ['configPath:"./wrangler.jsonc"', 'configPath:"./other.jsonc"', "mismatch"],
  ['configPath:"./wrangler.jsonc"', 'configPath:"../outside"', "mismatch"],
  ['wrangler:{configPath:"./wrangler.jsonc"}', "config:true", "unconfirmed"],
  ["cloudflareTest({", "cloudflareTest(async () => ({", "unconfirmed"],
] as const)(
  "checks literal Workers plugin semantics (%s)",
  async (from, to, status) => {
    await server();
    const text = await readFile(join(root, "vitest.config.ts"), "utf8");
    await put(root, "vitest.config.ts", text.replace(from, to));
    expect((await check())[0]?.code).toBe(`cloudflare-${status}`);
  },
);
it("keeps generic coverage gates after a recognized Workers plugin", async () => {
  await server();
  await put(
    root,
    "vitest.config.ts",
    (await readFile(join(root, "vitest.config.ts"), "utf8")).replace(
      "branches: 90",
      "branches: 101",
    ),
  );
  expect(
    (await check(true)).some((problem) => problem.code === "coverage-mismatch"),
  ).toBe(true);
});
it("supports a DO-only deployment unit without forcing an HTTP handler", async () => {
  await server(true);
  await put(
    root,
    "src/worker.ts",
    'import {DurableObject} from "cloudflare:workers"; export class Room extends DurableObject<Env> {} export class Log extends DurableObject<Env> {}',
  );
  expect(await check(true)).toEqual([]);
});
it("reports a missing platform-only catalog without hiding unrelated I/O", async () => {
  await mkdir(join(root, "public"));
  await config({ assets: { directory: "public" } });
  await rm(join(root, "pnpm-workspace.yaml"));
  expect((await check())[0]?.code).toBe("cloudflare-missing");
});
it.each([
  ["pnpm-lock.yaml", "dependency-missing"],
  [".node-version", "environment-missing"],
])(
  "leaves a generic prerequisite to its own domain: %s",
  async (path, code) => {
    await mkdir(join(root, "public"));
    await config({ assets: { directory: "public" } });
    await rm(join(root, path));
    expect(await check()).toEqual([]);
    const problems = await check(true);
    expect(problems.map((problem) => problem.code)).toContain(code);
    expect(
      problems.filter((problem) => problem.code.startsWith("cloudflare-")),
    ).toEqual([]);
  },
);
it.each([
  ["wrangler", "4.163.0", "unconfirmed"],
  ["wrangler", "4.162.0-beta.1", "unconfirmed"],
  ["@cloudflare/vitest-plugin", "1.8.3", "unconfirmed"],
  ["vitest", "3.0.0", "unconfirmed"],
  ["@vitest/coverage-istanbul", "5.0.3", "mismatch"],
] as const)(
  "does not fake compatibility for %s@%s",
  async (name, version, status) => {
    await server();
    await tools({ [name]: version });
    expect((await check())[0]?.code).toBe(`cloudflare-${status}`);
  },
);
it("checks tool declaration, importer identity and named catalog facts", async () => {
  await mkdir(join(root, "public"));
  await config({ assets: { directory: "public" } });
  const manifest = record(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown,
  );
  record(manifest.devDependencies).wrangler = "catalog:workers";
  await put(root, "package.json", manifest);
  const workspace = dataYaml(
    await readFile(join(root, "pnpm-workspace.yaml"), "utf8"),
  );
  workspace.catalogs = { workers: { wrangler: "^4.162.0" } };
  await put(root, "pnpm-workspace.yaml", stringify(workspace));
  const lock = dataYaml(await readFile(join(root, "pnpm-lock.yaml"), "utf8"));
  const entry = record(
    record(record(record(lock.importers)["."]).devDependencies).wrangler,
  );
  entry.specifier = "catalog:workers";
  await put(root, "pnpm-lock.yaml", stringify(lock));
  expect(await check()).toEqual([]);
  entry.specifier = "wrong";
  await put(root, "pnpm-lock.yaml", stringify(lock));
  expect((await check())[0]?.code).toBe("cloudflare-mismatch");
  entry.specifier = "catalog:workers";
  record(record(workspace.catalogs).workers).wrangler = "^5.0.0";
  await put(root, "pnpm-workspace.yaml", stringify(workspace));
  await put(root, "pnpm-lock.yaml", stringify(lock));
  expect((await check())[0]?.code).toBe("cloudflare-mismatch");
  delete record(manifest.devDependencies).wrangler;
  await put(root, "package.json", manifest);
  expect((await check())[0]?.code).toBe("cloudflare-missing");
});
it("keeps unexpected directory I/O as execution failure in the platform checker", async () => {
  await config({ assets: { directory: "public" } });
  const files = new Files(root, new AbortController().signal);
  await files.scan();
  vi.spyOn(files, "kind").mockRejectedValueOnce(
    Object.assign(new Error("disk failure"), { code: "EIO" }),
  );
  await expect(
    cloudflare(
      files,
      [
        {
          directory: "",
          delivery: "cloudflare",
          manifest: await files.json("package.json"),
          sources: [],
          tests: [],
        },
      ],
      () => {},
    ),
  ).rejects.toThrow("disk failure");
});
it("distinguishes a malformed generated-directory path from unavailable output", async () => {
  await mkdir(join(root, "dist"), { recursive: true });
  await put(root, "dist/client", "not a directory");
  await config({ assets: { directory: "dist/client" } });
  expect((await check())[0]?.code).toBe("cloudflare-mismatch");
  await config({ main: "src" });
  expect((await check())[0]?.code).toBe("cloudflare-mismatch");
});
it.each([
  ["tsconfig.json", "typescript-missing"],
  ["vitest.config.ts", "testing-missing"],
])(
  "does not restate a missing generic configuration: %s",
  async (path, code) => {
    await server(true);
    await rm(join(root, path));
    expect(await check()).toEqual([]);
    const problems = await check(true);
    expect(problems.map((problem) => problem.code)).toContain(code);
    expect(
      problems.filter((problem) => problem.code.startsWith("cloudflare-")),
    ).toEqual([]);
  },
);
it.each([
  ["worker-configuration.d.ts", undefined, "missing"],
  [
    "src/worker.ts",
    "export class Room {} export class Log {} export default {fetch(){}};",
    "unconfirmed",
  ],
] as const)(
  "requires applicable source/type/test evidence: %s",
  async (path, source, status) => {
    await server(true);
    if (source === undefined) await rm(join(root, path));
    else await put(root, path, source);
    expect((await check())[0]?.code).toBe(`cloudflare-${status}`);
  },
);
it("does not silently accept excluded or ambiguous local type declarations", async () => {
  await server();
  const config = record(
    JSON.parse(await readFile(join(root, "tsconfig.json"), "utf8")) as unknown,
  );
  config.compilerOptions = {};
  await put(root, "tsconfig.json", config);
  expect((await check())[0]?.code).toBe("cloudflare-mismatch");
  config.compilerOptions = {
    types: ["./worker-configuration.d.ts", "./other.d.ts"],
  };
  await put(
    root,
    "other.d.ts",
    "declare namespace Cloudflare {interface Env {}}",
  );
  await put(root, "tsconfig.json", config);
  expect((await check())[0]?.code).toBe("cloudflare-unconfirmed");
});
it("keeps module Node imports conditional on compatibility flags and Node type inclusion", async () => {
  await server();
  await put(
    root,
    "src/worker.ts",
    'import {AsyncLocalStorage} from "node:async_hooks"; export default {fetch(){return new Response()}};',
  );
  expect((await check())[0]?.code).toBe("cloudflare-mismatch");
  await config({ main: "src/worker.ts", compatibility_flags: ["nodejs_als"] });
  expect((await check())[0]?.code).toBe("cloudflare-missing");
  const ts = record(
    JSON.parse(await readFile(join(root, "tsconfig.json"), "utf8")) as unknown,
  );
  record(ts.compilerOptions).types = ["./worker-configuration.d.ts", "node"];
  await put(root, "tsconfig.json", ts);
  expect(await check()).toEqual([]);
});
it("rejects custom Workers environments and missing or dynamic plugin arguments", async () => {
  await server();
  const text = await readFile(join(root, "vitest.config.ts"), "utf8");
  await put(
    root,
    "vitest.config.ts",
    text.replace("test: {", 'test: { environment: "node",'),
  );
  expect((await check())[0]?.code).toBe("cloudflare-mismatch");
  await put(root, "vitest.config.ts", vitestConfig);
  expect((await check())[0]?.code).toBe("cloudflare-missing");
  await put(
    root,
    "vitest.config.ts",
    text.replace('configPath:"./wrangler.jsonc"', 'environment:"preview"'),
  );
  expect((await check())[0]?.code).toBe("cloudflare-unconfirmed");
  await put(root, "vitest.config.ts", text);
  await put(root, "vitest.config.js", text);
  expect(await check()).toEqual([]);
  expect(
    (await check(true)).filter(
      (problem) =>
        problem.code.startsWith("cloudflare-") ||
        problem.brief.includes("ambiguous configuration"),
    ),
  ).toEqual([expect.objectContaining({ code: "testing-unconfirmed" })]);
});
