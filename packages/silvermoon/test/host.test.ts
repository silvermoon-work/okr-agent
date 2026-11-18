import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
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
import { silvermoonRegistry } from "../src/check.js";
import {
  bundledArtifact,
  observe as observeTarget,
  readDocument,
} from "../src/host.js";
import { canonical, digest, idea, reduce } from "../src/domain.js";
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
  sync,
} from "./fixtures.js";

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
  const report = await executeCheck({
    registry: silvermoonRegistry(bundle),
    root: { checker: "device", target },
    signal: new AbortController().signal,
    log: (node) => {
      nodes.push(node);
    },
  });
  return { ...report, problems: report.pass ? [] : report.problems, nodes };
}
describe("Device → Project → Idea and the real offline Engine", () => {
  it("routes deployment drafts using the same tested-ancestor context as the Idea checker", async () => {
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
    const observed = await graph(input);
    expect(observed.nodes).toHaveLength(3);
    expect(observed.problems.map((problem) => problem.code)).toEqual([
      "deployment",
    ]);
    const brief = JSON.parse(observed.problems[0].brief) as {
      level: string;
      implementation: string;
    };
    expect(brief.level).toBe("deployment");
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
      "device",
    ]);
    expect(failedDevice.nodes).toHaveLength(1);
    const missing = await graph({
      ...input,
      target: { ...input.target, repoRoot: await scratch() },
    });
    expect(missing.problems.map((problem) => problem.code)).toEqual([
      "project",
    ]);
    const current = await graph(input);
    expect(current.problems.map((problem) => problem.code)).toEqual([
      "requirements",
    ]);
    expect(current.nodes).toHaveLength(3);
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
    ).toMatchObject({ pass: false, problems: [{ code: "project" }] });
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
      problems: [{ code: "repository" }],
    });
    expect(await graph(input)).toMatchObject({
      problems: [{ code: "repository" }],
    });
    const aborted = new AbortController();
    aborted.abort(new Error("Cancelled graph"));
    await expect(
      executeCheck({
        registry: silvermoonRegistry(cid),
        root: { checker: "device", target: input },
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
    expect(await graph(input, cid)).toMatchObject({
      problems: [{ code: "repository" }],
    });
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
    const changed = await graph(input);
    expect(changed.problems.map((problem) => problem.code)).toEqual([
      "technical",
    ]);
    const selected = selectIdea(await readProject(input.target.repoRoot!), id);
    expect(digest(canonical(selected.revisions))).not.toBe(
      digest(canonical(current.revisions)),
    );
    const registry = silvermoonRegistry(cid);
    await expect(
      registry.idea.invoke(input, new AbortController().signal),
    ).rejects.toThrow(/Project prerequisite/);
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
