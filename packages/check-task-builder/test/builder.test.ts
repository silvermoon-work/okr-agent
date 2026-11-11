import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  directoryTree,
  writeDirectory,
} from "@silvermoon-work/task-builder-cli/node";
import { encodeTaskBundleCar } from "@silvermoon-work/task-builder/car";
import { readBytes } from "@silvermoon-work/task-builder/tree";
import { parse, stringify } from "yaml";
import {
  buildCheckBundle,
  createCheckProject,
  transformCheckTree,
} from "../src/index.js";
import { runCheckBuilderCli } from "../src/cli.js";

const root = resolve("../..");
const scratch = join(root, ".check-tests");
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
});
async function project() {
  await mkdir(scratch, { recursive: true });
  const directory = join(scratch, randomUUID());
  directories.push(directory);
  const tree = await createCheckProject({
    name: "@example/text-check",
    taskName: "Text check",
  });
  await writeDirectory(tree, directory);
  await mkdir(join(directory, "references", "assets"));
  await writeFile(
    join(directory, "references", "assets", "standard.txt"),
    "Ancillary standard resource.\n",
  );
  await rm(join(directory, "pnpm-workspace.yaml"));
  await mkdir(join(directory, "node_modules", "@silvermoon-work"), {
    recursive: true,
  });
  await mkdir(join(directory, "node_modules", "@sinclair"), {
    recursive: true,
  });
  await symlink(
    resolve("../check-task-sdk"),
    join(directory, "node_modules", "@silvermoon-work", "check-task-sdk"),
    "junction",
  );
  await symlink(
    resolve("node_modules", "@sinclair", "typebox"),
    join(directory, "node_modules", "@sinclair", "typebox"),
    "junction",
  );
  return directory;
}
async function cli(argv: string[], cwd: string) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCheckBuilderCli(argv, {
    cwd,
    stdout: {
      write: (text) => {
        stdout += text;
      },
    },
    stderr: {
      write: (text) => {
        stderr += text;
      },
    },
  });
  return { exitCode, stdout, stderr };
}
function logical(directory: string) {
  return `${directory.slice(root.length + 1).replaceAll("\\", "/")}/check.build.yaml`;
}

describe("Check tree transformation", () => {
  it("uses upstream compilation/binding/CAR and preserves resources and relative references", async () => {
    const directory = await project();
    await mkdir(join(directory, "references", "images"));
    await writeFile(
      join(directory, "references", "images", "standard.svg"),
      "<svg/>",
    );
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff]);
    await writeFile(
      join(directory, "references", "images", "standard.png"),
      binary,
    );
    const configPath = join(directory, "check.build.yaml");
    const config = parse(await readFile(configPath, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      configPath,
      stringify({
        ...config,
        binary: ["resources/references/images/*.png"],
      }),
    );
    await writeFile(
      join(directory, "references", "extra.md"),
      "# More standard\n",
    );
    const input = await directoryTree(root);
    const transformed = await transformCheckTree(input, logical(directory));
    expect(transformed.options.source.mode).toBe("explicit");
    expect(transformed.options.source.sdk).toBeUndefined();
    expect(transformed.options.include).toContainEqual({
      from: `${logical(directory).replace("/check.build.yaml", "")}/references/**`,
      to: "resources/references/",
    });
    const bundle = await buildCheckBundle(input, logical(directory));
    expect(
      Buffer.from(
        await readBytes(
          bundle,
          "resources/references/images/standard.png",
          100,
        ),
      ),
    ).toEqual(binary);
    expect(
      Buffer.from(
        await readBytes(
          bundle,
          "resources/references/images/standard.svg",
          100,
        ),
      ).toString(),
    ).toBe("<svg/>");
    expect(
      Buffer.from(
        await readBytes(bundle, "resources/references/extra.md", 100),
      ).toString(),
    ).toContain("More");
    const archive = await encodeTaskBundleCar(bundle);
    expect(archive.cid).toMatch(/^bafy/);
    await archive.close();
    expect(await readdir(directory)).not.toContain(".check");
  }, 30_000);

  it.each(["missing", "extra", "empty", "utf8", "hidden", "case"])(
    "rejects %s reference documentation before delivery",
    async (mode) => {
      const directory = await project();
      const path = join(
        directory,
        "references",
        "problems",
        "text-mismatch.md",
      );
      if (mode === "missing") await rm(path);
      if (mode === "extra")
        await writeFile(join(dirname(path), "undeclared.md"), "Unexpected");
      if (mode === "empty") await writeFile(path, " \n ");
      if (mode === "utf8") await writeFile(path, Buffer.from([0xff]));
      if (mode === "case") {
        const check = join(directory, "references", "check.md");
        await rename(check, `${check}.renaming`);
        await rename(
          `${check}.renaming`,
          join(directory, "references", "CHECK.md"),
        );
      }
      if (mode === "hidden")
        await writeFile(
          join(directory, "references", ".hidden.md"),
          "Must not disappear",
        );
      const result = await cli(["build"], directory);
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: false });
      expect(await readdir(directory)).not.toContain("dist");
    },
    30_000,
  );

  it("rejects YAML problemCodes and callback mode instead of creating parallel contracts", async () => {
    const directory = await project();
    const file = join(directory, "check.build.yaml");
    const config = parse(await readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      file,
      stringify({ ...config, problemCodes: ["text-mismatch"] }),
    );
    await expect(
      transformCheckTree(await directoryTree(root), logical(directory)),
    ).rejects.toThrow("fields");
    await writeFile(
      file,
      stringify({
        ...config,
        source: {
          entry: "src/main.ts",
          contract: "src/contract.ts",
          mode: "callback",
        },
      }),
    );
    await expect(
      transformCheckTree(await directoryTree(root), logical(directory)),
    ).rejects.toThrow("only accepts");
  });
});

describe("CLI and actual published Engine", () => {
  it("prints text help/version, JSON errors and a pinned editable init project without installing", async () => {
    await mkdir(scratch, { recursive: true });
    expect((await cli([], scratch)).stdout).toContain("Usage:");
    expect((await cli(["--version"], scratch)).stdout.trim()).toBe(
      "0.1.0-rc.0",
    );
    const result = await cli(
      ["init", "example", "--package-name", "@example/text-check"],
      scratch,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
    const manifest = JSON.parse(
      await readFile(join(scratch, "example", "package.json"), "utf8"),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(manifest.dependencies["@silvermoon-work/check-task-sdk"]).toBe(
      "0.1.0-rc.0",
    );
    expect(manifest.devDependencies["@silvermoon-work/task-builder-cli"]).toBe(
      "0.2.0-rc.0",
    );
    expect(manifest.scripts.car).toContain("dist/example-text-check/task.yaml");
    expect(await readdir(join(scratch, "example"))).not.toContain(
      "node_modules",
    );
    expect((await cli(["init", "example"], scratch)).exitCode).toBe(1);
    expect(
      (await cli(["init", "bad", "--package-name", "INVALID"], scratch))
        .exitCode,
    ).toBe(1);
    expect((await cli(["car"], scratch)).exitCode).toBe(1);
    expect((await cli(["build", "--invalid"], scratch)).exitCode).toBe(1);
    expect(
      (await cli(["build", "--out-dir", "a", "--out-dir", "b"], scratch))
        .exitCode,
    ).toBe(1);
    expect((await cli(["--version", "--invalid"], scratch)).exitCode).toBe(1);
  });

  it("builds final folder/CAR, executes pass/fail with real output docs, and preserves old CAR under --no-car", async () => {
    const directory = await project();
    const output = join(directory, "dist", "example-text-check");
    const result = await cli(["build"], directory);
    expect(result.exitCode, result.stdout).toBe(0);
    const envelope: unknown = JSON.parse(result.stdout);
    expect(envelope).toMatchObject({
      ok: true,
      data: { car: { path: `${output}.car` } },
    });
    expect(await readdir(join(directory, "dist"))).toEqual([
      "example-text-check",
      "example-text-check.car",
    ]);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["scripts/smoke.mjs", output],
      { cwd: resolve("."), timeout: 45_000 },
    );
    const smoke = JSON.parse(stdout) as {
      ok: boolean;
      results: {
        pass: boolean;
        reclaimed: boolean;
        resources: string[];
        output: {
          cid: string;
          result: { pass: boolean; documentation: string };
        };
      }[];
    };
    expect(smoke.ok).toBe(true);
    expect(smoke.results.map((result) => result.pass).sort()).toEqual([
      false,
      true,
    ]);
    expect(smoke.results.every((result) => result.reclaimed)).toBe(true);
    for (const result of smoke.results) {
      expect(result.output.cid).toMatch(/^b[a-z2-7]+$/u);
      expect(result.output).toMatchObject({
        result: {
          pass: result.pass,
          documentation: "references/check.md",
        },
      });
    }
    expect(
      smoke.results.every((result) =>
        result.resources.includes("references/assets/standard.txt"),
      ),
    ).toBe(true);
    await writeFile(`${output}.car`, "old CAR sentinel");
    await writeFile(join(output, "unselected.txt"), "preserve");
    const rebuilt = await cli(["build", "--no-car"], directory);
    expect(rebuilt.exitCode, rebuilt.stdout).toBe(0);
    expect(JSON.parse(rebuilt.stdout)).toMatchObject({ data: { car: null } });
    expect(await readFile(`${output}.car`, "utf8")).toBe("old CAR sentinel");
    expect(await readFile(join(output, "unselected.txt"), "utf8")).toBe(
      "preserve",
    );
  }, 60_000);

  it("reports a verified module but failed CAR delivery without inventing success or rollback", async () => {
    const directory = await project();
    const archivePath = join(directory, "dist", "example-text-check.car");
    await mkdir(archivePath, { recursive: true });
    const result = await cli(["build"], directory);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "CAR_WRITE_FAILED" },
      data: { module: { directory: archivePath.slice(0, -4) }, car: null },
    });
    expect(
      (await readdir(directory)).filter((name) =>
        name.startsWith(".check-task-builder"),
      ),
    ).toEqual([]);
    await rm(join(directory, "references", "check.md"));
    const before = await readFile(join(archivePath.slice(0, -4), "worker.cjs"));
    expect((await cli(["build", "--no-car"], directory)).exitCode).toBe(1);
    expect(
      await readFile(join(archivePath.slice(0, -4), "worker.cjs")),
    ).toEqual(before);
  }, 30_000);

  it("does not turn a throw after a problem into a nonpassing business result", async () => {
    const directory = await project();
    const source = join(directory, "src", "main.ts");
    await writeFile(
      source,
      (await readFile(source, "utf8")).replace(
        "  const node =",
        '  reportProblem("text-mismatch", "Reported before execution fault.");\n  throw new Error("Cannot finish check.");\n  const node =',
      ),
    );
    const result = await cli(["build", "--no-car"], directory);
    expect(result.exitCode, result.stdout).toBe(0);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "scripts/smoke.mjs",
        join(directory, "dist", "example-text-check"),
        "fault",
      ],
      { cwd: resolve("."), timeout: 45_000 },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      results: [{ kind: "failed", reclaimed: true }],
    });
  }, 60_000);
});
