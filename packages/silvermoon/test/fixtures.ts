import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
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
  await writeFile(
    join(root, ".git", "hooks", "pre-commit"),
    "#!/bin/sh\n" +
      "# BEGIN Silvermoon check-changes\n" +
      "silvermoon check-changes --staged --audience agent || exit $?\n" +
      "# END Silvermoon check-changes\n",
    { mode: 0o755 },
  );
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
