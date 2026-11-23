import { lstat, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { git } from "../src/repository.js";
import { materialize, scratch } from "../test/fixtures.js";

export * from "../test/fixtures.js";

async function ownedRepository(root: string): Promise<void> {
  const relativeRoot = relative(resolve(".test-work"), root);
  if (
    !relativeRoot ||
    relativeRoot === ".." ||
    relativeRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativeRoot) ||
    !(await lstat(join(root, ".git"))).isDirectory() ||
    resolve(await git(root, ["rev-parse", "--show-toplevel"])) !== root
  )
    throw new Error(
      "Native writes require an owned, independently initialized fixture repository.",
    );
}

export async function repository(
  options: { idea?: boolean } = {},
): Promise<{ root: string; remote: string }> {
  if (process.env.SILVERMOON_NATIVE_TEST !== "1")
    throw new Error("Real Git fixtures require explicit native-test opt-in.");
  const directory = await scratch();
  const root = join(directory, "work");
  const remote = join(directory, "primary.git");
  await mkdir(root);
  await mkdir(remote);
  await git(remote, ["init", "--bare", "--initial-branch=main"]);
  await git(root, ["init", "--initial-branch=main"]);
  await ownedRepository(root);
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
  if (process.env.SILVERMOON_NATIVE_TEST !== "1")
    throw new Error("Real Git writes require explicit native-test opt-in.");
  await ownedRepository(root);
  await git(root, ["add", "--all"]);
  await git(root, ["commit", "--allow-empty", "-m", "Fixture candidate"]);
  await git(root, ["push", "--set-upstream", "origin", "main"]);
}
