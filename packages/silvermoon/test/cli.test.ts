import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderReport, runCli } from "../src/cli.js";
import * as device from "../src/device.js";
import * as repository from "../src/repository.js";
import * as host from "../src/host.js";
import * as writer from "../src/write.js";
import { idea, reduce, SilvermoonError } from "../src/domain.js";
import { add, cid, event, files, head, id } from "./fixtures.js";
import { bootstrapBytes, localSnapshot, project } from "./snapshots.js";

vi.mock("../src/device.js", () => ({
  currentDevice: vi.fn(),
  deviceLanguage: vi.fn(),
}));
vi.mock("../src/host.js", () => ({
  observe: vi.fn(),
  getReference: vi.fn(),
  bundledArtifact: vi.fn(),
}));
vi.mock("../src/write.js", () => ({ createIdea: vi.fn() }));
vi.mock("../src/repository.js", async (importOriginal) => ({
  ...(await importOriginal<typeof repository>()),
  discoverRoot: vi.fn(),
  readProject: vi.fn(),
  readRegular: vi.fn(),
  protectedPath: vi.fn(),
  git: vi.fn(),
  localContext: vi.fn(),
  localIdeaState: vi.fn(),
}));
const root = resolve(".test-work", "cli");
const home = resolve(".test-work", "home");
let current: repository.Project;
let report: host.Report;
beforeEach(() => {
  vi.resetAllMocks();
  current = project(root);
  report = {
    schema: "silvermoon/v2",
    checkCid: cid,
    target: { userHome: home, repoRoot: root, idea: id },
    result: { pass: true, documentation: "task-document", references: [] },
    documents: [{ cid: "task-document", text: "# Task\n\nInternal schema" }],
  };
  vi.mocked(device.currentDevice).mockReturnValue({
    home,
    entry: "controlled",
    path: "controlled",
  });
  vi.mocked(device.deviceLanguage).mockResolvedValue(undefined);
  vi.mocked(repository.discoverRoot).mockResolvedValue(root);
  vi.mocked(repository.readProject).mockImplementation(() =>
    Promise.resolve(current),
  );
  vi.mocked(repository.readRegular).mockResolvedValue(bootstrapBytes(current));
  vi.mocked(repository.protectedPath).mockResolvedValue(undefined);
  vi.mocked(repository.git).mockResolvedValue(head);
  vi.mocked(repository.localContext).mockResolvedValue(localSnapshot(current));
  vi.mocked(repository.localIdeaState).mockImplementation(
    (_project, selected) =>
      Promise.resolve(reduce(selected, { head, primary: selected })),
  );
  vi.mocked(host.observe).mockImplementation(() => Promise.resolve(report));
  vi.mocked(host.bundledArtifact).mockResolvedValue({
    cid,
    path: "controlled",
  });
  vi.mocked(host.getReference).mockResolvedValue("# Exact reference\n");
  vi.mocked(writer.createIdea).mockResolvedValue({
    id,
    checkCid: cid,
    path: root,
  });
});
async function cli(args: string[], signal?: AbortSignal) {
  let stdout = "",
    stderr = "";
  const exit = await runCli(args, {
    cwd: root,
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

describe("CLI parsing and dispatch with controlled host boundaries", () => {
  it("renders pass only and failure rules with deduplicated guidance, not internal Task parameters", () => {
    expect(renderReport(report)).toBe("pass\n");
    const failure: host.Report = {
      ...report,
      result: {
        pass: false,
        documentation: "task-document",
        references: [
          { checkpoint: "global", documentation: "checkpoint-document" },
        ],
        problems: [
          {
            checkpoint: "global",
            code: "global-skill-linked",
            brief: "Link personal skill",
          },
          {
            checkpoint: "global",
            code: "global-configuration-valid",
            brief: "Fix configuration",
          },
          {
            checkpoint: "global",
            code: "global-skill-linked",
            brief: "Stale installation",
          },
        ],
      },
      documents: [
        ...report.documents,
        {
          cid: "checkpoint-document",
          text: "# Device\n## Rules\nRepair the skill link.",
        },
      ],
    };
    const text = renderReport(failure);
    expect(text).toContain(
      "Failed rules: global-skill-linked, global-configuration-valid\n",
    );
    expect(text).toContain("Checkpoint: global");
    expect(text).toContain("Stale installation");
    expect(text).toContain("Repair the skill link");
    expect(text).not.toContain("Internal schema");
    expect(text).not.toContain("task-document");
    expect(
      renderReport({
        ...failure,
        result: { pass: false, documentation: "", references: [] },
      }),
    ).toContain("Failed rules:");
  });
  it.each(
    [
      [],
      ["removed-command"],
      ["signoff"],
      ["verify"],
      ["check-idea"],
      ["check-idea", id, "--language", "fr-FR"],
      ["check-idea", id, "--json", "--audience", "agent"],
      ["check-changes", "--staged", "--worktree"],
      ["check-changes", "--staged", "--commit", head],
      ["check-changes", "--allow-delete", "bad"],
      ["check-changes", "--allow-delete", id, "--allow-delete", id],
      ["check-setup", "--root", root],
      ["create-idea", "--audience", "invalid"],
    ].map((args) => ({ args })),
  )("rejects invalid usage $args before writes", async ({ args }) => {
    expect((await cli(args)).exit).toBe(2);
    expect(writer.createIdea).not.toHaveBeenCalled();
    expect(host.observe).not.toHaveBeenCalled();
  });
  it.each(["--version", "--help"])(
    "supports %s without host/device prerequisites",
    async (arg) => {
      const output = await cli([arg]);
      expect(output.exit).toBe(0);
      expect(output.stdout).toContain(
        arg === "--version" ? "0.1.0-rc.3" : "check-setup",
      );
      expect(host.observe).not.toHaveBeenCalled();
    },
  );
  it("dispatches setup without discovering Git and reports failed readiness as exit 1", async () => {
    expect((await cli(["check-setup", "--json"])).json()).toEqual(report);
    expect(repository.discoverRoot).not.toHaveBeenCalled();
    expect(host.observe).toHaveBeenCalledWith(
      { userHome: home },
      { operation: { mode: "setup" } },
    );
    report = {
      ...report,
      result: {
        ...report.result,
        pass: false,
        problems: [
          {
            code: "global-runtime-ready",
            brief: "Missing",
            checkpoint: "global",
          },
        ],
      },
    };
    expect((await cli(["check-setup"])).exit).toBe(1);
  });
  it("dispatches project independently and rejects missing repository context", async () => {
    await cli(["check-project", "--json"]);
    expect(host.observe).toHaveBeenCalledWith(
      { userHome: home, repoRoot: root },
      { operation: { mode: "project" } },
    );
    vi.mocked(repository.discoverRoot).mockResolvedValueOnce(undefined);
    const output = await cli(["check-project"]);
    expect(output.exit).toBe(1);
    expect(output.stderr).toContain("target-context");
  });
  it("checks exact ID/bootstrap CID or alias and emits identical human/agent business facts", async () => {
    const human = await cli(["check-idea", id]);
    const agent = await cli(["check-idea", id, "--audience", "agent"]);
    expect(human.stdout).toBe(agent.stdout);
    expect(host.observe).toHaveBeenCalledWith(
      { userHome: home, repoRoot: root, idea: id },
      { cid },
    );
    expect(repository.readProject).not.toHaveBeenCalled();
    current = project(
      root,
      add(files(), event({ type: "setAlias", alias: "shortcut" })),
    );
    expect((await cli(["check-idea", "shortcut", "--json"])).json()).toEqual(
      report,
    );
    expect(repository.readProject).toHaveBeenCalled();
    vi.mocked(repository.discoverRoot).mockResolvedValueOnce(undefined);
    expect((await cli(["check-idea", id])).stderr).toContain("target-context");
    expect((await cli(["check-idea", "missing"])).stderr).toContain("selector");
  });
  it.each([
    { args: [], snapshot: "worktree" },
    { args: ["--worktree"], snapshot: "worktree" },
    { args: ["--staged"], snapshot: "staged" },
    { args: ["--commit", head], snapshot: head },
  ])(
    "selects snapshot $snapshot explicitly, including authorized whole deletions",
    async ({ args, snapshot }) => {
      const signal = new AbortController().signal;
      await cli(
        [
          "check-changes",
          ...args,
          "--root",
          root,
          "--allow-delete",
          id,
          "--json",
        ],
        signal,
      );
      expect(host.observe).toHaveBeenCalledWith(
        { userHome: home, repoRoot: root },
        {
          operation: { mode: "snapshot", snapshot, allowDelete: [id] },
          signal,
        },
      );
      expect(repository.discoverRoot).not.toHaveBeenCalled();
      report = { ...report, result: { ...report.result, pass: false } };
      expect((await cli(["check-changes", ...args])).exit).toBe(1);
    },
  );
  it("creates only after project prerequisites and reports effective/scaffold language", async () => {
    const signal = new AbortController().signal;
    const output = await cli(
      ["create-idea", "--language", "fr-FR", "--json"],
      signal,
    );
    expect(host.observe).toHaveBeenCalledWith(
      { userHome: home, repoRoot: root },
      { operation: { mode: "project" }, signal },
    );
    expect(writer.createIdea).toHaveBeenCalledWith(root, cid, {
      language: "fr-FR",
      signal,
    });
    expect(output.json()).toMatchObject({
      id,
      contentLanguage: "zh-CN",
      scaffoldLanguage: "en-US",
      scaffoldFallback: true,
    });
    report = { ...report, result: { ...report.result, pass: false } };
    vi.mocked(writer.createIdea).mockClear();
    expect((await cli(["create-idea", "--json"])).exit).toBe(1);
    expect(writer.createIdea).not.toHaveBeenCalled();
  });
  it("reads reference content without executing a Check, in text or JSON", async () => {
    expect((await cli(["get-reference", cid])).stdout).toBe(
      "# Exact reference\n",
    );
    expect((await cli(["get-reference", cid, "--json"])).json()).toEqual({
      cid,
      content: "# Exact reference\n",
    });
    expect(host.observe).not.toHaveBeenCalled();
    vi.mocked(host.getReference).mockRejectedValueOnce(
      new Error("unavailable"),
    );
    expect((await cli(["get-reference", cid])).stderr).toContain("execution");
  });
  it("keeps host faults, immutable Check identity and cancellation distinct", async () => {
    vi.mocked(host.observe).mockRejectedValueOnce(
      new SilvermoonError("untrusted-check", "pinned CID unavailable"),
    );
    expect((await cli(["check-idea", id])).stderr).toContain("untrusted-check");
    const signal = AbortSignal.abort(new Error("cancelled"));
    vi.mocked(host.observe).mockRejectedValueOnce(new Error("cancelled"));
    expect((await cli(["check-idea", id], signal)).stderr).toContain(
      "cancelled",
    );
  });
  it("queries new inventory with local/nonfresh observation and bounded literal filters, never fetches", async () => {
    const second = "2026111816097a2f";
    const secondFiles = new Map(
      [...files()].map(([path, bytes]) => [
        path,
        Buffer.from(
          new TextDecoder()
            .decode(bytes)
            .replaceAll(id, second)
            .replaceAll("2026-11-17", "2026-11-18"),
        ),
      ]),
    );
    current = {
      ...current,
      ideas: new Map([
        [
          id,
          idea(add(files(), event({ type: "setAlias", alias: "first" })), id),
        ],
        [second, idea(secondFiles, second)],
      ]),
    };
    expect(
      (await cli(["list-ideas", "--all", "--sort", "oldest", "--json"])).json(),
    ).toMatchObject({
      ideas: [{ id }, { id: second }],
      observation: { scope: "local", fresh: false },
    });
    expect(
      (await cli(["list-ideas", "--limit", "1", "--json"])).json(),
    ).toMatchObject({ ideas: [{ id: second }] });
    expect(
      (
        await cli([
          "list-ideas",
          "--query",
          "FIRST",
          "--state",
          "requirements",
          "--json",
        ])
      ).json(),
    ).toMatchObject({ ideas: [{ id }] });
    expect(
      (
        await cli([
          "list-ideas",
          "--created-after",
          "2026-11-18T00:00:00Z",
          "--created-before",
          "2026-11-19T00:00:00Z",
          "--json",
        ])
      ).json(),
    ).toMatchObject({ ideas: [{ id: second }] });
    expect(
      (await cli(["list-ideas", "--query", ".*", "--json"])).json(),
    ).toMatchObject({ ideas: [] });
    expect(repository.git).not.toHaveBeenCalled();
  });
  it.each(
    [
      ["--limit", "0"],
      ["--limit", "01"],
      ["--limit", "1.5"],
      ["--created-after", "yesterday"],
      ["--created-before", "invalid"],
      [
        "--created-after",
        "2026-11-19T00:00:00Z",
        "--created-before",
        "2026-11-18T00:00:00Z",
      ],
    ].map((args) => ({ args })),
  )("rejects invalid inventory filter $args", async ({ args }) => {
    expect((await cli(["list-ideas", ...args])).exit).toBe(2);
  });
  it("hides abandoned/completed by default and preserves unknown primary diagnostics", async () => {
    vi.mocked(repository.localIdeaState).mockResolvedValueOnce({
      ...reduce(current.ideas.get(id)!, { head }),
      level: "completed",
    });
    expect((await cli(["list-ideas", "--json"])).json()).toMatchObject({
      ideas: [],
    });
    vi.mocked(repository.localIdeaState).mockResolvedValueOnce({
      ...reduce(current.ideas.get(id)!, { head }),
      abandoned: true,
      level: "abandoned",
    });
    expect((await cli(["list-ideas", "--json"])).json()).toMatchObject({
      ideas: [],
    });
    vi.mocked(repository.localContext).mockResolvedValue({
      observation: {
        scope: "local",
        fresh: false,
        primary: { status: "unavailable", diagnostic: "fetch explicitly" },
      },
    });
    vi.mocked(repository.localIdeaState).mockResolvedValue({
      ...reduce(current.ideas.get(id)!, { head }),
      level: "unknown",
    });
    expect(
      (
        await cli(["list-ideas", "--all", "--state", "unknown", "--json"])
      ).json(),
    ).toMatchObject({
      ideas: [{ state: { level: "unknown" } }],
      observation: { primary: { diagnostic: "fetch explicitly" } },
    });
  });
});
