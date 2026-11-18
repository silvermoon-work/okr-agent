import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile, rm, realpath, symlink } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach } from "vitest";
import {
  canonical,
  digest,
  gates,
  idea,
  vectorAt,
  type Batch,
  type Event,
  type Files,
  type Gate,
  type Idea,
} from "../src/domain.js";
import { git } from "../src/repository.js";

export const cid =
  "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3thv36wjgksq4bqppj6bfk3sa";
export const id = "2026111716097a2f";
export const date = "2026-11-17T16:09:22.408Z";
export const head = "a".repeat(40);
export function event<const T extends Omit<Event, "id" | "at" | "version">>(
  value: T,
): T & { id: string; at: string; version: 1 } {
  return {
    ...value,
    id: randomBytes(16).toString("hex"),
    at: date,
    version: 1,
  };
}
export function files(): Map<string, Uint8Array> {
  return new Map(
    Object.entries({
      "idea.json": canonical({
        version: 1,
        id,
        checkCid: cid,
        createdAt: date,
      }),
      "events.jsonl":
        canonical(event({ type: "created", idea: id, checkCid: cid })) + "\n",
      "requirements/Spec.md":
        "# Requirements\n\nObservable result and boundary.\n",
      "requirements/example.md": "Concrete UX example.\n",
      "technical/research.md":
        "# Research questions\n\nQ-01: design tradeoff?\n",
      "technical/Spec.md":
        "# Technical specification\n\nResearched decision and tradeoffs.\n",
      "technical/design.md": "Supplementary plan and precise design.\n",
      "tests/Spec.md":
        "# Tests\n\nI-01 and D-01: conditions, steps, expected result and evidence.\n",
      "tests/case-details.md": "Detailed proof requirements.\n",
      "tests/cases.json": canonical({
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
            environment: "staging",
            subject: "implementation",
          },
        ],
      }),
      "evidence/implementation/run.txt": "Observed code test pass.\n",
      "evidence/deployment/run.txt": "Observed deployed result pass.\n",
    }).map(([path, value]) => [path, Buffer.from(value)]),
  );
}
export function add(source: Files, value: Event): Map<string, Uint8Array> {
  const updated = new Map(source);
  updated.set(
    "events.jsonl",
    Buffer.from(
      new TextDecoder().decode(updated.get("events.jsonl")) +
        canonical(value) +
        "\n",
    ),
  );
  return updated;
}
export function sign(source: Files, gate: Gate): Map<string, Uint8Array> {
  const current = idea(source, id);
  return add(
    source,
    event({
      type: "signOff",
      object: gate,
      revision: current.revisions[gate],
      upstream: vectorAt(current.revisions, gate),
      decision: "confirmed",
    }),
  );
}
export function signed(source: Files = files()): Map<string, Uint8Array> {
  for (const gate of gates) source = sign(source, gate);
  return new Map(source);
}
export function batch(
  current: Idea,
  phase: Batch["phase"] = "implementation",
  implementation?: string,
): Batch {
  const path = `evidence/${phase}/run.txt`;
  return {
    id: `batch-${randomBytes(8).toString("hex")}`,
    phase,
    subject: head,
    revisions: current.revisions,
    environment: phase === "implementation" ? "local" : "staging",
    results: [
      {
        case: phase === "implementation" ? "I-01" : "D-01",
        result: "pass",
        evidence: [{ path, digest: digest(current.files.get(path)!) }],
      },
    ],
    ...(implementation ? { implementation } : {}),
  };
}
const owned: string[] = [];
afterEach(async () => {
  for (const path of owned.splice(0))
    await rm(path, { recursive: true, force: true });
});
export async function scratch(): Promise<string> {
  const directory = resolve(".test-work", randomUUID());
  owned.push(directory);
  await mkdir(directory, { recursive: true });
  return directory;
}
export async function materialize(
  root: string,
  source: Files = files(),
): Promise<void> {
  for (const [path, bytes] of source) {
    const target = join(root, ".silvermoon", "i", id, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, bytes);
  }
}
export async function repository(
  options: { idea?: boolean } = {},
): Promise<{ root: string; remote: string }> {
  const directory = await scratch();
  const root = join(directory, "work");
  const remote = join(directory, "primary.git");
  await mkdir(root);
  await mkdir(remote);
  await git(remote, ["init", "--bare", "--initial-branch=main"]);
  await git(root, ["init", "--initial-branch=main"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await git(root, ["config", "user.name", "Fixture"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  await git(root, ["remote", "add", "origin", remote]);
  await mkdir(join(root, ".silvermoon"));
  await writeFile(
    join(root, ".silvermoon", "config.yaml"),
    "version: 2\nprimaryRepository: example/project\nprimaryBranch: main\npreferredLanguage: zh-CN\n",
  );
  await writeFile(join(root, "source.txt"), "Deliverable source v1\n");
  if (options.idea !== false) await materialize(root);
  await sync(root);
  return { root, remote };
}
export async function sync(root: string): Promise<void> {
  await git(root, ["add", "--all"]);
  await git(root, ["commit", "--allow-empty", "-m", "Fixture candidate"]);
  await git(root, ["push", "--set-upstream", "origin", "main"]);
}

export async function cliRepository(entry: string) {
  const { root, remote } = await repository({ idea: false });
  const directory = await scratch();
  const home = join(directory, "home");
  const bin = join(directory, "bin");
  const canonicalEntry = await realpath(entry);
  const installed = resolve(dirname(canonicalEntry), "..");
  await mkdir(join(home, ".agents", "skills"), { recursive: true });
  await mkdir(join(home, ".config", "silvermoon"), { recursive: true });
  await mkdir(bin);
  await symlink(
    join(installed, "skills", "silvermoon"),
    join(home, ".agents", "skills", "silvermoon"),
    "junction",
  );
  await writeFile(
    join(home, ".config", "silvermoon", "config.yaml"),
    "version: 1\npreferredLanguage: ja-JP\n",
  );
  if (process.platform === "win32")
    await writeFile(
      join(bin, "silvermoon.cmd"),
      `@"${process.execPath}" "${canonicalEntry}" %*\r\n`,
    );
  else
    await writeFile(
      join(bin, "silvermoon"),
      `#!/bin/sh\nexec "${process.execPath}" "${canonicalEntry}" "$@"\n`,
      { mode: 0o755 },
    );
  const transport = join(directory, "ssh.mjs");
  await writeFile(
    transport,
    `import { spawnSync } from "node:child_process";
if (process.argv.includes("-G")) process.exit(0);
const commands = {
  "git-upload-pack 'example/project.git'": "git-upload-pack",
  "git-receive-pack 'example/project.git'": "git-receive-pack"
};
const command = commands[process.argv.at(-1)];
if (!command) {
  console.error("Unexpected fixture SSH request", process.argv.slice(2));
  process.exit(2);
}
const result = spawnSync(command, [${JSON.stringify(remote)}], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`,
  );
  const quote = (value: string) =>
    `'${value.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
  await writeFile(
    join(bin, "ssh"),
    `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(transport)} "$@"\n`,
    { mode: 0o755 },
  );
  await writeFile(
    join(root, ".silvermoon", "config.yaml"),
    "version: 2\nprimaryRepository: https://github.com/example/project.git\nprimaryBranch: main\npreferredLanguage: zh-CN\n",
  );
  await mkdir(join(root, ".silvermoon", "ideas", "INVALID"), {
    recursive: true,
  });
  await writeFile(
    join(root, ".silvermoon", "ideas", "INVALID", "events.jsonl"),
    "Invalid archived content must remain inert.\n",
  );
  await sync(root);
  await git(root, [
    "remote",
    "set-url",
    "origin",
    "git@github.com:example/project.git",
  ]);
  const env: NodeJS.ProcessEnv = {
    PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
    HOME: home,
    USERPROFILE: home,
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  for (const key of ["PATHEXT", "SystemRoot", "WINDIR"] as const)
    if (process.env[key] !== undefined) env[key] = process.env[key];
  const execute = promisify(execFile);
  const fixtureGit = async (args: string[]) =>
    (
      await execute(
        "git",
        [
          "--no-pager",
          "-c",
          `core.hooksPath=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
          ...args,
        ],
        { cwd: root, env },
      )
    ).stdout.trim();
  const synchronize = async () => {
    await fixtureGit(["add", "--all"]);
    await fixtureGit([
      "commit",
      "-m",
      "test: synchronize owned CLI fixture\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
    ]);
    await fixtureGit(["push", "origin", "main"]);
  };
  return { root, env, entry: canonicalEntry, git: fixtureGit, synchronize };
}
