import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import type { Project } from "../src/commands.js";
import { convention, stableSeries } from "../src/convention.js";
import type { ProblemCode } from "../src/contract.js";
import { Files } from "../src/files.js";
import { testEvidence } from "./fixture.js";

it("selects stable compatibility series without treating prereleases as stable", () => {
  expect(stableSeries("1.2.3")).toBe("1.x");
  expect(stableSeries("0.2.3")).toBe("0.2.x");
  expect(stableSeries("0.0.3")).toBe("0.0.3");
  expect(() => stableSeries("invalid")).toThrow("不是稳定版本");
  expect(() => stableSeries("1.2.3-rc.0")).toThrow("不是稳定版本");
});
async function check(
  patch: Record<string, unknown> = {},
  data: Record<string, string> = {},
) {
  const evidence = await testEvidence();
  const content: Record<string, string> = {
    "AGENTS.md": Buffer.from(evidence.agents).toString("utf8"),
    "README.md": "Readme",
    "CONTRIBUTING.md": "Contribute",
    "docs/agent-project.md": "Guidance",
    ".gitignore": "node_modules/\ndist/\ncoverage/\n.env\n.env.*\n",
    ".git/config":
      '[remote "origin"]\nurl=https://git.acme.org/a/b\n[branch "main"]\nmerge=refs/heads/main',
    ...data,
  };
  const files = new Files(resolve("."), new AbortController().signal);
  files.paths.push(...Object.keys(content));
  vi.spyOn(files, "text").mockImplementation((path) =>
    Promise.resolve(content[path]!),
  );
  vi.spyOn(files, "optionalText").mockImplementation((path) =>
    Promise.resolve(content[path]),
  );
  const project: Project = {
    directory: "",
    manifest: {
      name: "fixture",
      private: true,
      engines: { node: ">=22" },
      ...patch,
    },
    sources: ["src/index.ts"],
    tests: [],
  };
  const problems: { code: ProblemCode; brief: string }[] = [];
  await convention(
    files,
    [project],
    evidence,
    (code, brief) => problems.push({ code, brief }),
    null,
  );
  return problems;
}
it("reports empty free documentation instead of accepting mere file presence", async () => {
  expect(await check({}, { "README.md": " \n" })).toContainEqual({
    code: "document-mismatch",
    brief: "README.md: 文件为空",
  });
});
it.each([
  ["missing", undefined, "environment-missing", "engines.node 缺失"],
  ["array", [], "environment-unconfirmed", "静态对象"],
  ["invalid range", { node: "latest" }, "environment-unconfirmed", "无法解析"],
  ["empty range", { node: "<0.0.0" }, "environment-unconfirmed", "无法解析"],
])(
  "reports runtime declaration defects before minimum comparisons: %s",
  async (_name, engines, code, reason) => {
    expect(await check({ engines })).toContainEqual({
      code,
      brief: expect.stringContaining(reason) as unknown,
    });
  },
);
it("requires an exact stable developer Node and reports conflicting Volta and nvm choices", async () => {
  expect(await check({}, { ".node-version": "24.11.0-rc.0" })).toContainEqual({
    code: "environment-mismatch",
    brief: ".node-version 必须声明精确稳定版本",
  });
  const problems = await check(
    { volta: { node: "22.15.0" } },
    {
      ".node-version": "24.11.0",
      ".nvmrc": "22.15.0",
    },
  );
  expect(problems).toContainEqual({
    code: "environment-mismatch",
    brief: ".nvmrc 与根 .node-version 不一致",
  });
  expect(problems).toContainEqual({
    code: "environment-mismatch",
    brief: "Volta 默认 Node 与 .node-version 不一致",
  });
});
