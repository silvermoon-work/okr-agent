import {
  checkpoints,
  eventSchemaCid,
  flatIdea,
  jcs,
  type FlatEvent,
} from "../src/flat.js";
import type { Files } from "../src/domain.js";
import { date, id } from "./fixtures.js";
import { configText } from "./snapshots.js";
import type { Project } from "../src/repository.js";

export function flatFiles(): Map<string, Uint8Array> {
  return new Map([
    [
      "events.jsonl",
      Buffer.from(
        jcs({ at: date, type: "created", idea: id, eventSchemaCid }) + "\n",
      ),
    ],
    ...checkpoints.map(
      (folder) => [`${folder}/Spec.md`, Buffer.from(`# ${folder}\n`)] as const,
    ),
  ]);
}
export function flatAdd(
  source: Files,
  event: FlatEvent,
): Map<string, Uint8Array> {
  const files = new Map(source);
  files.set(
    "events.jsonl",
    Buffer.from(
      new TextDecoder().decode(files.get("events.jsonl")) + jcs(event) + "\n",
    ),
  );
  return files;
}
export function flatSigned(
  source: Files = flatFiles(),
): Map<string, Uint8Array> {
  for (const [index, object] of checkpoints.entries()) {
    const current = flatIdea(source, id);
    const tuple = {
      at: date,
      object,
      revision: current.revisions[object],
      upstream: index ? current.revisions[checkpoints[index - 1]!] : null,
    };
    source = flatAdd(source, { ...tuple, type: "submit" });
    source = flatAdd(source, { ...tuple, type: "accept", authority: "user" });
  }
  return new Map(source);
}
export function flatProject(
  root: string,
  source: Files = flatFiles(),
): Project {
  const current = flatIdea(source, id);
  return {
    root,
    config: {
      version: 2,
      primaryRepository: "example/project",
      primaryBranch: "main",
      preferredLanguage: "zh-CN",
    },
    files: new Map([
      [".silvermoon/config.yaml", Buffer.from(configText)],
      ...[...source].map(
        ([path, bytes]) => [`.silvermoon/i/${id}/${path}`, bytes] as const,
      ),
    ]),
    ideas: new Map([[id, current]]),
  };
}
