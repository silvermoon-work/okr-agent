import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import * as device from "../src/device.js";
import * as repositoryModule from "../src/repository.js";
import { bundledArtifact } from "../src/host.js";
import * as host from "../src/host.js";
import { gates, idea } from "../src/domain.js";
import { replay } from "../src/write.js";
import {
  add,
  event,
  files,
  id,
  materialize,
  repository,
  scratch,
  sync,
  sign,
  batch,
} from "./fixtures.js";

const execute = promisify(execFile);
afterEach(() => {
  vi.restoreAllMocks();
});
async function cli(args: string[], cwd: string, signal?: AbortSignal) {
  let stdout = "";
  let stderr = "";
  const exit = await runCli(args, {
    cwd,
    stdout: {
      write: (value) => {
        stdout += value;
      },
    },
    stderr: {
      write: (value) => {
        stderr += value;
      },
    },
    ...(signal ? { signal } : {}),
  });
  return { exit, stdout, stderr, json: (): unknown => JSON.parse(stdout) };
}
async function controlledHome() {
  const home = await scratch();
  vi.spyOn(device, "currentDevice").mockReturnValue({
    home,
    path: process.env.PATH ?? "",
    entry: resolve("dist", "bin.js"),
  });
  return home;
}
describe("CLI retained commands, presentation and explicit errors", () => {
  it("uses actual nonfresh tracking context for list/replay, including ancestor evidence and unavailable primary", async () => {
    await controlledHome();
    const { root, remote } = await repository();
    let source = new Map(
      repositoryModule.selectIdea(await repositoryModule.readProject(root), id)
        .files,
    );
    const github = "https://github.com/example/project.git";
    await repositoryModule.git(root, ["remote", "set-url", "origin", github]);
    const synchronize = async () => {
      await repositoryModule.git(root, ["remote", "set-url", "origin", remote]);
      await sync(root);
      await repositoryModule.git(root, ["remote", "set-url", "origin", github]);
    };
    const query = async (level: string) => {
      const inventory = await cli(["list-ideas", "--all", "--json"], root);
      const replayed = await replay(root, id);
      expect(inventory.exit).toBe(0);
      expect(inventory.json()).toMatchObject({
        ideas: [{ id, state: { level } }],
        observation: {
          scope: "local",
          fresh: false,
          primary: { status: "available" },
        },
      });
      expect(replayed).toMatchObject({
        state: { level },
        observation: {
          scope: "local",
          fresh: false,
          primary: { status: "available" },
        },
      });
      return replayed as { state: { implementation?: string } };
    };
    source = sign(source, "requirements");
    await materialize(root, source);
    await query("synchronization");
    await synchronize();
    await query("research");
    for (const gate of gates.slice(1)) source = sign(source, gate);
    await materialize(root, source);
    await synchronize();
    await query("implementation");
    const tested = await repositoryModule.git(root, ["rev-parse", "HEAD"]);
    source = add(
      source,
      event({
        type: "verify",
        batch: { ...batch(idea(source, id)), subject: tested },
      }),
    );
    await materialize(root, source);
    await synchronize();
    const head = await repositoryModule.git(root, ["rev-parse", "HEAD"]);
    expect(head).not.toBe(tested);
    const deployed = await query("deployment");
    source = add(
      source,
      event({
        type: "verify",
        batch: {
          ...batch(
            idea(source, id),
            "deployment",
            deployed.state.implementation,
          ),
          subject: head,
        },
      }),
    );
    await materialize(root, source);
    await synchronize();
    await query("completed");
    await repositoryModule.git(root, [
      "update-ref",
      "-d",
      "refs/remotes/origin/main",
    ]);
    const missing = (
      await cli(["list-ideas", "--all", "--state", "unknown", "--json"], root)
    ).json() as { observation: { primary: { diagnostic: string } } };
    expect(missing).toMatchObject({
      ideas: [{ id, state: { level: "unknown" } }],
      observation: {
        scope: "local",
        fresh: false,
        primary: {
          status: "unavailable",
        },
      },
    });
    expect(missing.observation.primary.diagnostic).toMatch(/tracking/);
    expect(await replay(root, id)).toMatchObject({
      state: { level: "unknown" },
      observation: { primary: { status: "unavailable" } },
    });
    await expect(
      repositoryModule.git(root, [
        "rev-parse",
        "--verify",
        "refs/remotes/origin/main",
      ]),
    ).rejects.toThrow();
  }, 30_000);
  it("keeps context errors, exact selected CIDs, remote snapshots and cancellation distinct", async () => {
    await controlledHome();
    const absentRoot = vi
      .spyOn(repositoryModule, "discoverRoot")
      .mockResolvedValue(undefined);
    const outside = await scratch();
    expect((await cli(["check-idea", "--json"], outside)).exit).toBe(2);
    expect((await cli(["check-idea", id, "--json"], outside)).exit).toBe(1);
    expect((await cli(["check-changes", "--json"], outside)).exit).toBe(1);
    absentRoot.mockRestore();
    const { root, remote } = await repository({ idea: false });
    const artifact = await bundledArtifact();
    const candidate = files();
    for (const [path, bytes] of candidate)
      if (path === "idea.json" || path === "events.jsonl")
        candidate.set(
          path,
          Buffer.from(
            new TextDecoder()
              .decode(bytes)
              .replaceAll(
                "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3thv36wjgksq4bqppj6bfk3sa",
                artifact.cid,
              ),
          ),
        );
    await materialize(root, candidate);
    await sync(root);
    const primary = repositoryModule.primary;
    vi.spyOn(repositoryModule, "primary").mockImplementation((project) =>
      primary(project, { fetch: false, localRemote: remote }),
    );
    const remoteCommit = await repositoryModule.git(root, [
      "rev-parse",
      "origin/main",
    ]);
    await repositoryModule.git(root, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const active = new AbortController();
    expect(
      (
        await cli(
          ["check-idea", id, "--root", root, "--json"],
          outside,
          active.signal,
        )
      ).exit,
    ).toBe(0);
    expect(
      (
        await cli(
          ["check-changes", "--commit", remoteCommit, "--root", root, "--json"],
          outside,
          active.signal,
        )
      ).exit,
    ).toBe(0);
    active.abort(new Error("Cancelled CLI observation"));
    expect(
      (
        await cli(
          ["check-changes", "--root", root, "--json"],
          outside,
          active.signal,
        )
      ).exit,
    ).toBe(1);
  }, 20_000);
  it("supports help/version and rejects removed commands, output --language and conflicting flags before writes", async () => {
    const root = await scratch();
    expect(await cli(["--version"], root)).toMatchObject({
      exit: 0,
      stdout: "0.1.0-rc.1\n",
    });
    expect((await cli(["--help"], root)).stdout).toContain("check-idea");
    for (const argv of [
      [],
      ["reference", "x"],
      ["migrate"],
      ["whats-next", id],
      ["check"],
      ["check-idea"],
      ["check-setup", "--root", root],
      ["check-project", id],
      ["check-changes", "--remote"],
      ["event", "replay", id],
      ["event", "append", id],
      ["check-changes", "--allow-delete", "invalid"],
      ["check-idea", "--language", "zh-CN"],
      ["--audience", "robot", "check-idea"],
      ["--json", "--audience=agent", "create-idea"],
    ])
      expect((await cli(argv, root)).exit).toBe(2);
    expect(
      (await cli(["check-changes", "--worktree", "--staged"], root)).exit,
    ).toBe(2);
    expect((await cli(["event", "append", id], root)).exit).toBe(2);
  });
  it("renders identical human/agent/JSON business facts and distinguishes snapshot validity from lifecycle gaps", async () => {
    await controlledHome();
    const { root } = await repository({ idea: false });
    await materialize(root);
    const artifact = await bundledArtifact();
    const currentIdea = repositoryModule.selectIdea(
      await repositoryModule.readProject(root),
      id,
    );
    for (const path of ["idea.json", "events.jsonl"])
      await writeFile(
        join(root, ".silvermoon", "i", id, path),
        new TextDecoder()
          .decode(currentIdea.files.get(path))
          .replaceAll(currentIdea.bootstrap.checkCid, artifact.cid),
      );
    await sync(root);
    await repositoryModule.git(root, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    for (const audience of ["human", "agent"]) {
      const current = await cli(
        ["check-idea", id, "--audience", audience, "--root", root],
        root,
      );
      expect(current.exit).toBe(0);
      expect(current.stdout).toContain("## global-runtime-ready");
      expect(current.stdout).toContain("Documentation");
    }
    const structured = await cli(["check-idea", id, "--json"], root);
    expect(structured.exit).toBe(0);
    expect(structured.json()).toMatchObject({
      schema: "silvermoon/v2",
      result: {
        pass: false,
        problems: [{ code: "global-runtime-ready" }],
      },
    });
    const snapshot = await cli(["check-changes", "--worktree", "--json"], root);
    expect(snapshot.exit).toBe(0);
    expect(snapshot.json()).toMatchObject({ result: { pass: true } });
    expect(
      (await cli(["check-changes", "--staged", "--audience", "agent"], root))
        .exit,
    ).toBe(0);
    const head = await repositoryModule.git(root, ["rev-parse", "HEAD"]);
    expect(
      (await cli(["check-changes", "--commit", head, "--json"], root)).exit,
    ).toBe(0);
    await writeFile(join(root, ".silvermoon", "config.yaml"), "version: 999");
    expect(
      (await cli(["check-changes", "--worktree", "--json"], root)).exit,
    ).toBe(1);
    expect((await cli(["check-idea", "missing", "--json"], root)).exit).toBe(1);
  }, 20_000);
  it("queries only new inventory, supports aliases, stable time ordering and bounded literal filters without fetch", async () => {
    const home = await controlledHome();
    await mkdir(join(home, ".config", "silvermoon"), { recursive: true });
    await writeFile(
      join(home, ".config", "silvermoon", "config.yaml"),
      "preferredLanguage: ja-JP",
    );
    const { root } = await repository();
    await repositoryModule.git(root, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    await materialize(
      root,
      add(files(), event({ type: "setAlias", alias: "searchable" })),
    );
    const older = "202611171608ffff";
    for (const [path, bytes] of files()) {
      const target = join(root, ".silvermoon", "i", older, path);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(
        target,
        Buffer.from(
          new TextDecoder()
            .decode(bytes)
            .replaceAll(id, older)
            .replaceAll("2026-11-17T16:09:22.408Z", "2026-11-17T16:08:22.408Z"),
        ),
      );
    }
    const listed = await cli(
      ["list-ideas", "--all", "--sort", "oldest", "--json"],
      root,
    );
    expect(listed.json()).toMatchObject({
      ideas: [
        { id: older },
        { id, state: { alias: "searchable", contentLanguage: "zh-CN" } },
      ],
    });
    expect(
      (
        await cli(
          [
            "list-ideas",
            "--query",
            "SEARCHABLE",
            "--state",
            "requirements",
            "--state",
            "tests",
            "--limit",
            "1",
            "--json",
          ],
          root,
        )
      ).json(),
    ).toMatchObject({ ideas: [{ id }] });
    expect(
      (
        await cli(["list-ideas", "--query", "[literal].*", "--json"], root)
      ).json(),
    ).toMatchObject({ ideas: [] });
    expect(
      (
        await cli(
          [
            "list-ideas",
            "--created-after",
            "2026-11-17T16:09:00Z",
            "--created-before",
            "2026-11-17T16:10:00Z",
            "--json",
          ],
          root,
        )
      ).exit,
    ).toBe(0);
    expect(
      (await cli(["list-ideas", "--limit", "2", "--json"], root)).json(),
    ).toMatchObject({ ideas: [{ id }, { id: older }] });
    for (const argv of [
      ["--limit", "0"],
      ["--limit", "1.5"],
      ["--limit", "Infinity"],
      ["--created-after", "yesterday"],
      [
        "--created-after",
        "2027-01-01T00:00:00Z",
        "--created-before",
        "2026-01-01T00:00:00Z",
      ],
    ])
      expect((await cli(["list-ideas", ...argv], root)).exit).toBe(2);
    expect(await replay(root, "searchable")).toMatchObject({
      idea: id,
      state: { alias: "searchable" },
    });
  }, 20_000);
  it("creates after prerequisite checks and accepts directly edited events", async () => {
    await controlledHome();
    const { root, remote } = await repository({ idea: false });
    const actualPrimary = repositoryModule.primary;
    vi.spyOn(repositoryModule, "primary").mockImplementation((project) =>
      actualPrimary(project, { fetch: false, localRemote: remote }),
    );
    const prerequisite = vi.spyOn(host, "observe").mockResolvedValue({
      schema: "silvermoon/v2",
      checkCid: (await bundledArtifact("project")).cid,
      target: { userHome: device.currentDevice().home, repoRoot: root },
      result: { pass: true, documentation: "", references: [] },
      documents: [],
    });
    const created = await cli(
      ["create-idea", "--language", "fr-FR", "--json"],
      root,
    );
    expect(created.exit).toBe(0);
    expect(prerequisite).toHaveBeenCalledWith(
      { userHome: device.currentDevice().home, repoRoot: root },
      { operation: { mode: "project" } },
    );
    prerequisite.mockRestore();
    const result = created.json() as {
      id: string;
      checkCid: string;
      contentLanguage: string;
      scaffoldFallback: boolean;
    };
    expect(result).toMatchObject({
      contentLanguage: "fr-FR",
      scaffoldFallback: true,
      checkCid: (await bundledArtifact()).cid,
    });
    await sync(root);
    const current = repositoryModule.selectIdea(
      await repositoryModule.readProject(root),
      result.id,
    );
    const updated = add(
      current.files,
      event({ type: "setAlias", alias: "cli-created" }),
    );
    await writeFile(
      join(root, ".silvermoon", "i", result.id, "events.jsonl"),
      updated.get("events.jsonl")!,
    );
    expect((await cli(["check-changes", "--json"], root)).json()).toMatchObject(
      { result: { pass: true } },
    );
    const state = (await replay(root, "cli-created")) as { cursor: string };
    expect(await replay(root, result.id, state.cursor)).toMatchObject({
      events: [],
    });
    const unchanged = await repositoryModule.readProject(root);
    expect(unchanged.ideas.size).toBe(1);
    expect(
      (await cli(["--json", "--audience", "agent", "create-idea"], root)).exit,
    ).toBe(2);
    expect((await repositoryModule.readProject(root)).ideas.size).toBe(1);
  }, 20_000);
  it("reports failed creation prerequisites without writing a scaffold", async () => {
    await controlledHome();
    const { root } = await repository({ idea: false });
    const result = await cli(["create-idea", "--json"], root);
    expect(result.exit).toBe(1);
    expect(result.json()).toMatchObject({
      checkCid: (await bundledArtifact("project")).cid,
      result: { pass: false, problems: [{ code: "global-runtime-ready" }] },
    });
    expect((await repositoryModule.readProject(root)).ideas.size).toBe(0);
  });

  it("dispatches standalone project checks without creating an Idea and fails readiness gaps", async () => {
    const home = await controlledHome();
    const outside = await scratch();
    vi.spyOn(repositoryModule, "discoverRoot").mockResolvedValueOnce(undefined);
    expect((await cli(["check-project", "--json"], outside)).exit).toBe(1);
    const { root } = await repository({ idea: false });
    const artifact = await bundledArtifact("project");
    const report: host.Report = {
      schema: "silvermoon/v2",
      checkCid: artifact.cid,
      target: { userHome: home, repoRoot: root },
      result: { pass: true, documentation: "", references: [] },
      documents: [],
    };
    const observe = vi
      .spyOn(host, "observe")
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce({
        ...report,
        result: {
          pass: false,
          documentation: "",
          references: [],
          problems: [
            {
              checkpoint: "branch",
              code: "branch-silvermoon-config-valid",
              brief: "Configure primary.",
            },
          ],
        },
      });
    const success = await cli(
      ["check-project", "--root", root, "--json"],
      outside,
    );
    expect(success.exit).toBe(0);
    expect(success.json()).toMatchObject({
      checkCid: artifact.cid,
      result: { pass: true },
    });
    expect(observe).toHaveBeenNthCalledWith(
      1,
      { userHome: home, repoRoot: root },
      { operation: { mode: "project" } },
    );
    expect((await cli(["check-project", "--json"], root)).exit).toBe(1);
    expect((await repositoryModule.readProject(root)).ideas.size).toBe(0);
  });
  it("reads exact reference content from all four Check Bundles without executing a Check", async () => {
    const home = await controlledHome();
    const { root } = await repository();
    for (const operation of [
      { mode: "lifecycle" as const },
      { mode: "setup" as const },
      { mode: "project" as const },
      { mode: "snapshot" as const, snapshot: "worktree" },
    ]) {
      const report = await host.observe(
        {
          userHome: home,
          ...(operation.mode !== "setup" ? { repoRoot: root } : {}),
          ...(operation.mode === "lifecycle" ? { idea: id } : {}),
        },
        { operation },
      );
      for (const document of report.documents) {
        const content = await cli(["get-reference", document.cid], root);
        expect(content).toMatchObject({
          exit: 0,
          stdout: document.text,
          stderr: "",
        });
        expect(
          (await cli(["get-reference", document.cid, "--json"], root)).json(),
        ).toEqual({ cid: document.cid, content: document.text });
      }
    }
    expect(
      (await cli(["get-reference", (await bundledArtifact()).cid], root)).exit,
    ).toBe(1);
    expect((await cli(["get-reference", "not-a-cid"], root)).exit).toBe(1);
    const cancelled = new AbortController();
    cancelled.abort(new Error("Cancelled reference read"));
    expect(
      (
        await cli(
          ["get-reference", (await bundledArtifact()).cid],
          root,
          cancelled.signal,
        )
      ).exit,
    ).toBe(1);
  }, 20_000);
  it("runs the actual independent candidate bin without a global link and preserves installed legacy paths", async () => {
    const home = await scratch();
    const { root } = await repository({ idea: false });
    const artifact = await bundledArtifact();
    const candidate = files();
    for (const [path, bytes] of candidate)
      if (path === "idea.json" || path === "events.jsonl")
        candidate.set(
          path,
          Buffer.from(
            new TextDecoder()
              .decode(bytes)
              .replaceAll(
                "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3thv36wjgksq4bqppj6bfk3sa",
                artifact.cid,
              ),
          ),
        );
    await materialize(root, candidate);
    await sync(root);
    await repositoryModule.git(root, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const bin = resolve("dist", "bin.js");
    expect(
      (await execute(process.execPath, [bin, "--version"], { cwd: root, env }))
        .stdout,
    ).toBe("0.1.0-rc.1\n");
    expect(
      (await execute(process.execPath, [bin, "--help"], { cwd: root, env }))
        .stdout,
    ).toContain("get-reference");
    const checked = await execute(
      process.execPath,
      [bin, "check-changes", "--json"],
      {
        cwd: root,
        env,
      },
    );
    expect(JSON.parse(checked.stdout) as unknown).toMatchObject({
      result: { pass: true },
    });
    const before = await readFile(
      join(root, ".silvermoon", "i", id, "idea.json"),
      "utf8",
    );
    const report = await execute(
      process.execPath,
      [bin, "check-idea", id, "--json"],
      { cwd: root, env },
    );
    expect(JSON.parse(report.stdout) as unknown).toMatchObject({
      checkCid: artifact.cid,
      result: { problems: [{ code: "global-runtime-ready" }] },
    });
    expect(
      await readFile(join(root, ".silvermoon", "i", id, "idea.json"), "utf8"),
    ).toBe(before);
  }, 20_000);
});
