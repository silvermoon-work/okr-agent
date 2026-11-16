import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  defineChecker,
  type CheckerResult,
} from "@silvermoon-work/check-task-sdk";
import { Input, type ProblemCode } from "../contract.js";
import { readProjectFile } from "../read-file.js";

const Configuration = Type.Object({
  packages: Type.Array(Type.String({ pattern: "\\S" }), { minItems: 1 }),
});

export const workspace = defineChecker({
  target: Input,
  check: async (target, signal): Promise<CheckerResult<never, ProblemCode>> => {
    const path = join(target.projectDirectory, "pnpm-workspace.yaml");
    const invalid = (reason: string): CheckerResult<never, ProblemCode> => ({
      pass: false,
      problems: [
        {
          code: "workspace-configuration-invalid",
          brief: `${path}: ${reason}`,
        },
      ],
    });
    signal.throwIfAborted();
    try {
      const info = await lstat(path);
      signal.throwIfAborted();
      if (!info.isFile() && !info.isSymbolicLink())
        return invalid("必须是普通文件。");
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return invalid("monorepo 必须提供 pnpm-workspace.yaml。");
      throw error;
    }
    const text = await readProjectFile(path, signal);
    const document = parseDocument(text, { uniqueKeys: true });
    if (document.errors.length)
      return invalid(`不是合法 YAML：${document.errors[0]?.message}`);
    let value: unknown;
    try {
      value = document.toJS({ maxAliasCount: 32 });
    } catch (error) {
      if (
        error instanceof ReferenceError &&
        error.message.startsWith("Unresolved alias")
      )
        return invalid(error.message);
      throw error;
    }
    if (!Value.Check(Configuration, value))
      return invalid(
        "必须是 YAML 对象，且显式声明非空 packages 数组，每项为非空白字符串。",
      );
    return { pass: true, children: [] };
  },
});
