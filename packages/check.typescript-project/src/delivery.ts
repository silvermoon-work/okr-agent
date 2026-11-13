import { type Project } from "./commands.js";
import { type Files, glob, record, Unconfirmed } from "./files.js";
import { jsonc, tsconfig, tsIncludes } from "./static.js";

type Report = (status: "mismatch" | "unconfirmed", brief: string) => void;
export async function configuredDelivery(
  files: Files,
  project: Project,
  path: string,
  entries: Record<string, Record<string, unknown>>,
  report: Report,
) {
  const raw = jsonc(await files.text(path));
  const own = record(raw.compilerOptions ?? {});
  const config = await tsconfig(files, path);
  if (
    typeof own.rootDir !== "string" ||
    typeof own.outDir !== "string" ||
    config.references.length
  )
    throw new Unconfirmed(
      `${path}: 有限输出关系要求在该配置显式声明 rootDir/outDir，且无 project references`,
    );
  for (const key of [
    "declarationDir",
    "rootDirs",
    "outFile",
    "mapRoot",
    "sourceRoot",
    "jsx",
  ])
    if (config.options[key] !== undefined)
      throw new Unconfirmed(`${path}: ${key} 超出已支持的输出/映射关系`);
  if (
    config.options.emitDeclarationOnly === true ||
    config.options.inlineSourceMap === true
  )
    report(
      "mismatch",
      `${path}: 必须同时生成独立 JavaScript 与 declaration 的外部映射`,
    );
  const root = files.path(files.parent(path), own.rootDir);
  const out = files.path(files.parent(path), own.outDir);
  if (
    !root ||
    !out ||
    root === out ||
    out.startsWith(`${root}/`) ||
    root.startsWith(`${out}/`)
  )
    throw new Unconfirmed(`${path}: 输入/输出目录必须独立且非包根`);
  if (
    project.directory &&
    (!root.startsWith(`${project.directory}/`) ||
      !out.startsWith(`${project.directory}/`))
  )
    throw new Unconfirmed(`${path}: 输出关系不能越过包边界`);
  const included = files.paths.filter(
    (source) =>
      /\.[cm]?tsx?$/.test(source) &&
      !/\.d\.[cm]?ts$/.test(source) &&
      tsIncludes(files, config, source),
  );
  if (
    included.some((source) => !source.startsWith(`${root}/`)) ||
    project.sources.some((source) => !included.includes(source)) ||
    project.tests.some((source) => included.includes(source))
  )
    report(
      "mismatch",
      `${path}: 必须纳入全部适用源码，且不编译测试或 rootDir 外文件`,
    );
  if (included.some((source) => !/\.(?:ts|mts)$/.test(source)))
    throw new Unconfirmed(
      `${path}: 首版 npm ESM 输出关系仅支持 .ts/.mts，不推测 JSX/CJS`,
    );
  const list = project.manifest.files;
  if (!Array.isArray(list) || list.some((item) => typeof item !== "string"))
    throw new Unconfirmed("files 不是静态字符串 allowlist");
  const relative = (source: string) =>
    project.directory ? source.slice(project.directory.length + 1) : source;
  const allowed = (source: string) =>
    (list as string[]).some(
      (pattern) =>
        glob(pattern, relative(source)) ||
        relative(source).startsWith(`${pattern.replace(/\/$/, "")}/`),
    );
  const outputs = included.map((source) => {
    const stem = `${out}/${source.slice(root.length + 1).replace(/\.(?:ts|mts)$/, "")}`;
    const javascript = `${stem}${source.endsWith(".mts") ? ".mjs" : ".js"}`;
    const declaration = `${stem}${source.endsWith(".mts") ? ".d.mts" : ".d.ts"}`;
    for (const target of [
      source,
      javascript,
      `${javascript}.map`,
      declaration,
      `${declaration}.map`,
    ])
      if (!allowed(target))
        report(
          "mismatch",
          `files 未选择配置预期产物/映射所需真实源文件 ${relative(target)}`,
        );
    return {
      javascript: `./${relative(javascript)}`,
      declaration: `./${relative(declaration)}`,
    };
  });
  for (const [name, entry] of Object.entries(entries))
    if (
      typeof entry.import === "string" &&
      typeof entry.types === "string" &&
      !outputs.some(
        (output) =>
          entry.import === output.javascript &&
          entry.types === output.declaration,
      )
    )
      report(
        "mismatch",
        `${path}: exports ${name} 的 import/types 不对应同一源码的配置预期输出`,
      );
  if (
    project.tests.some(allowed) ||
    files.paths.some(
      (source) =>
        /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|.*\.test\.[^/]+|.*\.spec\.[^/]+)$/.test(
          source,
        ) && allowed(source),
    )
  )
    report("mismatch", "files 实际选择了开发测试或秘密配置");
  if (
    files.paths.some(
      (source) =>
        /(?:^|\/)\.npmignore$/.test(source) &&
        (!project.directory || source.startsWith(`${project.directory}/`)),
    )
  )
    throw new Unconfirmed(
      "有限交付 profile 不解释 .npmignore 对真实选择集合的覆盖",
    );
}
