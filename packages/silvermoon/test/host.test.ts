import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { delimiter, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { IpfsStore } from "@silvermoon-work/ipfs-store";
import { memoryFile } from "@silvermoon-work/task-builder/tree";
import {
  encodeTaskBundleCar,
  readTaskBundleCar,
} from "@silvermoon-work/task-builder/car";
import { executeCheck, type ReportNode } from "@silvermoon-work/check-task-sdk";
import {
  currentDevice,
  deviceLanguage,
  inspectDevice,
  type Device,
} from "../src/device.js";
import { silvermoonCheckpoints } from "../src/check.js";
import { projectCheckpoints } from "../src/project-check.js";
import { ProjectTarget } from "../src/project-contract.js";
import { SetupTarget } from "../src/setup-contract.js";
import { runCli } from "../src/cli.js";
import {
  Target,
  checkpointIds,
  consensusCheckpointIds,
  consensusRuleCodes,
} from "../src/contract.js";
import {
  bundledArtifact,
  observe as observeTarget,
  readDocument,
} from "../src/host.js";
import {
  canonical,
  digest,
  gates,
  idea,
  reduce,
  SilvermoonError,
  validateAppend,
  type State,
} from "../src/domain.js";
import { createIdea, appendEvent } from "../src/write.js";
import { commitCheckpoints } from "../src/commit-check.js";
import * as deviceReads from "../src/device.js";
import * as repositoryReads from "../src/repository.js";
import { git, selectIdea, readProject } from "../src/repository.js";
import type {
  Operation,
  Runtime,
  Target as TargetValue,
} from "../src/contract.js";

type Request = { target: TargetValue; runtime: Runtime; operation: Operation };
import {
  add,
  batch,
  cid,
  event,
  files,
  id,
  materialize,
  repository,
  scratch,
  signed,
  sign,
  sync,
} from "./fixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function device(): Promise<Device> {
  const directory = await scratch();
  const root = join(directory, "runtime");
  const home = join(directory, "home");
  const path = join(directory, "bin");
  await mkdir(join(root, "dist"), { recursive: true });
  await mkdir(join(root, "skills", "silvermoon"), { recursive: true });
  await mkdir(join(home, ".agents", "skills"), { recursive: true });
  await mkdir(path);
  const entry = join(root, "dist", "bin.js");
  await writeFile(entry, "#!/usr/bin/env node\n", { mode: 0o755 });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "@silvermoon-work/silvermoon",
      bin: { silvermoon: "./dist/bin.js" },
    }),
  );
  await symlink(
    join(root, "skills", "silvermoon"),
    join(home, ".agents", "skills", "silvermoon"),
    "junction",
  );
  if (process.platform === "win32")
    await writeFile(join(path, "silvermoon.cmd"), `@node "${entry}" %*\r\n`);
  else await symlink(entry, join(path, "silvermoon"));
  return { entry, home, path };
}
async function target(
  options: { idea?: boolean } = {},
): Promise<{ target: Request; remote: string }> {
  const { root, remote } = await repository(options);
  await git(root, [
    "remote",
    "set-url",
    "origin",
    "https://github.com/example/project.git",
  ]);
  const current = await device();
  return {
    remote,
    target: {
      target: { userHome: current.home, repoRoot: root, idea: id },
      operation: { mode: "lifecycle", refresh: false },
      runtime: {
        entry: current.entry,
        path: current.path + delimiter + (process.env.PATH ?? ""),
      },
    },
  };
}
function observe(
  request: Request,
  options: Parameters<typeof observeTarget>[1] = {},
) {
  return observeTarget(request.target, {
    operation: request.operation,
    runtime: request.runtime,
    ...options,
  });
}
async function graph(
  target: Request,
  bundle = cid,
  afterCheckpoint?: (node: ReportNode) => Promise<void>,
) {
  const nodes: ReportNode[] = [];
  const options = {
    signal: new AbortController().signal,
    log: async (node: ReportNode) => {
      nodes.push(node);
      await afterCheckpoint?.(node);
    },
  };
  const report =
    target.operation.mode === "snapshot"
      ? await executeCheck({
          ...options,
          checkpoints: commitCheckpoints(target.runtime),
          target: {
            userHome: target.target.userHome,
            repoRoot: target.target.repoRoot,
            snapshot: target.operation.snapshot ?? "HEAD",
          },
        })
      : await executeCheck({
          ...options,
          checkpoints: silvermoonCheckpoints(bundle, {
            runtime: target.runtime,
            refresh: target.operation.refresh ?? true,
          }),
          target: target.target,
        });
  return { ...report, problems: report.pass ? [] : report.problems, nodes };
}
async function projectGraph(input: Request) {
  return executeCheck({
    checkpoints: projectCheckpoints({
      runtime: input.runtime,
      refresh: false,
    }),
    target: {
      userHome: input.target.userHome,
      repoRoot: input.target.repoRoot,
    },
    signal: new AbortController().signal,
  });
}
describe("Ordered checkpoints and the real offline Engine", () => {
  it("runs setup onboarding outside Git without a Git executable and reports missing personal setup", async () => {
    const current = await device();
    vi.spyOn(deviceReads, "currentDevice").mockReturnValue(current);
    const outside = await scratch();
    const discover = vi.spyOn(repositoryReads, "discoverRoot");
    const invoke = async () => {
      let output = "";
      let errors = "";
      const exit = await runCli(["check-setup", "--json"], {
        cwd: outside,
        stdout: {
          write: (value) => {
            output += value;
          },
        },
        stderr: {
          write: (value) => {
            errors += value;
          },
        },
      });
      expect(errors).toBe("");
      return { exit, report: JSON.parse(output) as unknown };
    };
    const artifact = await bundledArtifact("setup");
    expect(await invoke()).toMatchObject({
      exit: 0,
      report: {
        checkCid: artifact.cid,
        target: { userHome: current.home },
        result: { pass: true, references: [] },
      },
    });
    expect(discover).not.toHaveBeenCalled();
    expect(
      Value.Check(SetupTarget, { userHome: current.home, repoRoot: outside }),
    ).toBe(false);
    await expect(
      observeTarget(
        { userHome: current.home, repoRoot: outside },
        {
          operation: { mode: "setup" },
        },
      ),
    ).rejects.toThrow(/userHome only/);
    await rm(join(current.home, ".agents", "skills", "silvermoon"));
    expect(await invoke()).toMatchObject({
      exit: 1,
      report: {
        checkCid: artifact.cid,
        result: {
          pass: false,
          problems: [{ checkpoint: "global", code: "global-skill-linked" }],
        },
      },
    });
    expect(discover).not.toHaveBeenCalled();
  }, 20_000);

  it("executes a separate project CAR with no Idea, no scaffold writes and shared prerequisite diagnostics", async () => {
    const { target: input } = await target({ idea: false });
    const projectTarget = {
      userHome: input.target.userHome,
      repoRoot: input.target.repoRoot,
    };
    const artifact = await bundledArtifact("project");
    const ideaArtifact = await bundledArtifact();
    const commitArtifact = await bundledArtifact("commit");
    const setupArtifact = await bundledArtifact("setup");
    expect(
      new Set([
        artifact.cid,
        ideaArtifact.cid,
        commitArtifact.cid,
        setupArtifact.cid,
      ]).size,
    ).toBe(4);
    const before = await git(projectTarget.repoRoot, ["status", "--porcelain"]);
    const head = await git(projectTarget.repoRoot, ["rev-parse", "HEAD"]);
    const report = await observeTarget(projectTarget, {
      runtime: input.runtime,
      operation: { mode: "project", refresh: false },
    });
    expect(report).toMatchObject({
      checkCid: artifact.cid,
      target: projectTarget,
      result: { pass: true, references: [] },
    });
    expect(report.documents[0]?.text).toContain("项目就绪检查");
    expect(await git(projectTarget.repoRoot, ["status", "--porcelain"])).toBe(
      before,
    );
    expect(await git(projectTarget.repoRoot, ["rev-parse", "HEAD"])).toBe(head);
    await expect(
      lstat(join(projectTarget.repoRoot, ".silvermoon", "i")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(Value.Check(ProjectTarget, input.target)).toBe(false);
    expect(Value.Check(ProjectTarget, projectTarget)).toBe(true);
    await expect(
      observeTarget(projectTarget, {
        runtime: input.runtime,
      }),
    ).rejects.toThrow(/requires.*idea/);
    await expect(
      observeTarget(input.target, {
        operation: { mode: "project", refresh: false },
        runtime: input.runtime,
      }),
    ).rejects.toThrow(/only/);
    await expect(
      observeTarget(projectTarget, {
        operation: { mode: "project", refresh: false },
        runtime: input.runtime,
        artifacts: [ideaArtifact],
      }),
    ).rejects.toThrow(/different task/);

    await writeFile(join(projectTarget.repoRoot, "unrelated.txt"), "preserve");
    const blocked = await observeTarget(projectTarget, {
      runtime: input.runtime,
      operation: { mode: "project", refresh: false },
    });
    expect(blocked).toMatchObject({
      checkCid: artifact.cid,
      result: {
        pass: false,
        problems: [{ code: "repository-worktree-clean" }],
      },
    });
    expect(
      await readFile(join(projectTarget.repoRoot, "unrelated.txt"), "utf8"),
    ).toBe("preserve");
  }, 20_000);

  it("checks the effective pre-commit hook without executing it or accepting commented and fail-open commands", async () => {
    const { target: input } = await target({ idea: false });
    const root = input.target.repoRoot;
    const original = join(root, ".git", "hooks", "pre-commit");
    const prefix = await readFile(original, "utf8");
    const directory = join(await scratch(), "custom hooks");
    await mkdir(directory);
    await git(root, ["config", "core.hooksPath", directory]);
    const hook = join(directory, "pre-commit");
    const projectTarget = {
      userHome: input.target.userHome,
      repoRoot: root,
    };
    const options = {
      runtime: input.runtime,
      operation: { mode: "project" as const, refresh: false },
    };
    const missing = await observeTarget(projectTarget, options);
    expect(missing.result).toMatchObject({
      pass: false,
      problems: [
        { checkpoint: "pre-commit", code: "pre-commit-hook-configured" },
      ],
    });
    expect(
      missing.documents.map((document) => document.text).join("\n"),
    ).toContain(
      "silvermoon check-changes --staged --audience agent || exit $?",
    );
    await expect(lstat(hook)).rejects.toMatchObject({ code: "ENOENT" });
    for (const body of [
      "#!/bin/sh\n# silvermoon check-changes --staged --audience agent\n",
      prefix.replace(" || exit $?", " || true"),
      prefix.replace("--staged", "--worktree"),
    ]) {
      await writeFile(hook, body, { mode: 0o755 });
      expect(await projectGraph(input)).toMatchObject({
        pass: false,
        problems: [{ code: "pre-commit-hook-configured" }],
      });
    }
    const marker = join(directory, "executed");
    const body = prefix + `printf 'must not run' > "${marker}"\n`;
    const installed =
      process.platform === "win32" ? body.replaceAll("\n", "\r\n") : body;
    await writeFile(hook, installed);
    expect((await observeTarget(projectTarget, options)).result.pass).toBe(
      true,
    );
    expect(await readFile(hook, "utf8")).toBe(installed);
    await expect(lstat(marker)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(original, "utf8")).toBe(prefix);

    if (process.platform !== "win32") {
      await chmod(hook, 0o644);
      expect(await projectGraph(input)).toMatchObject({
        pass: false,
        problems: [{ code: "pre-commit-hook-configured" }],
      });
      await chmod(hook, 0o755);
    }
    await writeFile(hook, new Uint8Array([0xff]));
    expect(await projectGraph(input)).toMatchObject({
      pass: false,
      problems: [{ code: "pre-commit-hook-configured" }],
    });
    await rm(hook);
    await symlink(
      process.platform === "win32" ? join(original, "..") : original,
      hook,
      process.platform === "win32" ? "junction" : "file",
    );
    expect(await repositoryReads.preCommitHookPath(root)).toBe(hook);
    expect(await projectGraph(input)).toMatchObject({
      pass: false,
      problems: [{ code: "pre-commit-hook-configured" }],
    });
  }, 30_000);

  it("resolves shared hooks for linked worktrees and relative core.hooksPath without using the inspection override", async () => {
    const { target: input } = await target({ idea: false });
    const root = input.target.repoRoot;
    const linked = join(await scratch(), "linked");
    await git(root, ["worktree", "add", "-b", "linked", linked]);
    await git(linked, ["branch", "--set-upstream-to=origin/main"]);
    const request = {
      ...input,
      target: { ...input.target, repoRoot: linked },
    };
    expect(await projectGraph(request)).toMatchObject({ pass: true });
    await git(linked, [
      "config",
      "core.hooksPath",
      relative(linked, join(root, ".git", "hooks")),
    ]);
    expect(await projectGraph(request)).toMatchObject({ pass: true });
    await git(linked, ["config", "core.hooksPath", "../missing-hooks"]);
    expect(await projectGraph(request)).toMatchObject({
      pass: false,
      problems: [{ code: "pre-commit-hook-configured" }],
    });
  }, 20_000);

  it("propagates hook read faults, concurrent changes and cancellation as execution errors", async () => {
    const { target: input } = await target({ idea: false });
    const read = repositoryReads.readRegular;
    for (const error of [
      Object.assign(new Error("Hook I/O failed"), { code: "EIO" }),
      new SilvermoonError("concurrent-edit", "Hook changed while reading."),
    ]) {
      const spy = vi
        .spyOn(repositoryReads, "readRegular")
        .mockImplementation((path, signal) =>
          path.endsWith("pre-commit")
            ? Promise.reject(error)
            : read(path, signal),
        );
      await expect(projectGraph(input)).rejects.toBe(error);
      spy.mockRestore();
    }
    const controller = new AbortController();
    const cancellation = new Error("Cancelled hook read");
    const spy = vi
      .spyOn(repositoryReads, "readRegular")
      .mockImplementation((path, signal) => {
        if (path.endsWith("pre-commit")) {
          controller.abort(cancellation);
          return Promise.reject(cancellation);
        }
        return read(path, signal);
      });
    await expect(
      executeCheck({
        checkpoints: projectCheckpoints({
          runtime: input.runtime,
          refresh: false,
        }),
        target: {
          userHome: input.target.userHome,
          repoRoot: input.target.repoRoot,
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow("Cancelled hook read");
    spy.mockRestore();
  }, 20_000);

  it("returns project onboarding guidance for a missing config without initializing or creating an Idea", async () => {
    const { target: input, remote } = await target({ idea: false });
    await rm(join(input.target.repoRoot, ".silvermoon", "config.yaml"));
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const before = await git(input.target.repoRoot, ["status", "--porcelain"]);
    const report = await observeTarget(
      {
        userHome: input.target.userHome,
        repoRoot: input.target.repoRoot,
      },
      {
        runtime: input.runtime,
        operation: { mode: "project", refresh: false },
      },
    );
    expect(report).toMatchObject({
      checkCid: (await bundledArtifact("project")).cid,
      result: {
        pass: false,
        problems: [
          { checkpoint: "branch", code: "branch-silvermoon-config-valid" },
        ],
      },
    });
    expect(await git(input.target.repoRoot, ["status", "--porcelain"])).toBe(
      before,
    );
    await expect(
      lstat(join(input.target.repoRoot, ".silvermoon", "config.yaml")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      lstat(join(input.target.repoRoot, ".silvermoon", "i")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("reports a behind branch as an unmet synchronization rule, not an execution fault", async () => {
    const { target: input, remote } = await target();
    const root = input.target.repoRoot;
    const previous = await git(root, ["rev-parse", "HEAD"]);
    await git(root, ["remote", "set-url", "origin", remote]);
    await writeFile(join(root, "source.txt"), "A newer primary commit.\n");
    await sync(root);
    await git(root, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    await git(root, ["switch", "-c", "lagging", previous]);
    await git(root, ["branch", "--set-upstream-to=origin/main", "lagging"]);
    expect(await graph(input)).toMatchObject({
      problems: [{ checkpoint: "branch", code: "branch-primary-synchronized" }],
    });
  });

  it.each(["directory", "config-file", "ideas-directory"] as const)(
    "owns the Silvermoon %s layout condition after repository and branch acceptance",
    async (kind) => {
      const { target: input } = await target();
      const base = join(input.target.repoRoot, ".silvermoon");
      const fault = new SilvermoonError("path", "Unsafe Silvermoon layout");
      if (kind === "config-file")
        vi.spyOn(repositoryReads, "readRegular").mockRejectedValueOnce(fault);
      else {
        const read = repositoryReads.regular;
        vi.spyOn(repositoryReads, "regular").mockImplementation(
          async (path, directory) => {
            if (path === (kind === "directory" ? base : join(base, "i")))
              throw fault;
            await read(path, directory);
          },
        );
      }
      const result = await graph(input);
      expect(result.problems).toMatchObject([
        {
          checkpoint: "silvermoon-folder",
          code:
            kind === "directory"
              ? "silvermoon-folder-path-valid"
              : `silvermoon-folder-${kind}-valid`,
        },
      ]);
      expect(result.nodes.map(({ checkpoint }) => checkpoint)).toEqual([
        "global",
        "repository",
        "branch",
        "silvermoon-folder",
      ]);
    },
  );

  it("completes consensus and evidence using only an owned local primary, then rolls back changed signed content", async () => {
    const { root, remote } = await repository({ idea: false });
    const currentDevice = await device();
    const runtime = {
      entry: currentDevice.entry,
      path: currentDevice.path + delimiter + (process.env.PATH ?? ""),
    };
    const archived = join(
      root,
      ".silvermoon",
      "ideas",
      "INVALID",
      "events.jsonl",
    );
    await mkdir(join(archived, ".."), { recursive: true });
    await writeFile(archived, "Invalid archived content must remain inert.\n");
    await sync(root);
    const before = await readFile(
      join(root, ".silvermoon", "config.yaml"),
      "utf8",
    );
    expect(resolve(await git(root, ["remote", "get-url", "origin"]))).toBe(
      remote,
    );
    const run = (selector?: string, localRemote = remote) => {
      const target = {
        userHome: currentDevice.home,
        repoRoot: root,
        ...(selector ? { idea: selector } : {}),
      };
      return executeCheck({
        checkpoints: selector
          ? silvermoonCheckpoints(cid, { runtime, localRemote })
          : projectCheckpoints({ runtime, localRemote }),
        target,
        signal: new AbortController().signal,
      });
    };
    expect(await run(undefined, join(remote, "not-authorized"))).toMatchObject({
      problems: [{ code: "branch-upstream-aligned" }],
    });
    expect(await run()).toMatchObject({ pass: true });
    const created = await createIdea(root, cid, {
      language: "en-US",
      localRemote: remote,
    });
    expect(created.id).toMatch(/^\d{12}[a-f0-9]{4}$/);
    expect(created.checkCid).toBe(cid);
    await sync(root);
    const put = async (path: string, value: string) => {
      const file = join(created.path, path);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, value);
    };
    const observe = async (code: string) => {
      const result = await run(created.id);
      if (result.pass) throw new Error("Expected an incomplete checkpoint.");
      expect(result.problems.map((problem) => problem.code)).toEqual([code]);
      expect(result.references).toHaveLength(1);
      const facts = JSON.parse(result.problems[0].brief) as Omit<
        State,
        "level" | "next"
      > & {
        eventDigest: string;
        primary: string;
        subject: string;
      };
      expect(facts.contentLanguage).toBe("en-US");
      return facts;
    };
    for (const [index, gate] of gates.entries()) {
      const path =
        gate === "research"
          ? "technical/research.md"
          : gate === "cases"
            ? "tests/cases.json"
            : `${gate}/Spec.md`;
      await put(
        path,
        gate === "cases"
          ? canonical({
              version: 1,
              cases: [
                {
                  id: "I-01",
                  phase: "implementation",
                  environment: "local",
                  subject: "git-head",
                },
                {
                  id: "D-01",
                  phase: "deployment",
                  environment: "deployment",
                  subject: "implementation",
                },
              ],
            })
          : `# ${gate}\n\nProve exact consensus and synchronized evidence using local Git.\n`,
      );
      if (gate === "technical")
        await put("technical/details.md", "Signed support must be covered.\n");
      await sync(root);
      const state = await observe(consensusRuleCodes[gate]);
      await appendEvent(
        root,
        created.id,
        {
          ...event({
            type: "signOff",
            object: gate,
            revision: state.revisions[gate],
            upstream: Object.fromEntries(
              gates
                .slice(0, index)
                .map((prior) => [prior, state.revisions[prior]]),
            ),
          }),
          at: new Date().toISOString(),
        },
        {
          localRemote: remote,
          expectedDigest: state.eventDigest,
          expectedPrimary: state.primary,
          confirmed: true,
        },
      );
      expect(await run(created.id)).toMatchObject({
        problems: [
          { checkpoint: "repository", code: "repository-worktree-clean" },
        ],
      });
      const project = await readProject(root);
      const primary = await readProject(
        root,
        await git(root, ["rev-parse", "origin/main"]),
      );
      expect(
        await repositoryReads.observedIdeaState(
          project,
          selectIdea(project, created.id),
          { head: await git(root, ["rev-parse", "HEAD"]), primary },
        ),
      ).toMatchObject({ level: "synchronization" });
      await sync(root);
    }
    for (const phase of ["implementation", "deployment"] as const) {
      const path = `evidence/${phase}/local.txt`;
      const content = `Local Git checkpoint evidence for ${phase}.\n`;
      await put(path, content);
      await sync(root);
      const state = await observe(`${phase}-evidence-valid`);
      await appendEvent(
        root,
        created.id,
        {
          ...event({
            type: "verify",
            batch: {
              id: `local-${phase}`,
              phase,
              revisions: state.revisions,
              subject: state.subject,
              environment: phase === "implementation" ? "local" : "deployment",
              results: [
                {
                  case: phase === "implementation" ? "I-01" : "D-01",
                  result: "pass",
                  evidence: [{ path, digest: digest(content) }],
                },
              ],
              ...(phase === "deployment"
                ? { implementation: state.implementation }
                : {}),
            },
          }),
          at: new Date().toISOString(),
        },
        {
          localRemote: remote,
          expectedDigest: state.eventDigest,
          expectedPrimary: state.primary,
        },
      );
      await sync(root);
    }
    expect(await run(created.id)).toMatchObject({ pass: true });
    const project = await readProject(root);
    expect(
      await repositoryReads.observedIdeaState(
        project,
        selectIdea(project, created.id),
        { head: await git(root, ["rev-parse", "HEAD"]), primary: project },
      ),
    ).toMatchObject({ level: "completed" });
    await put(
      "technical/details.md",
      "Material revision invalidates signoff.\n",
    );
    await sync(root);
    await observe("technical-consensus-confirmed");
    expect(
      await readFile(join(root, ".silvermoon", "config.yaml"), "utf8"),
    ).toBe(before);
    expect(await readFile(archived, "utf8")).toBe(
      "Invalid archived content must remain inert.\n",
    );
  }, 90_000);

  it("attributes a reducer synchronization gap to its owning consensus checkpoint", async () => {
    const { target: input } = await target();
    const state = reduce(idea(signed(), id), { head: "a".repeat(40) });
    expect(state.level).toBe("synchronization");
    vi.spyOn(repositoryReads, "observedIdeaState").mockResolvedValueOnce(state);
    const result = await graph(input);
    expect(result.problems).toMatchObject([
      { checkpoint: "requirements", code: "requirements-synchronized" },
    ]);
    expect(result.references).toEqual([
      {
        checkpoint: "requirements",
        documentation: "references/checkpoints/requirements.md",
      },
    ]);
    expect(result.nodes.at(-1)?.checkpoint).toBe("requirements");
  });

  it("requires implementation evidence after every exact consensus is synchronized", async () => {
    const { target: input, remote } = await target();
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await materialize(input.target.repoRoot, signed());
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const result = await graph(input);
    expect(result.problems).toMatchObject([
      { checkpoint: "implementation", code: "implementation-evidence-valid" },
    ]);
    expect(result.nodes.at(-1)?.checkpoint).toBe("implementation");
  });

  it.each(["configuration", "installation", "skill"] as const)(
    "does not turn unexpected %s I/O failures into rule violations",
    async (stage) => {
      const { target: input } = await target();
      const error = new Error("Unexpected filesystem failure");
      if (stage === "configuration")
        vi.spyOn(deviceReads, "deviceLanguage").mockRejectedValueOnce(error);
      if (stage === "installation")
        vi.spyOn(deviceReads, "inspectInstallation").mockRejectedValueOnce(
          error,
        );
      if (stage === "skill")
        vi.spyOn(deviceReads, "inspectPersonalSkill").mockRejectedValueOnce(
          error,
        );
      await expect(graph(input)).rejects.toBe(error);
    },
  );

  it.each(["manifest", "missing-entry", "missing-skill", "encoding"] as const)(
    "reports invalid environment %s without entering repository checkpoints",
    async (kind) => {
      const { target: input } = await target();
      if (kind === "manifest")
        await writeFile(
          join(input.runtime.entry, "..", "..", "package.json"),
          "{",
        );
      if (kind === "missing-entry")
        input.runtime.entry = join(await scratch(), "absent");
      if (kind === "missing-skill")
        await rm(
          join(input.runtime.entry, "..", "..", "skills", "silvermoon"),
          { recursive: true },
        );
      if (kind === "encoding") {
        await mkdir(join(input.target.userHome, ".config", "silvermoon"), {
          recursive: true,
        });
        await writeFile(
          join(input.target.userHome, ".config", "silvermoon", "config.yaml"),
          Uint8Array.of(255),
        );
      }
      const observed = await graph(input);
      expect(observed.nodes.at(-1)?.checkpoint).toBe("global");
      expect(observed.problems[0].code).toBe(
        kind === "encoding"
          ? "global-configuration-valid"
          : kind === "missing-skill"
            ? "global-skill-linked"
            : "global-runtime-ready",
      );
    },
  );

  it.each([
    ["primary-branch-missing", "branch-primary-present"],
    ["git-status", "repository-worktree-clean"],
    ["primary", "branch-upstream-aligned"],
  ] as const)(
    "maps the validated %s repository fact to its declared rule",
    async (code, expected) => {
      const { target: input } = await target();
      vi.spyOn(repositoryReads, "observeRepository").mockRejectedValueOnce(
        new SilvermoonError(code, "Repository invariant"),
      );
      if (code === "git-status")
        await expect(graph(input)).rejects.toThrow("Repository invariant");
      else
        expect((await graph(input)).problems).toMatchObject([
          { checkpoint: "branch", code: expected },
        ]);
    },
  );

  it.each([
    ["history", "idea-folder-event-history-append-only"],
    ["identity", "idea-folder-identity-immutable"],
  ] as const)(
    "owns the selected Idea %s protection in observation, not repository readiness",
    async (code, expected) => {
      const { target: input } = await target();
      vi.spyOn(repositoryReads, "verifyIdeaHistory").mockImplementationOnce(
        () => {
          throw new SilvermoonError(code, "Selected Idea protection");
        },
      );
      const result = await graph(input);
      expect(result.problems).toMatchObject([
        { checkpoint: "idea-folder", code: expected },
      ]);
      expect(result.nodes.at(-1)?.checkpoint).toBe("idea-folder");
    },
  );

  it.each(["git-context", "concurrent-edit", "internal"] as const)(
    "keeps selected Idea %s faults distinct from invalid protocol data",
    async (code) => {
      const { target: input } = await target();
      const error = new SilvermoonError(code, "Idea observation failed");
      vi.spyOn(repositoryReads, "readIdeaProject").mockRejectedValueOnce(error);
      await expect(graph(input)).rejects.toBe(error);
    },
  );

  it.each(["other", "selected"] as const)(
    "validates only the selected Idea, with malformed %s metadata committed",
    async (scope) => {
      const { target: input, remote } = await target();
      const broken = scope === "selected" ? id : "202611171610bbbb";
      const file = join(
        input.target.repoRoot,
        ".silvermoon",
        "i",
        broken,
        "idea.json",
      );
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, "{");
      await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
      await sync(input.target.repoRoot);
      await git(input.target.repoRoot, [
        "remote",
        "set-url",
        "origin",
        "https://github.com/example/project.git",
      ]);
      const result = await graph(input);
      expect(result.problems).toMatchObject([
        {
          checkpoint: scope === "selected" ? "idea-folder" : "requirements",
          code:
            scope === "selected"
              ? "idea-folder-data-valid"
              : "requirements-consensus-confirmed",
        },
      ]);
      if (scope === "other")
        expect(await projectGraph(input)).toMatchObject({ pass: true });
    },
  );

  it("propagates repository transport faults and invalid snapshots without a success-shaped fallback", async () => {
    const { target: input } = await target();
    const error = new Error("Transport failed");
    const observePrimary = vi
      .spyOn(repositoryReads, "observeRepository")
      .mockRejectedValueOnce(error);
    await expect(graph(input)).rejects.toBe(error);
    observePrimary.mockRestore();
    const read = vi
      .spyOn(repositoryReads, "readRepository")
      .mockRejectedValueOnce(error);
    await expect(graph(input)).rejects.toBe(error);
    read.mockRestore();
    vi.spyOn(repositoryReads, "readProject").mockRejectedValueOnce(error);
    await expect(
      graph({ ...input, operation: { mode: "snapshot" } }),
    ).rejects.toBe(error);
  });
  it.each(gates)(
    "stops at the first unsigned %s checkpoint with its one complete document",
    async (gate) => {
      const { target: input, remote } = await target();
      let source = files();
      for (const previous of gates.slice(0, gates.indexOf(gate)))
        source = sign(source, previous);
      await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
      await materialize(input.target.repoRoot, source);
      await sync(input.target.repoRoot);
      await git(input.target.repoRoot, [
        "remote",
        "set-url",
        "origin",
        "https://github.com/example/project.git",
      ]);
      const result = await graph(input);
      const checkpoint = consensusCheckpointIds[gate];
      expect(result.problems).toMatchObject([
        { checkpoint, code: consensusRuleCodes[gate] },
      ]);
      expect(result.nodes.at(-1)?.checkpoint).toBe(checkpoint);
      expect(result.references).toEqual([
        {
          checkpoint,
          documentation: `references/checkpoints/${checkpoint}.md`,
        },
      ]);
    },
  );

  it("collects independent environment failures without exposing configuration as pass output", async () => {
    const current = await device();
    await mkdir(join(current.home, ".config", "silvermoon"), {
      recursive: true,
    });
    await writeFile(
      join(current.home, ".config", "silvermoon", "config.yaml"),
      "unknown: true",
    );
    await rm(join(current.home, ".agents", "skills", "silvermoon"));
    const input: Request = {
      target: { userHome: current.home, repoRoot: await scratch(), idea: id },
      runtime: { entry: current.entry, path: current.path },
      operation: { mode: "lifecycle" },
    };
    const result = await graph(input);
    expect(result.problems.map(({ code }) => code)).toEqual([
      "global-configuration-valid",
      "global-skill-linked",
    ]);
    expect(result.nodes.map(({ checkpoint }) => checkpoint)).toEqual([
      "global",
    ]);
    expect(result.references).toHaveLength(1);
    expect(result).not.toHaveProperty("output");
  });

  it.each(["configuration", "detached", "upstream", "selector"] as const)(
    "attributes invalid %s to the checkpoint that can actually establish it",
    async (kind) => {
      const { target: input, remote } = await target();
      const root = input.target.repoRoot;
      if (kind === "configuration") {
        await writeFile(
          join(root, ".silvermoon", "config.yaml"),
          "invalid: true",
        );
        await git(root, ["remote", "set-url", "origin", remote]);
        await sync(root);
        await git(root, [
          "remote",
          "set-url",
          "origin",
          "https://github.com/example/project.git",
        ]);
      }
      if (kind === "detached") await git(root, ["switch", "--detach", "HEAD"]);
      if (kind === "upstream") await git(root, ["branch", "--unset-upstream"]);
      const request =
        kind === "selector"
          ? { ...input, target: { ...input.target, idea: "missing" } }
          : input;
      const expected = {
        configuration: "branch-silvermoon-config-valid",
        detached: "repository-branch-attached",
        upstream: "branch-upstream-aligned",
        selector: "idea-folder-data-valid",
      }[kind];
      expect((await graph(request)).problems).toMatchObject([
        { code: expected },
      ]);
    },
  );

  it("requires a clean repository before checking branch synchronization", async () => {
    const { target: input } = await target();
    const root = input.target.repoRoot;
    await writeFile(join(root, "source.txt"), "A new local commit.\n");
    await git(root, ["add", "source.txt"]);
    await git(root, ["commit", "-m", "Fixture ahead"]);
    await writeFile(join(root, "draft.txt"), "Uncommitted content.\n");
    const result = await graph(input);
    expect(result.problems.map(({ code }) => code)).toEqual([
      "repository-worktree-clean",
    ]);
    expect(result.references).toHaveLength(1);
    expect(result.nodes.at(-1)?.checkpoint).toBe("repository");
    await rm(join(root, "draft.txt"));
    const branch = await graph(input);
    expect(branch.problems).toMatchObject([
      { checkpoint: "branch", code: "branch-primary-synchronized" },
    ]);
    expect(branch.references).toHaveLength(1);
  });

  it("stops an explicitly abandoned Idea before all consensus checkpoints", async () => {
    const { target: input, remote } = await target();
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await materialize(
      input.target.repoRoot,
      add(files(), event({ type: "abandon", reason: "Explicit stop" })),
    );
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const result = await graph(input);
    expect(result.problems).toMatchObject([
      { checkpoint: "idea-folder", code: "idea-folder-active" },
    ]);
    expect(result.nodes.at(-1)?.checkpoint).toBe("idea-folder");
  });

  it("requires deployment drafts to be committed before reusing the tested-ancestor facts", async () => {
    const { target: input, remote } = await target();
    const tested = await git(input.target.repoRoot, ["rev-parse", "HEAD"]);
    let source = signed();
    const current = idea(source, id);
    source = add(
      source,
      event({ type: "verify", batch: { ...batch(current), subject: tested } }),
    );
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await materialize(input.target.repoRoot, source);
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    expect(await git(input.target.repoRoot, ["rev-parse", "HEAD"])).not.toBe(
      tested,
    );
    await writeFile(
      join(
        input.target.repoRoot,
        ".silvermoon",
        "i",
        id,
        "evidence",
        "deployment",
        "run.txt",
      ),
      "Deployment draft evidence after implementation commit.\n",
    );
    expect(await graph(input)).toMatchObject({
      problems: [
        { checkpoint: "repository", code: "repository-worktree-clean" },
      ],
    });
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const observed = await graph(input);
    expect(observed.nodes.at(-1)?.checkpoint).toBe("deployment");
    expect(observed.problems.map((problem) => problem.code)).toEqual([
      "deployment-evidence-valid",
    ]);
    const brief = JSON.parse(observed.problems[0].brief) as {
      implementation: string;
    };
    expect(brief).toHaveProperty("level", "deployment");
    expect(brief.implementation).toMatch(/^sha256:/);
  });
  it("uses actual entry/PATH/personal link/config facts and never a supplied ready boolean", async () => {
    const current = await device();
    await expect(inspectDevice(current)).resolves.toBeUndefined();
    expect(currentDevice().entry).toContain("bin.js");
    expect(await deviceLanguage(current)).toBeUndefined();
    await mkdir(join(current.home, ".config", "silvermoon"), {
      recursive: true,
    });
    await writeFile(
      join(current.home, ".config", "silvermoon", "config.yaml"),
      "version: 1\npreferredLanguage: ja-JP",
    );
    expect(await deviceLanguage(current)).toBe("ja-JP");
    await writeFile(
      join(current.home, ".config", "silvermoon", "config.yaml"),
      "unknown: true",
    );
    await expect(inspectDevice(current)).rejects.toThrow(/user config/);
    await rm(join(current.home, ".config"), { recursive: true });
    await expect(inspectDevice({ ...current, path: "" })).rejects.toThrow(
      /PATH/,
    );
    const empty = await scratch();
    await expect(
      inspectDevice({ ...current, path: empty + delimiter + current.path }),
    ).resolves.toBeUndefined();
    const npm = await scratch();
    await mkdir(join(npm, "node_modules", "@silvermoon-work"), {
      recursive: true,
    });
    await symlink(
      join(current.entry, "..", ".."),
      join(npm, "node_modules", "@silvermoon-work", "silvermoon"),
      "junction",
    );
    const shim = join(
      npm,
      process.platform === "win32" ? "silvermoon.cmd" : "silvermoon",
    );
    await writeFile(
      shim,
      '@node "%~dp0\\node_modules\\@silvermoon-work\\silvermoon\\dist\\bin.js"\n',
      { mode: 0o755 },
    );
    await expect(
      inspectDevice({ ...current, path: npm }),
    ).resolves.toBeUndefined();
    const legacy = join(await scratch(), "legacy");
    await mkdir(legacy);
    await writeFile(
      join(
        legacy,
        process.platform === "win32" ? "silvermoon.cmd" : "silvermoon",
      ),
      "not this installation",
      { mode: 0o755 },
    );
    await expect(
      inspectDevice({ ...current, path: legacy + delimiter + current.path }),
    ).rejects.toThrow(/PATH/);
    await rm(join(current.home, ".agents", "skills", "silvermoon"));
    await expect(inspectDevice(current)).rejects.toThrow(/canonical/);
    await mkdir(join(current.home, ".agents", "skills", "silvermoon"));
    await expect(inspectDevice(current)).rejects.toThrow(/link/);
  });
  it("prunes prerequisites strictly and reports snapshot validity independently of incomplete consensus", async () => {
    const { target: input } = await target();
    const failedDevice = await graph({
      ...input,
      runtime: { ...input.runtime, path: "" },
    });
    expect(failedDevice.problems.map((problem) => problem.code)).toEqual([
      "global-runtime-ready",
    ]);
    expect(failedDevice.nodes).toHaveLength(1);
    const missing = await graph({
      ...input,
      target: { ...input.target, repoRoot: await scratch() },
    });
    expect(missing.problems.map((problem) => problem.code)).toEqual([
      "repository-root-valid",
    ]);
    const current = await graph(input);
    expect(current.problems.map((problem) => problem.code)).toEqual([
      "requirements-consensus-confirmed",
    ]);
    expect(current.nodes.map((node) => node.checkpoint)).toEqual([
      "global",
      "repository",
      "branch",
      "silvermoon-folder",
      "idea-folder",
      "requirements",
    ]);
    expect(JSON.stringify(current.nodes)).not.toContain("runtime");
    expect(Value.Check(Target, input)).toBe(false);
    expect(Value.Check(Target, { ...input.target, level: "completed" })).toBe(
      false,
    );
    expect(Value.Check(Target, { ...input.target, approved: true })).toBe(
      false,
    );
    expect(
      await graph({
        ...input,
        operation: { mode: "snapshot", snapshot: "HEAD" },
        runtime: { ...input.runtime, entry: "" },
      }),
    ).toMatchObject({ pass: true });
    expect(Value.Check(Target, { userHome: input.target.userHome })).toBe(
      false,
    );
    expect(
      Value.Check(Target, {
        userHome: input.target.userHome,
        repoRoot: input.target.repoRoot,
      }),
    ).toBe(false);
    expect(await projectGraph(input)).toMatchObject({ pass: true });
    await writeFile(join(input.target.repoRoot, "unrelated.txt"), "preserve");
    expect(await projectGraph(input)).toMatchObject({
      problems: [{ code: "repository-worktree-clean" }],
    });
    expect(await graph(input)).toMatchObject({
      problems: [{ code: "repository-worktree-clean" }],
    });
    const aborted = new AbortController();
    aborted.abort(new Error("Cancelled graph"));
    await expect(
      executeCheck({
        checkpoints: silvermoonCheckpoints(cid, { runtime: input.runtime }),
        target: input.target,
        signal: aborted.signal,
      }),
    ).rejects.toThrow(/Cancelled/);
  });
  it("executes the delivered Idea CAR through every consensus and both synchronized verification phases", async () => {
    const { target: input, remote } = await target({ idea: false });
    const root = input.target.repoRoot;
    const artifact = await bundledArtifact();
    let source = files();
    for (const path of ["idea.json", "events.jsonl"])
      source.set(
        path,
        Buffer.from(
          new TextDecoder()
            .decode(source.get(path))
            .replaceAll(cid, artifact.cid),
        ),
      );
    const publish = async () => {
      await materialize(root, source);
      await git(root, ["remote", "set-url", "origin", remote]);
      await sync(root);
      await git(root, [
        "remote",
        "set-url",
        "origin",
        "https://github.com/example/project.git",
      ]);
    };
    const gap = async (checkpoint: string, code: string) => {
      const report = await observe(input, {
        cid: artifact.cid,
        artifacts: [artifact],
      });
      expect(report.checkCid).toBe(artifact.cid);
      expect(report.result).toMatchObject({
        pass: false,
        problems: [{ checkpoint, code }],
      });
      expect(report.result.references).toHaveLength(1);
      const reference = report.result.references[0]!;
      expect(reference.checkpoint).toBe(checkpoint);
      const document = report.documents.find(
        ({ cid }) => cid === reference.documentation,
      );
      expect(document?.text).toContain("## Agent instructions");
      expect(document?.text).toContain(`\`${code}\``);
      return report;
    };
    await publish();
    for (const gate of gates) {
      await gap(consensusCheckpointIds[gate], consensusRuleCodes[gate]);
      source = sign(source, gate);
      await publish();
    }
    await gap("implementation", "implementation-evidence-valid");
    const tested = await git(root, ["rev-parse", "HEAD"]);
    let current = idea(source, id);
    source = add(
      source,
      event({
        type: "verify",
        batch: { ...batch(current), subject: tested },
      }),
    );
    await materialize(root, source);
    await gap("repository", "repository-worktree-clean");
    await git(root, ["add", "--all"]);
    await git(root, ["commit", "-m", "Record implementation verification"]);
    await gap("branch", "branch-primary-synchronized");
    await publish();
    const pendingDeployment = await gap(
      "deployment",
      "deployment-evidence-valid",
    );
    current = idea(source, id);
    const implementation = reduce(current, {
      primary: current,
      head: tested,
    }).implementation;
    if (!implementation)
      throw new Error("Expected valid implementation evidence.");
    expect(pendingDeployment.result.problems?.[0]?.brief).toContain(
      implementation,
    );
    source = add(
      source,
      event({
        type: "verify",
        batch: {
          ...batch(current, "deployment", implementation),
          subject: await git(root, ["rev-parse", "HEAD"]),
        },
      }),
    );
    await materialize(root, source);
    await gap("repository", "repository-worktree-clean");
    await git(root, ["add", "--all"]);
    await git(root, ["commit", "-m", "Record deployment verification"]);
    await gap("branch", "branch-primary-synchronized");
    await publish();
    const completed = await observe(input, {
      cid: artifact.cid,
      artifacts: [artifact],
    });
    expect(completed.checkCid).toBe(artifact.cid);
    expect(completed.result.pass).toBe(true);
    expect(completed.result.references).toEqual([]);
    expect(completed.result).not.toHaveProperty("problems");
    expect(completed.documents).toHaveLength(1);
    expect(completed.documents[0]?.text).toContain(
      "检查指定 Idea 是否已经完成",
    );
  }, 60_000);
  it("reobserves the same CID + stable Target in separate real Engines, reads docs offline, and respects pinned CID/trust", async () => {
    const { target: input, remote } = await target({ idea: false });
    const artifact = await bundledArtifact();
    const currentFiles = files();
    for (const [path, bytes] of currentFiles)
      if (path === "idea.json" || path === "events.jsonl")
        currentFiles.set(
          path,
          Buffer.from(
            new TextDecoder().decode(bytes).replaceAll(cid, artifact.cid),
          ),
        );
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await materialize(input.target.repoRoot, currentFiles);
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const first = await observe(input);
    expect(first.checkCid).toBe(artifact.cid);
    expect(first.result.pass).toBe(false);
    expect(first.result.problems?.[0]?.code).toBe(
      "requirements-consensus-confirmed",
    );
    expect(first.result.problems?.[0]).toMatchObject({
      checkpoint: "requirements",
    });
    expect(
      first.documents.every((document) => document.text.trim().length > 0),
    ).toBe(true);
    await writeFile(
      join(
        input.target.repoRoot,
        ".silvermoon",
        "i",
        id,
        "requirements",
        "example.md",
      ),
      "A newly observed exact draft.\n",
    );
    const second = await observe(input, {
      cid: artifact.cid,
      artifacts: [artifact],
    });
    expect(second.target).toEqual(first.target);
    expect(second.result.problems?.[0]?.code).toBe("repository-worktree-clean");
    expect(second.result.problems?.[0]?.brief).not.toBe(
      first.result.problems?.[0]?.brief,
    );
    await expect(observe(input, { cid })).rejects.toThrow(
      /unavailable or not explicitly trusted/,
    );
    await expect(observe(input, { artifacts: [] })).rejects.toThrow(
      /unavailable/,
    );
    await expect(
      observe(input, { cid, artifacts: [{ cid, path: artifact.path }] }),
    ).rejects.toThrow(/CAR root differs/);
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    await expect(graph(input, cid)).rejects.toThrow(/Check CID/);
  }, 20_000);
  it("distinguishes Engine faults, cancellation and timeout from business gaps and awaits release", async () => {
    const current = await device();
    const input: Request = {
      target: { userHome: current.home, repoRoot: await scratch(), idea: id },
      operation: { mode: "lifecycle" },
      runtime: { entry: current.entry, path: current.path },
    };
    const cancelled = new AbortController();
    cancelled.abort(new Error("Cancelled before request"));
    await expect(observe(input, { signal: cancelled.signal })).rejects.toThrow(
      /Cancelled/,
    );
    const inFlight = new AbortController();
    const pending = observe(input, { signal: inFlight.signal });
    setTimeout(() => {
      inFlight.abort(new Error("Cancelled in flight"));
    }, 15);
    await expect(pending).rejects.toThrow(/Cancelled/);
    await expect(observe(input, { timeoutMs: 1 })).rejects.toThrow(/budget/);
    const invalid = {
      ...input,
      operation: { mode: "unsupported" },
    } as unknown as Request;
    await expect(observe(invalid)).rejects.toThrow(/operation/);
  }, 20_000);
  it("provides protocol-valid signoff and verification JSON instructions for every post-folder stage", async () => {
    const artifact = await bundledArtifact();
    const car = await readTaskBundleCar(
      new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
    );
    const store = IpfsStore.fromClient({ block: car.block });
    const tested = "a".repeat(40);
    let source = files();
    try {
      for (const [index, checkpoint] of checkpointIds.slice(5).entries()) {
        const document = await store.resolveContent(
          (await import("multiformats/cid")).CID.parse(artifact.cid),
          `resources/references/checkpoints/${checkpoint}.md`,
        );
        const markdown = await readDocument(store, document.toString());
        expect(markdown).toContain("## Description");
        expect(markdown).toContain("## Agent instructions");
        const current = idea(source, id);
        const state = reduce(current, { primary: current, head: tested });
        const phase =
          checkpoint === "deployment" ? "deployment" : "implementation";
        const replacements: Record<string, string> = {
          "new-32-hex": String(index + 1).padStart(32, "0"),
          "current-UTC-ISO-time": new Date().toISOString(),
          "unique-batch-id": `${checkpoint}-verification`,
          "exact-tested-commit-SHA": tested,
          "required-implementation-environment": "local",
          "required-deployment-environment": "staging",
          "actual-case-id": phase === "implementation" ? "I-01" : "D-01",
          "actual-file": "run.txt",
          "sha256-of-raw-evidence-bytes": digest(
            current.files.get(`evidence/${phase}/run.txt`)!,
          ),
          ...Object.fromEntries(
            gates.map((gate) => [
              `state.revisions.${gate}`,
              state.revisions[gate],
            ]),
          ),
          ...(state.implementation
            ? { "state.implementation": state.implementation }
            : {}),
        };
        let appended = 0;
        for (const match of markdown.matchAll(/```json\n([\s\S]*?)\n```/g)) {
          const json = match[1]!.replace(
            /<([^<>]+)>/g,
            (_match, key: string) => {
              const value = replacements[key];
              if (value === undefined)
                throw new Error(`Unknown instruction placeholder: ${key}`);
              return value;
            },
          );
          const payload: unknown = JSON.parse(json);
          if (typeof payload !== "object" || payload === null)
            throw new Error("Expected an instruction JSON object.");
          if (!("type" in payload)) {
            const indexed = new Map(source);
            indexed.set("tests/cases.json", Buffer.from(canonical(payload)));
            expect(() => idea(indexed, id)).not.toThrow();
            continue;
          }
          const candidate = new Map(source);
          candidate.set(
            "events.jsonl",
            Buffer.from(current.eventSource + canonical(payload) + "\n"),
          );
          const next = idea(candidate, id);
          validateAppend(current, next.events.at(-1)!, state, true);
          source = candidate;
          appended++;
        }
        expect(appended, checkpoint).toBe(1);
      }
      const current = idea(source, id);
      const completed = reduce(current, { primary: current, head: tested });
      expect(completed.level).toBe("completed");
      expect(completed.implementation).toMatch(/^sha256:/);
      expect(completed.deployment).toMatch(/^sha256:/);
    } finally {
      await store.close();
      await car.close();
    }
  });
  it("reads exact documentation and reports bad CID, missing blocks, wrong kind, UTF-8, budget and cancellation explicitly", async () => {
    const artifact = await bundledArtifact();
    const car = await readTaskBundleCar(
      new Blob([Uint8Array.from(await readFile(artifact.path))]).stream(),
    );
    const store = IpfsStore.fromClient({ block: car.block });
    try {
      const doc = await store.resolveContent(
        (await import("multiformats/cid")).CID.parse(artifact.cid),
        "resources/references/check.md",
      );
      expect(await readDocument(store, doc.toString())).toContain(
        "protocol v1",
      );
      await expect(readDocument(store, doc.toString(), 1)).rejects.toThrow(
        /budget/,
      );
      await expect(readDocument(store, artifact.cid)).rejects.toThrow(/file/);
      await expect(readDocument(store, "not-a-cid")).rejects.toThrow();
      await expect(readDocument(store, cid)).rejects.toThrow();
      const corrupt = await store.putContent(
        new Blob([Uint8Array.of(255)]).stream(),
      );
      await expect(readDocument(store, corrupt.toString())).rejects.toThrow();
      const cancelled = new AbortController();
      cancelled.abort(new Error("Cancelled content"));
      await expect(
        readDocument(store, doc.toString(), 100, cancelled.signal),
      ).rejects.toThrow(/Cancelled/);
    } finally {
      await store.close();
      await car.close();
    }
  });
  it("can finish the real shared graph with synchronized current evidence, while any signed detail edit rolls back", async () => {
    const { target: input, remote } = await target();
    let source = signed();
    const tested = await git(input.target.repoRoot, ["rev-parse", "HEAD"]);
    let current = idea(source, id);
    const implementation = { ...batch(current), subject: tested };
    source = add(source, event({ type: "verify", batch: implementation }));
    current = idea(source, id);
    const state = reduce(current, { primary: current, head: tested });
    source = add(
      source,
      event({
        type: "verify",
        batch: {
          ...batch(current, "deployment", state.implementation),
          subject: tested,
        },
      }),
    );
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await materialize(input.target.repoRoot, source);
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const passed = await graph(input);
    expect(passed).toMatchObject({ pass: true });
    expect(passed.nodes.map(({ checkpoint }) => checkpoint)).toEqual(
      checkpointIds,
    );
    const originalObservation = repositoryReads.observedIdeaState;
    const concurrent = vi
      .spyOn(repositoryReads, "observedIdeaState")
      .mockImplementationOnce(async (...args) => {
        const state = await originalObservation(...args);
        await writeFile(
          join(input.target.repoRoot, "concurrent.txt"),
          "A concurrent edit.\n",
        );
        return state;
      });
    expect(await graph(input)).toMatchObject({
      problems: [
        { checkpoint: "implementation", code: "implementation-synchronized" },
      ],
    });
    concurrent.mockRestore();
    await rm(join(input.target.repoRoot, "concurrent.txt"));
    for (const change of ["worktree", "head"] as const) {
      const duringDeployment = await graph(input, cid, async (node) => {
        if (node.checkpoint !== "implementation" || !node.pass) return;
        await writeFile(
          join(input.target.repoRoot, "concurrent.txt"),
          "Changed after implementation acceptance.\n",
        );
        if (change === "head") {
          await git(input.target.repoRoot, ["add", "concurrent.txt"]);
          await git(input.target.repoRoot, [
            "commit",
            "-m",
            "Concurrent commit",
          ]);
        }
      });
      expect(duringDeployment).toMatchObject({
        problems: [
          { checkpoint: "deployment", code: "deployment-synchronized" },
        ],
      });
      expect(duringDeployment.nodes.at(-2)).toMatchObject({
        checkpoint: "implementation",
        pass: true,
      });
      if (change === "worktree")
        await rm(join(input.target.repoRoot, "concurrent.txt"));
    }
    await writeFile(
      join(
        input.target.repoRoot,
        ".silvermoon",
        "i",
        id,
        "technical",
        "design.md",
      ),
      "Changed signed supplemental plan",
    );
    expect(await graph(input)).toMatchObject({
      problems: [{ code: "repository-worktree-clean" }],
    });
    await git(input.target.repoRoot, ["remote", "set-url", "origin", remote]);
    await sync(input.target.repoRoot);
    await git(input.target.repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const changed = await graph(input);
    expect(changed.problems.map((problem) => problem.code)).toEqual([
      "technical-consensus-confirmed",
    ]);
    const selected = selectIdea(await readProject(input.target.repoRoot), id);
    expect(digest(canonical(selected.revisions))).not.toBe(
      digest(canonical(current.revisions)),
    );
    const observation = silvermoonCheckpoints(cid, {
      runtime: input.runtime,
    }).find((checkpoint) => checkpoint.id === "idea-folder")!;
    await expect(
      observation.invoke(input.target, {
        signal: new AbortController().signal,
        outputOf: () => {
          throw new Error("Missing checkpoint prerequisite");
        },
      }),
    ).rejects.toThrow(/prerequisite/);
  }, 20_000);
  it("executes a trusted historical CAR explicitly rather than substituting a newer default", async () => {
    const directory = await scratch();
    const original = await bundledArtifact();
    const car = await readTaskBundleCar(
      new Blob([Uint8Array.from(await readFile(original.path))]).stream(),
    );
    const encoded = await encodeTaskBundleCar({
      list: (path, options) => car.tree.list(path, options),
      read: (path, options) =>
        path === "resources/references/check.md"
          ? Promise.resolve(
              memoryFile(
                Buffer.from("Different explicitly trusted rule documentation."),
                options,
              ),
            )
          : car.tree.read(path, options),
    });
    const path = join(directory, "historical.car");
    try {
      await writeFile(
        path,
        new Uint8Array(await new Response(encoded.stream).arrayBuffer()),
      );
    } finally {
      await encoded.close();
      await car.close();
    }
    expect(encoded.cid).not.toBe(original.cid);
    const current = await device();
    const input: Request = {
      target: { userHome: current.home, repoRoot: await scratch(), idea: id },
      operation: { mode: "lifecycle" },
      runtime: { entry: current.entry, path: current.path },
    };
    const newerDefault = { cid: encoded.cid, path };
    const artifacts = [newerDefault, original];
    expect((await observe(input, { artifacts })).checkCid).toBe(
      newerDefault.cid,
    );
    const pinned = await observe(input, { artifacts, cid: original.cid });
    expect(pinned.checkCid).toBe(original.cid);
    expect(pinned.documents[0]?.text).toContain("protocol v1");
    await expect(
      observe(input, { artifacts: [newerDefault], cid: original.cid }),
    ).rejects.toThrow(/unavailable/);
  }, 20_000);
});
