import { type Files, Unconfirmed } from "./files.js";

export async function repository(files: Files): Promise<{
  github: boolean;
  primary: string;
}> {
  const config = await files.optionalText(".git/config");
  if (!config)
    throw new Unconfirmed(
      "根内 .git/config 不可用，不能确认 Git origin/主分支；不向根外追踪 gitdir",
    );
  if (/^\s*(?:\[include|\[includeIf|worktreeConfig\s*=)/im.test(config))
    throw new Unconfirmed("Git include/worktree 配置不在根内静态支持范围");
  let section = "";
  let origin: string | undefined;
  let primary: string | undefined;
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[#;]/.test(line)) continue;
    if (line.startsWith("[")) {
      section = line;
      continue;
    }
    const pair = /^([a-zA-Z-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!pair) throw new Unconfirmed("Git 配置语法无法确认");
    if (section === '[remote "origin"]' && pair[1] === "url") {
      if (origin) throw new Unconfirmed("多个 origin URL");
      origin = pair[2];
    }
    if (
      section === '[branch "main"]' &&
      pair[1] === "merge" &&
      pair[2] === "refs/heads/main"
    )
      primary = "main";
  }
  if (!origin) throw new Unconfirmed("Git origin 缺失");
  if (
    !/^(?:https:\/\/|git@)[A-Za-z0-9.-]+[:/][A-Za-z0-9._/-]+(?:\.git)?$/.test(
      origin,
    )
  )
    throw new Unconfirmed("Git origin URL 格式/凭据无法安全确认");
  const github = /^(?:https:\/\/github\.com\/|git@github\.com:)/.test(origin);
  if (!primary) {
    const symbolic = await files.optionalText(".git/refs/remotes/origin/HEAD");
    const match = /^ref: refs\/remotes\/origin\/([A-Za-z0-9._/-]+)\s*$/.exec(
      symbolic ?? "",
    );
    primary = match?.[1];
  }
  if (!primary) throw new Unconfirmed("主分支缺少根内明确声明/remote HEAD");
  return { github, primary };
}
