import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCheck, type ReportNode } from "@silvermoon-work/check-task-sdk";
import { silvermoonCheckpoints } from "../src/check.js";
import { projectCheckpoints } from "../src/project-check.js";
import { setupCheckpoints } from "../src/setup-check.js";
import * as repository from "../src/repository.js";
import * as device from "../src/device.js";
import { consensusRuleCodes } from "../src/contract.js";
import {
  reduce,
  SilvermoonError,
  gates,
  idea,
  type State,
} from "../src/domain.js";
import { add, cid, event, head, id, scratch } from "./fixtures.js";
import {
  files,
  signed,
  sign,
  pairedEvent,
  deployed,
} from "./paired-fixtures.js";
import { configText, project } from "./snapshots.js";

vi.mock("../src/device.js", async (importOriginal) => ({
  ...(await importOriginal<typeof device>()),
  deviceLanguage: vi.fn(),
  inspectInstallation: vi.fn(),
  inspectPersonalSkill: vi.fn(),
}));
vi.mock("../src/repository.js", async (importOriginal) => ({
  ...(await importOriginal<typeof repository>()),
  git: vi.fn(),
  verifyRepositoryRoot: vi.fn(),
  readRepository: vi.fn(),
  observeRepository: vi.fn(),
  readIdeaProject: vi.fn(),
  observedIdeaState: vi.fn(),
  regular: vi.fn(),
  readRegular: vi.fn(),
  absent: vi.fn(),
  preCommitHookPath: vi.fn(),
}));
const root = resolve(".test-work", "checkpoints");
const home = resolve(".test-work", "home");
const target = { userHome: home, repoRoot: root, idea: id };
const runtime = { entry: "controlled", path: process.cwd() };
let current: repository.Project;
let observed: repository.RepositoryObservation;
const hook =
  "#!/bin/sh\n# BEGIN Silvermoon check-changes\nsilvermoon check-changes --staged --audience agent || exit $?\n# END Silvermoon check-changes\n";
beforeEach(async () => {
  vi.resetAllMocks();
  current = project(root, files());
  observed = {
    head,
    tip: head,
    remote: "origin",
    repository: current,
    changes: [],
  };
  vi.mocked(device.deviceLanguage).mockResolvedValue(undefined);
  vi.mocked(device.inspectInstallation).mockResolvedValue(root);
  vi.mocked(device.inspectPersonalSkill).mockResolvedValue(undefined);
  vi.mocked(repository.verifyRepositoryRoot).mockResolvedValue(undefined);
  vi.mocked(repository.git).mockImplementation(async (_root, args) => {
    await Promise.resolve();
    if (args[0] === "status") return "";
    if (args[0] === "symbolic-ref") return "main";
    if (args.includes("@{upstream}")) return "origin/main";
    if (args[0] === "rev-parse") return head;
    throw new Error(`Unprepared query: ${args.join(" ")}`);
  });
  vi.mocked(repository.readRepository).mockImplementation(() =>
    Promise.resolve(current),
  );
  vi.mocked(repository.observeRepository).mockImplementation(() =>
    Promise.resolve(observed),
  );
  vi.mocked(repository.readIdeaProject).mockImplementation(() =>
    Promise.resolve(current),
  );
  vi.mocked(repository.observedIdeaState).mockImplementation(
    (_project, selected) =>
      Promise.resolve(
        reduce(selected, { head, primary: selected, paired: true }),
      ),
  );
  vi.mocked(repository.regular).mockResolvedValue(undefined);
  vi.mocked(repository.absent).mockResolvedValue(false);
  vi.mocked(repository.readRegular).mockImplementation((path) =>
    Promise.resolve(
      Buffer.from(path.endsWith("pre-commit") ? hook : configText),
    ),
  );
  const directory = await scratch();
  const path = join(directory, "pre-commit");
  await writeFile(path, hook, { mode: 0o755 });
  vi.mocked(repository.preCommitHookPath).mockResolvedValue(path);
});
async function run(after?: (node: ReportNode) => void) {
  const nodes: ReportNode[] = [];
  const report = await executeCheck({
    checkpoints: silvermoonCheckpoints(cid, { runtime, refresh: false }),
    target,
    signal: new AbortController().signal,
    log: (node) => {
      nodes.push(node);
      after?.(node);
      return Promise.resolve();
    },
  });
  return { ...report, nodes };
}
function projectRun() {
  return executeCheck({
    checkpoints: projectCheckpoints({ runtime, refresh: false }),
    target: { userHome: home, repoRoot: root },
    signal: new AbortController().signal,
  });
}
function state(value: Partial<State>) {
  vi.mocked(repository.observedIdeaState).mockResolvedValue({
    ...reduce(idea(signed(), id), { head, primary: idea(signed(), id) }),
    ...value,
  });
}

describe("ordered checkpoint rules with mocked repository/device observations", () => {
  it("runs setup outside Git and project independently of any Idea or scaffold writes", async () => {
    const setup = await executeCheck({
      checkpoints: setupCheckpoints(runtime),
      target: { userHome: home },
      signal: new AbortController().signal,
    });
    expect(setup.pass).toBe(true);
    expect(repository.git).not.toHaveBeenCalled();
    expect((await projectRun()).pass).toBe(true);
    expect(repository.readIdeaProject).not.toHaveBeenCalled();
    expect(repository.preCommitHookPath).toHaveBeenCalled();
  });
  it("advances every paired consensus through request, acceptance and synchronized observations", async () => {
    let source = files();
    for (const gate of gates) {
      current = project(root, source);
      expect(await run()).toMatchObject({
        problems: [{ code: consensusRuleCodes[gate] }],
      });
      source = sign(source, gate);
    }
    current = project(root, source);
    expect(await run()).toMatchObject({
      problems: [{ code: "implementation-evidence-valid" }],
    });
    source = add(
      source,
      pairedEvent({ type: "verify", phase: "implementation", rev: head }),
    );
    current = project(root, source);
    expect(await run()).toMatchObject({
      problems: [{ code: "deployment-evidence-valid" }],
    });
    source = deployed(source, head);
    current = project(root, source);
    expect(await run()).toMatchObject({
      problems: [{ code: "user-acceptance-confirmed" }],
    });
    source = sign(source, "user-acceptance");
    current = project(root, source);
    expect((await run()).pass).toBe(true);
    source.set("technical/design.md", Buffer.from("Changed signed design"));
    current = project(root, source);
    expect(await run()).toMatchObject({
      problems: [{ code: "technical-consensus-confirmed" }],
    });
  });
  it.each(gates)(
    "attributes %s synchronization to its owning checkpoint",
    async (gate) => {
      state({ level: "synchronization", next: gate });
      expect(await run()).toMatchObject({
        problems: [
          {
            code: `${gate === "cases" ? "test-index" : gate === "tests" ? "test-cases" : gate}-synchronized`,
          },
        ],
      });
    },
  );
  it.each([
    ["implementation", undefined, "implementation-evidence-valid"],
    ["implementation", head, "implementation-synchronized"],
    ["deployment", undefined, "deployment-evidence-valid"],
    ["deployment", "sha256:report", "deployment-synchronized"],
    ["user-acceptance", undefined, "user-acceptance-confirmed"],
    ["synchronization", undefined, "user-acceptance-synchronized"],
  ] as const)(
    "distinguishes %s facts from synchronization",
    async (level, evidence, code) => {
      state({
        level,
        ...(level === "synchronization" ? { next: "user-acceptance" } : {}),
        ...(level === "implementation" && evidence
          ? { implementation: evidence }
          : {}),
        ...(level === "deployment" && evidence ? { deployment: evidence } : {}),
      });
      expect(await run()).toMatchObject({ problems: [{ code }] });
    },
  );
  it.each(["implementation", "deployment", "user-acceptance"] as const)(
    "rechecks cleanliness immediately before %s",
    async (phase) => {
      state({ level: "completed" });
      const stages = {
        implementation: "test-cases",
        deployment: "implementation",
        "user-acceptance": "deployment",
      };
      const normal = vi.mocked(repository.git).getMockImplementation()!;
      await expect(
        run((node) => {
          if (node.checkpoint === stages[phase])
            vi.mocked(repository.git).mockImplementation(
              (root, args, signal) =>
                args[0] === "status"
                  ? Promise.resolve(" M source.txt")
                  : normal(root, args, signal),
            );
        }),
      ).resolves.toMatchObject({
        problems: [{ code: `${phase}-synchronized` }],
      });
    },
  );
  it("prunes prerequisites and collects independent environment problems", async () => {
    vi.mocked(device.deviceLanguage).mockRejectedValueOnce(
      new SilvermoonError("configuration", "invalid config"),
    );
    vi.mocked(device.inspectPersonalSkill).mockRejectedValueOnce(
      new SilvermoonError("device", "missing skill"),
    );
    expect(await run()).toMatchObject({
      problems: [
        { code: "global-configuration-valid" },
        { code: "global-skill-linked" },
      ],
    });
    expect(repository.git).not.toHaveBeenCalled();
    vi.mocked(device.inspectInstallation).mockRejectedValueOnce(
      new SyntaxError("manifest"),
    );
    expect(await run()).toMatchObject({
      problems: [{ code: "global-runtime-ready" }],
    });
  });
  it.each(["configuration", "installation", "skill"] as const)(
    "propagates unexpected device %s faults",
    async (kind) => {
      const error = Object.assign(new Error("device fault"), { code: "EIO" });
      const fn =
        kind === "configuration"
          ? device.deviceLanguage
          : kind === "installation"
            ? device.inspectInstallation
            : device.inspectPersonalSkill;
      vi.mocked(fn).mockRejectedValueOnce(error);
      await expect(run()).rejects.toThrow(/device fault/);
    },
  );
  it("distinguishes root, detached branch, upstream and cleanliness failures", async () => {
    vi.mocked(repository.verifyRepositoryRoot).mockRejectedValueOnce(
      new SilvermoonError("root", "not root"),
    );
    expect(await run()).toMatchObject({
      problems: [{ code: "repository-root-valid" }],
    });
    const normal = vi.mocked(repository.git).getMockImplementation()!;
    vi.mocked(repository.git)
      .mockImplementationOnce(normal)
      .mockRejectedValueOnce(Object.assign(new Error("detached"), { code: 1 }));
    expect(await run()).toMatchObject({
      problems: [{ code: "repository-branch-attached" }],
    });
    vi.mocked(repository.git).mockImplementation((root, args, signal) =>
      args[0] === "status"
        ? Promise.resolve("?? new")
        : normal(root, args, signal),
    );
    expect(await run()).toMatchObject({
      problems: [{ code: "repository-worktree-clean" }],
    });
    vi.mocked(repository.git).mockImplementation((root, args, signal) =>
      args.includes("@{upstream}")
        ? Promise.reject(Object.assign(new Error("missing"), { code: 128 }))
        : normal(root, args, signal),
    );
    expect(await run()).toMatchObject({
      problems: [{ code: "branch-upstream-aligned" }],
    });
  });
  it.each(["primary", "primary-branch-missing"] as const)(
    "maps %s rules without disguising transport errors",
    async (code) => {
      vi.mocked(repository.observeRepository).mockRejectedValueOnce(
        new SilvermoonError(code, "unmet"),
      );
      expect(await run()).toMatchObject({
        problems: [
          {
            code:
              code === "primary"
                ? "branch-upstream-aligned"
                : "branch-primary-present",
          },
        ],
      });
      vi.mocked(repository.observeRepository).mockRejectedValueOnce(
        new Error("transport"),
      );
      await expect(run()).rejects.toThrow(/transport/);
    },
  );
  it.each(["git-context", "concurrent-edit", "git-status"] as const)(
    "propagates branch %s faults",
    async (code) => {
      vi.mocked(repository.observeRepository).mockRejectedValueOnce(
        new SilvermoonError(code, "fault"),
      );
      await expect(run()).rejects.toThrow(/fault/);
    },
  );
  it("reports behind branches but throws on concurrent observation changes", async () => {
    observed = { ...observed, tip: "b".repeat(40) };
    expect(await run()).toMatchObject({
      problems: [{ code: "branch-primary-synchronized" }],
    });
    observed = { ...observed, changes: ["source.txt"] };
    await expect(run()).rejects.toThrow(/changed during checkpoint/);
  });
  it.each([
    new SilvermoonError("configuration", "bad config"),
    new SyntaxError("bad config"),
    new TypeError("bad config"),
    Object.assign(new Error("missing"), { code: "ENOENT" }),
  ])("reports branch configuration data failures", async (error) => {
    vi.mocked(repository.readRepository).mockRejectedValueOnce(error);
    expect(await run()).toMatchObject({
      problems: [{ code: "branch-silvermoon-config-valid" }],
    });
  });
  it.each(["root", "git-context", "concurrent-edit"] as const)(
    "propagates configuration read %s faults",
    async (code) => {
      vi.mocked(repository.readRepository).mockRejectedValueOnce(
        new SilvermoonError(code, "fault"),
      );
      await expect(run()).rejects.toThrow(/fault/);
    },
  );
  it.each(["directory", "config", "ideas"] as const)(
    "reports invalid %s layout and propagates IO faults",
    async (kind) => {
      const code =
        kind === "directory"
          ? "silvermoon-folder-path-valid"
          : kind === "config"
            ? "silvermoon-folder-config-file-valid"
            : "silvermoon-folder-ideas-directory-valid";
      if (kind === "config")
        vi.mocked(repository.readRegular).mockRejectedValueOnce(
          new SilvermoonError("path", "invalid file"),
        );
      else
        vi.mocked(repository.regular).mockImplementation(async (path) => {
          await Promise.resolve();
          if (
            kind === "directory"
              ? path.endsWith(".silvermoon")
              : path.endsWith("i")
          )
            throw new SilvermoonError("path", "invalid directory");
        });
      expect(await run()).toMatchObject({ problems: [{ code }] });
      vi.mocked(repository.regular).mockResolvedValue(undefined);
      vi.mocked(repository.readRegular).mockRejectedValueOnce(
        new Error("IO fault"),
      );
      await expect(run()).rejects.toThrow(/IO fault/);
    },
  );
  it.each([
    "identity",
    "history",
    "report-history",
    "events",
    "protocol",
    "concurrent-edit",
    "git-context",
    "internal",
  ] as const)("preserves Idea %s classification", async (code) => {
    vi.mocked(repository.readIdeaProject).mockRejectedValueOnce(
      new SilvermoonError(code, "bad Idea"),
    );
    if (
      ["protocol", "concurrent-edit", "git-context", "internal"].includes(code)
    )
      await expect(run()).rejects.toThrow(/bad Idea/);
    else
      expect(await run()).toMatchObject({
        problems: [
          {
            code:
              code === "identity"
                ? "idea-folder-identity-immutable"
                : code === "history"
                  ? "idea-folder-event-history-append-only"
                  : code === "report-history"
                    ? "idea-folder-deployment-report-append-only"
                    : "idea-folder-data-valid",
          },
        ],
      });
  });
  it("protects immutable executing CID and primary Idea presence, and propagates unexpected faults", async () => {
    vi.mocked(repository.readIdeaProject)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(project(root, null));
    expect(await run()).toMatchObject({
      problems: [{ code: "idea-folder-identity-immutable" }],
    });
    vi.mocked(repository.readIdeaProject).mockRejectedValueOnce(
      new Error("IO fault"),
    );
    await expect(run()).rejects.toThrow(/IO fault/);
    await expect(
      executeCheck({
        checkpoints: silvermoonCheckpoints("different", { runtime }),
        target,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/executing Check CID/);
  });
  it.each([
    new SilvermoonError("evidence", "invalid rev"),
    Object.assign(new Error("invalid rev"), { code: 128 }),
  ])("reports invalid evidence as Idea data", async (error) => {
    vi.mocked(repository.observedIdeaState).mockRejectedValueOnce(error);
    expect(await run()).toMatchObject({
      problems: [{ code: "idea-folder-data-valid" }],
    });
    vi.mocked(repository.observedIdeaState).mockRejectedValueOnce(
      new Error("unexpected"),
    );
    await expect(run()).rejects.toThrow(/unexpected/);
  });
  it("stops abandoned Ideas before consensus", async () => {
    current = project(
      root,
      add(files(), event({ type: "abandon", reason: "stop" })),
    );
    expect(await run()).toMatchObject({
      problems: [{ code: "idea-folder-active" }],
    });
  });
  it.each([
    "#!/bin/sh\n# silvermoon check-changes --staged --audience agent\n",
    "#!/bin/sh\nsilvermoon check-changes --staged --audience agent\nexit 0\n",
    hook.replace(" || exit $?", " || true"),
    hook.replace("--staged", "--worktree"),
  ])("requires the effective fail-closed hook prefix", async (content) => {
    vi.mocked(repository.readRegular).mockImplementation((path) =>
      Promise.resolve(
        Buffer.from(path.endsWith("pre-commit") ? content : configText),
      ),
    );
    expect(await projectRun()).toMatchObject({
      problems: [{ code: "pre-commit-hook-configured" }],
    });
    expect(repository.git).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(["commit"]),
      expect.anything(),
    );
  });
  it("preserves existing hook logic and handles missing, unsafe, corrupt and concurrently edited hooks", async () => {
    vi.mocked(repository.readRegular).mockImplementation((path) =>
      Promise.resolve(
        Buffer.from(
          path.endsWith("pre-commit") ? hook + "echo existing\n" : configText,
        ),
      ),
    );
    expect((await projectRun()).pass).toBe(true);
    const normal = vi.mocked(repository.readRegular).getMockImplementation()!;
    for (const error of [
      Object.assign(new Error("missing"), { code: "ENOENT" }),
      new SilvermoonError("path", "unsafe"),
      new TypeError("encoding"),
    ]) {
      vi.mocked(repository.readRegular).mockImplementation((path, signal) =>
        path.endsWith("pre-commit")
          ? Promise.reject(error)
          : normal(path, signal),
      );
      expect((await projectRun()).pass).toBe(false);
    }
    vi.mocked(repository.readRegular).mockImplementation((path, signal) =>
      path.endsWith("pre-commit")
        ? Promise.reject(new SilvermoonError("concurrent-edit", "changed"))
        : normal(path, signal),
    );
    await expect(projectRun()).rejects.toThrow(/changed/);
  });
});
