import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
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
import { silvermoonCheckpoints, snapshotCheckpoints } from "../src/check.js";
import { Target } from "../src/contract.js";
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
  type State,
} from "../src/domain.js";
import { createIdea, appendEvent } from "../src/write.js";
import * as deviceReads from "../src/device.js";
import * as repositoryReads from "../src/repository.js";
import { git, selectIdea, readProject } from "../src/repository.js";
import type { Input } from "../src/contract.js";
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
async function target(): Promise<{ target: Input; remote: string }> {
  const { root, remote } = await repository();
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
  request: Input,
  options: Parameters<typeof observeTarget>[1] = {},
) {
  return observeTarget(request.target, {
    operation: request.operation,
    runtime: request.runtime,
    ...options,
  });
}
async function graph(target: Input, bundle = cid) {
  const nodes: ReportNode[] = [];
  const options = {
    signal: new AbortController().signal,
    log: (node: ReportNode) => {
      nodes.push(node);
    },
  };
  const report =
    target.operation.mode === "snapshot"
      ? await executeCheck({
          ...options,
          checkpoints: snapshotCheckpoints(target.runtime),
          target: {
            ...target.target,
            snapshot: target.operation.snapshot ?? "HEAD",
          },
        })
      : await executeCheck({
          ...options,
          checkpoints: silvermoonCheckpoints(
            bundle,
            {
              runtime: target.runtime,
              refresh: target.operation.refresh ?? true,
            },
            target.target,
          ),
          target: target.target,
        });
  return { ...report, problems: report.pass ? [] : report.problems, nodes };
}
describe("Ordered checkpoints and the real offline Engine", () => {
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
        checkpoints: silvermoonCheckpoints(
          cid,
          { runtime, localRemote },
          target,
        ),
        target,
        signal: new AbortController().signal,
      });
    };
    expect(await run(undefined, join(remote, "not-authorized"))).toMatchObject({
      problems: [{ code: "branch-upstream-mismatch" }],
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
      const state = await observe(gate);
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
            decision: "confirmed",
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
        problems: [{ checkpoint: "repository", code: "worktree-uncommitted" }],
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
      const state = await observe(phase);
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
    await observe("technical");
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
      { checkpoint: "requirements", code: "synchronization" },
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
    await git(input.target.repoRoot!, ["remote", "set-url", "origin", remote]);
    await materialize(input.target.repoRoot!, signed());
    await sync(input.target.repoRoot!);
    await git(input.target.repoRoot!, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const result = await graph(input);
    expect(result.problems).toMatchObject([
      { checkpoint: "implementation", code: "implementation" },
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
      expect(observed.nodes.at(-1)?.checkpoint).toBe("environment");
      expect(observed.problems[0].code).toBe(
        kind === "encoding"
          ? "environment-configuration"
          : kind === "missing-skill"
            ? "environment-skill"
            : "environment-runtime",
      );
    },
  );

  it.each([
    ["primary-branch-missing", "primary-branch-missing"],
    ["history", "event-history-rewritten"],
    ["identity", "idea-identity-modified"],
    ["git-status", "worktree-uncommitted"],
    ["primary", "branch-upstream-mismatch"],
  ] as const)(
    "maps the validated %s repository fact to its declared rule",
    async (code, expected) => {
      const { target: input } = await target();
      vi.spyOn(repositoryReads, "primary").mockRejectedValueOnce(
        new SilvermoonError(code, "Repository invariant"),
      );
      expect((await graph(input)).problems).toMatchObject([
        { checkpoint: "repository", code: expected },
      ]);
    },
  );

  it("propagates repository transport faults and invalid snapshots without a success-shaped fallback", async () => {
    const { target: input } = await target();
    const error = new Error("Transport failed");
    const observePrimary = vi
      .spyOn(repositoryReads, "primary")
      .mockRejectedValueOnce(error);
    await expect(graph(input)).rejects.toBe(error);
    observePrimary.mockRestore();
    const read = vi
      .spyOn(repositoryReads, "readProject")
      .mockRejectedValueOnce(error);
    await expect(graph(input)).rejects.toBe(error);
    read.mockRestore();
    vi.spyOn(repositoryReads, "snapshotHistory").mockRejectedValueOnce(error);
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
      await git(input.target.repoRoot!, [
        "remote",
        "set-url",
        "origin",
        remote,
      ]);
      await materialize(input.target.repoRoot!, source);
      await sync(input.target.repoRoot!);
      await git(input.target.repoRoot!, [
        "remote",
        "set-url",
        "origin",
        "https://github.com/example/project.git",
      ]);
      const result = await graph(input);
      expect(result.problems).toMatchObject([{ checkpoint: gate, code: gate }]);
      expect(result.nodes.at(-1)?.checkpoint).toBe(gate);
      expect(result.references).toEqual([
        {
          checkpoint: gate,
          documentation: `references/checkpoints/${gate}.md`,
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
    const input: Input = {
      target: { userHome: current.home },
      runtime: { entry: current.entry, path: current.path },
      operation: { mode: "lifecycle" },
    };
    const result = await graph(input);
    expect(result.problems.map(({ code }) => code)).toEqual([
      "environment-configuration",
      "environment-skill",
    ]);
    expect(result.nodes.map(({ checkpoint }) => checkpoint)).toEqual([
      "environment",
    ]);
    expect(result.references).toHaveLength(1);
    expect(result).not.toHaveProperty("output");
  });

  it.each(["configuration", "detached", "upstream", "selector"] as const)(
    "attributes invalid %s to the checkpoint that can actually establish it",
    async (kind) => {
      const { target: input } = await target();
      const root = input.target.repoRoot!;
      if (kind === "configuration")
        await writeFile(
          join(root, ".silvermoon", "config.yaml"),
          "invalid: true",
        );
      if (kind === "detached") await git(root, ["switch", "--detach", "HEAD"]);
      if (kind === "upstream") await git(root, ["branch", "--unset-upstream"]);
      const request =
        kind === "selector"
          ? { ...input, target: { ...input.target, idea: "missing" } }
          : input;
      const expected = {
        configuration: "project-configuration-invalid",
        detached: "branch-detached",
        upstream: "branch-upstream-mismatch",
        selector: "idea-invalid",
      }[kind];
      expect((await graph(request)).problems).toMatchObject([
        { code: expected },
      ]);
    },
  );

  it("reports both an unsynchronized commit and dirty content in one repository document", async () => {
    const { target: input } = await target();
    const root = input.target.repoRoot!;
    await writeFile(join(root, "source.txt"), "A new local commit.\n");
    await git(root, ["add", "source.txt"]);
    await git(root, ["commit", "-m", "Fixture ahead"]);
    await writeFile(join(root, "draft.txt"), "Uncommitted content.\n");
    const result = await graph(input);
    expect(result.problems.map(({ code }) => code)).toEqual([
      "worktree-uncommitted",
      "primary-sync-required",
    ]);
    expect(result.references).toHaveLength(1);
    expect(result.nodes.at(-1)?.checkpoint).toBe("repository");
  });

  it("stops an explicitly abandoned Idea before all consensus checkpoints", async () => {
    const { target: input, remote } = await target();
    await git(input.target.repoRoot!, ["remote", "set-url", "origin", remote]);
    await materialize(
      input.target.repoRoot!,
      add(files(), event({ type: "abandon", reason: "Explicit stop" })),
    );
    await sync(input.target.repoRoot!);
    await git(input.target.repoRoot!, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const result = await graph(input);
    expect(result.problems).toMatchObject([
      { checkpoint: "observation", code: "abandoned" },
    ]);
    expect(result.nodes.at(-1)?.checkpoint).toBe("observation");
  });

  it("requires deployment drafts to be committed before reusing the tested-ancestor facts", async () => {
    const { target: input, remote } = await target();
    const tested = await git(input.target.repoRoot!, ["rev-parse", "HEAD"]);
    let source = signed();
    const current = idea(source, id);
    source = add(
      source,
      event({ type: "verify", batch: { ...batch(current), subject: tested } }),
    );
    await git(input.target.repoRoot!, ["remote", "set-url", "origin", remote]);
    await materialize(input.target.repoRoot!, source);
    await sync(input.target.repoRoot!);
    await git(input.target.repoRoot!, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    expect(await git(input.target.repoRoot!, ["rev-parse", "HEAD"])).not.toBe(
      tested,
    );
    await writeFile(
      join(
        input.target.repoRoot!,
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
      problems: [{ checkpoint: "repository", code: "worktree-uncommitted" }],
    });
    await git(input.target.repoRoot!, ["remote", "set-url", "origin", remote]);
    await sync(input.target.repoRoot!);
    await git(input.target.repoRoot!, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const observed = await graph(input);
    expect(observed.nodes.at(-1)?.checkpoint).toBe("deployment");
    expect(observed.problems.map((problem) => problem.code)).toEqual([
      "deployment",
    ]);
    const brief = JSON.parse(observed.problems[0].brief) as {
      implementation: string;
    };
    expect(brief).not.toHaveProperty("level");
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
      "environment-runtime",
    ]);
    expect(failedDevice.nodes).toHaveLength(1);
    const missing = await graph({
      ...input,
      target: { ...input.target, repoRoot: await scratch() },
    });
    expect(missing.problems.map((problem) => problem.code)).toEqual([
      "repository-root-invalid",
    ]);
    const current = await graph(input);
    expect(current.problems.map((problem) => problem.code)).toEqual([
      "requirements",
    ]);
    expect(current.nodes.map((node) => node.checkpoint)).toEqual([
      "environment",
      "repository",
      "observation",
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
    expect(
      await graph({
        ...input,
        target: { userHome: input.target.userHome },
      }),
    ).toMatchObject({ pass: true });
    expect(
      await graph({
        ...input,
        target: { userHome: input.target.userHome, idea: id },
      }),
    ).toMatchObject({
      pass: false,
      problems: [{ code: "repository-root-invalid" }],
    });
    expect(
      await graph({
        ...input,
        target: { userHome: input.target.userHome },
        operation: { mode: "snapshot" },
      }),
    ).toMatchObject({ pass: false, problems: [{ code: "snapshot" }] });
    const noIdea = { ...input, target: { ...input.target } };
    delete noIdea.target.idea;
    expect(await graph(noIdea)).toMatchObject({ pass: true });
    await writeFile(join(input.target.repoRoot!, "unrelated.txt"), "preserve");
    expect(await graph(noIdea)).toMatchObject({
      problems: [{ code: "worktree-uncommitted" }],
    });
    expect(await graph(input)).toMatchObject({
      problems: [{ code: "worktree-uncommitted" }],
    });
    const aborted = new AbortController();
    aborted.abort(new Error("Cancelled graph"));
    await expect(
      executeCheck({
        checkpoints: silvermoonCheckpoints(
          cid,
          { runtime: input.runtime },
          input.target,
        ),
        target: input.target,
        signal: aborted.signal,
      }),
    ).rejects.toThrow(/Cancelled/);
  });
  it("reobserves the same CID + stable Target in separate real Engines, reads docs offline, and respects pinned CID/trust", async () => {
    const { target: input, remote } = await target();
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
    await git(input.target.repoRoot!, ["remote", "set-url", "origin", remote]);
    await materialize(input.target.repoRoot!, currentFiles);
    await sync(input.target.repoRoot!);
    await git(input.target.repoRoot!, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const first = await observe(input);
    expect(first.checkCid).toBe(artifact.cid);
    expect(first.result.pass).toBe(false);
    expect(first.result.problems?.[0]?.code).toBe("requirements");
    expect(first.result.problems?.[0]).toMatchObject({
      checkpoint: "requirements",
    });
    expect(
      first.documents.every((document) => document.text.trim().length > 0),
    ).toBe(true);
    await writeFile(
      join(
        input.target.repoRoot!,
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
    expect(second.result.problems?.[0]?.code).toBe("worktree-uncommitted");
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
    await git(input.target.repoRoot!, ["remote", "set-url", "origin", remote]);
    await sync(input.target.repoRoot!);
    await git(input.target.repoRoot!, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    await expect(graph(input, cid)).rejects.toThrow(/Check CID/);
  }, 20_000);
  it("distinguishes Engine faults, cancellation and timeout from business gaps and awaits release", async () => {
    const current = await device();
    const input: Input = {
      target: { userHome: current.home },
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
    } as unknown as Input;
    await expect(observe(invalid)).rejects.toThrow(/rejected|did not complete/);
  }, 20_000);
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
    const tested = await git(input.target.repoRoot!, ["rev-parse", "HEAD"]);
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
    await git(input.target.repoRoot!, ["remote", "set-url", "origin", remote]);
    await materialize(input.target.repoRoot!, source);
    await sync(input.target.repoRoot!);
    await git(input.target.repoRoot!, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    expect(await graph(input)).toMatchObject({ pass: true });
    const originalObservation = repositoryReads.observedIdeaState;
    const concurrent = vi
      .spyOn(repositoryReads, "observedIdeaState")
      .mockImplementationOnce(async (...args) => {
        const state = await originalObservation(...args);
        await writeFile(
          join(input.target.repoRoot!, "concurrent.txt"),
          "A concurrent edit.\n",
        );
        return state;
      });
    expect(await graph(input)).toMatchObject({
      problems: [
        { checkpoint: "completion", code: "completion-unsynchronized" },
      ],
    });
    concurrent.mockRestore();
    await rm(join(input.target.repoRoot!, "concurrent.txt"));
    await writeFile(
      join(
        input.target.repoRoot!,
        ".silvermoon",
        "i",
        id,
        "technical",
        "design.md",
      ),
      "Changed signed supplemental plan",
    );
    expect(await graph(input)).toMatchObject({
      problems: [{ code: "worktree-uncommitted" }],
    });
    await git(input.target.repoRoot!, ["remote", "set-url", "origin", remote]);
    await sync(input.target.repoRoot!);
    await git(input.target.repoRoot!, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/project.git",
    ]);
    const changed = await graph(input);
    expect(changed.problems.map((problem) => problem.code)).toEqual([
      "technical",
    ]);
    const selected = selectIdea(await readProject(input.target.repoRoot!), id);
    expect(digest(canonical(selected.revisions))).not.toBe(
      digest(canonical(current.revisions)),
    );
    const observation = silvermoonCheckpoints(
      cid,
      { runtime: input.runtime },
      input.target,
    ).find((checkpoint) => checkpoint.id === "observation")!;
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
    const input: Input = {
      target: { userHome: current.home },
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
