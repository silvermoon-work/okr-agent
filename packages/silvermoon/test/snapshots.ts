import { canonical, idea, type Files, type Idea } from "../src/domain.js";
import type { Project, Primary, LocalContext } from "../src/repository.js";
import { files, head, id } from "./fixtures.js";
import { directoryTree, gitObject } from "../src/flat.js";

export const configText =
  "version: 2\nprimaryRepository: example/project\nprimaryBranch: main\npreferredLanguage: zh-CN\n";
export const tip = "b".repeat(40);

export function project(
  root: string,
  source: Files | null = files(),
): Project<Idea> {
  const copy = source
    ? new Map(
        [...source].map(([path, bytes]) => [path, Uint8Array.from(bytes)]),
      )
    : null;
  const current = copy ? idea(copy, id) : undefined;
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
      ...[...(copy ?? [])].map(
        ([path, bytes]) => [`.silvermoon/i/${id}/${path}`, bytes] as const,
      ),
    ]),
    ideas: new Map(current ? [[id, current]] : []),
  };
}

export function primarySnapshot(current: Project) {
  return {
    head,
    tip: head,
    remote: "origin",
    project: current,
    changes: [] as string[],
  } satisfies Primary;
}

export function localSnapshot(current: Project): LocalContext {
  return {
    head,
    primary: current,
    observation: {
      scope: "local",
      fresh: false,
      head,
      primary: {
        status: "available",
        tip: head,
        remote: "origin",
        ref: "refs/remotes/origin/main",
      },
    },
  };
}

export function encodedSnapshot(current: Project, staged = false) {
  const blobs = new Map<string, Uint8Array>();
  const entries = [...current.files].map(([path, bytes]) => {
    const object = gitObject("blob", bytes, "sha1");
    blobs.set(object, bytes);
    return staged
      ? `100644 ${object} 0\t${path}\0`
      : `100644 blob ${object}\t${path}\0`;
  });
  const directories = new Set(
    [...current.files.keys()].flatMap((path) => {
      const parts = path.split("/");
      return parts
        .slice(0, -1)
        .map((_part, index) => parts.slice(0, index + 1).join("/"));
    }),
  );
  const trees = [...directories]
    .map((path) => {
      const prefix = path + "/";
      const files = new Map(
        [...current.files]
          .filter(([file]) => file.startsWith(prefix))
          .map(([file, bytes]) => [file.slice(prefix.length), bytes]),
      );
      return `040000 tree ${directoryTree(files)}\t${path}\0`;
    })
    .join("");
  return { listing: entries.join(""), blobs, trees };
}

export function bootstrapBytes(current: Project): Uint8Array {
  return Buffer.from(canonical(current.ideas.get(id)!.bootstrap));
}
