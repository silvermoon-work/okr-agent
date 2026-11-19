import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import * as device from "../src/device.js";
import * as repositoryModule from "../src/repository.js";
import { bundledArtifact } from "../src/host.js";
import { canonical, digest, gates, idea } from "../src/domain.js";
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
      const replayed = await cli(["event", "replay", id, "--json"], root);
      expect(inventory.exit).toBe(0);
      expect(replayed.exit).toBe(0);
      expect(inventory.json()).toMatchObject({
        ideas: [{ id, state: { level } }],
        observation: {
          scope: "local",
          fresh: false,
          primary: { status: "available" },
        },
      });
      expect(replayed.json()).toMatchObject({
        state: { level },
        observation: {
          scope: "local",
          fresh: false,
          primary: { status: "available" },
        },
      });
      return replayed.json() as { state: { implementation?: string } };
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
    expect(
      (await cli(["event", "replay", id, "--json"], root)).json(),
    ).toMatchObject({
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
    expect((await cli(["whats-next", "--json"], outside)).exit).toBe(0);
    expect((await cli(["whats-next", id, "--json"], outside)).exit).toBe(1);
    expect((await cli(["check", "--json"], outside)).exit).toBe(1);
    absentRoot.mockRestore();
    const { root, remote } = await repository();
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
    vi.spyOn(repositoryModule, "remoteTip").mockResolvedValue(
      await repositoryModule.git(root, ["rev-parse", "origin/main"]),
    );
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
          ["whats-next", id, "--root", root, "--json"],
          outside,
          active.signal,
        )
      ).exit,
    ).toBe(0);
    expect(
      (
        await cli(
          ["check", "--remote", "--root", root, "--json"],
          outside,
          active.signal,
        )
      ).exit,
    ).toBe(0);
    active.abort(new Error("Cancelled CLI observation"));
    expect(
      (await cli(["check", "--root", root, "--json"], outside, active.signal))
        .exit,
    ).toBe(1);
  }, 20_000);
  it("supports help/version and rejects removed commands, output --language and conflicting flags before writes", async () => {
    const root = await scratch();
    expect(await cli(["--version"], root)).toMatchObject({
      exit: 0,
      stdout: "0.1.0-rc.1\n",
    });
    expect((await cli(["--help"], root)).stdout).toContain("whats-next");
    for (const argv of [
      [],
      ["reference", "x"],
      ["migrate"],
      ["whats-next", "--language", "zh-CN"],
      ["--audience", "robot", "whats-next"],
      ["--json", "--audience=agent", "create-idea"],
    ])
      expect((await cli(argv, root)).exit).toBe(2);
    expect((await cli(["check", "--worktree", "--staged"], root)).exit).toBe(2);
    expect((await cli(["event", "append", id], root)).exit).toBe(2);
  });
  it("renders identical human/agent/JSON business facts and distinguishes snapshot validity from lifecycle gaps", async () => {
    await controlledHome();
    const { root } = await repository();
    await repositoryModule.git(root, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    for (const audience of ["human", "agent"]) {
      const current = await cli(
        ["whats-next", "--audience", audience, "--root", root],
        root,
      );
      expect(current.exit).toBe(0);
      expect(current.stdout).toContain("## environment-runtime");
      expect(current.stdout).toContain("Documentation");
    }
    const structured = await cli(["whats-next", "--json"], root);
    expect(structured.exit).toBe(0);
    expect(structured.json()).toMatchObject({
      schema: "silvermoon/v2",
      result: { pass: false, problems: [{ code: "environment-runtime" }] },
    });
    const snapshot = await cli(["check", "--worktree", "--json"], root);
    expect(snapshot.exit).toBe(0);
    expect(snapshot.json()).toMatchObject({ result: { pass: true } });
    expect(
      (await cli(["check", "--staged", "--audience", "agent"], root)).exit,
    ).toBe(0);
    const head = await repositoryModule.git(root, ["rev-parse", "HEAD"]);
    expect((await cli(["check", "--commit", head, "--json"], root)).exit).toBe(
      0,
    );
    await writeFile(join(root, ".silvermoon", "config.yaml"), "version: 999");
    expect((await cli(["check", "--worktree", "--json"], root)).exit).toBe(1);
    expect((await cli(["whats-next", "missing", "--json"], root)).exit).toBe(1);
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
    expect(
      (await cli(["event", "replay", "searchable", "--json"], root)).json(),
    ).toMatchObject({ idea: id, state: { alias: "searchable" } });
  }, 20_000);
  it("creates with content language only and appends/replays exact facts through the retained namespace", async () => {
    await controlledHome();
    const { root, remote } = await repository({ idea: false });
    const actualPrimary = repositoryModule.primary;
    vi.spyOn(repositoryModule, "primary").mockImplementation((project) =>
      actualPrimary(project, { fetch: false, localRemote: remote }),
    );
    const created = await cli(
      ["create-idea", "--language", "fr-FR", "--json"],
      root,
    );
    expect(created.exit).toBe(0);
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
    const input = join(await scratch(), "event.json");
    await writeFile(
      input,
      canonical(event({ type: "setAlias", alias: "cli-created" })),
    );
    const tip = await repositoryModule.git(root, ["rev-parse", "origin/main"]);
    expect(
      (
        await cli(
          [
            "event",
            "append",
            result.id,
            "--input",
            input,
            "--expected-digest",
            digest(current.eventSource),
            "--expected-primary",
            tip,
            "--json",
          ],
          root,
        )
      ).json(),
    ).toMatchObject({ idempotent: false });
    const replayed = await cli(
      ["event", "replay", "cli-created", "--json"],
      root,
    );
    const state = replayed.json() as { cursor: string };
    expect(
      (
        await cli(
          ["event", "replay", result.id, "--cursor", state.cursor, "--json"],
          root,
        )
      ).json(),
    ).toMatchObject({ events: [] });
    const unchanged = await repositoryModule.readProject(root);
    expect(unchanged.ideas.size).toBe(1);
    expect(
      (await cli(["--json", "--audience", "agent", "create-idea"], root)).exit,
    ).toBe(2);
    expect((await repositoryModule.readProject(root)).ideas.size).toBe(1);
  }, 20_000);
  it("runs the actual independent candidate bin without a global link and preserves installed legacy paths", async () => {
    const home = await scratch();
    const { root } = await repository();
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
    ).toContain("event");
    const checked = await execute(process.execPath, [bin, "check", "--json"], {
      cwd: root,
      env,
    });
    expect(JSON.parse(checked.stdout) as unknown).toMatchObject({
      result: { pass: true },
    });
    const before = await readFile(
      join(root, ".silvermoon", "i", id, "idea.json"),
      "utf8",
    );
    const report = await execute(
      process.execPath,
      [bin, "whats-next", id, "--json"],
      { cwd: root, env },
    );
    expect(JSON.parse(report.stdout) as unknown).toMatchObject({
      checkCid: artifact.cid,
      result: { problems: [{ code: "environment-runtime" }] },
    });
    expect(
      await readFile(join(root, ".silvermoon", "i", id, "idea.json"), "utf8"),
    ).toBe(before);
  }, 20_000);
});
