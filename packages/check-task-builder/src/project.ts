import { readFile } from "node:fs/promises";
import { createTaskProject } from "@silvermoon-work/task-builder/init";
import { memoryTree, readBytes } from "@silvermoon-work/task-builder/tree";
import { parse, stringify } from "yaml";
import { checkBuildSchemaUri } from "./index.js";

export interface CheckProjectOptions {
  readonly name?: string;
  readonly taskName?: string;
}

export async function version(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return manifest.version;
}

export async function createCheckProject(options: CheckProjectOptions = {}) {
  const base = createTaskProject(options);
  const manifest = JSON.parse(
    Buffer.from(await readBytes(base, "package.json", 65_536)).toString(),
  ) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const config = parse(
    Buffer.from(await readBytes(base, "task.build.yaml", 65_536)).toString(),
  ) as {
    outDirectory: string;
    include: unknown;
    $schema?: string;
  };
  config.$schema = checkBuildSchemaUri;
  config.include = [{ from: "assets/**", to: "resources/" }];
  const release = await version();
  const files = {
    "package.json": `${JSON.stringify(
      {
        ...manifest,
        packageManager: "pnpm@11.22.0",
        dependencies: {
          "@silvermoon-work/check-task-sdk": release,
          "@sinclair/typebox": "0.34.52",
        },
        devDependencies: {
          ...manifest.devDependencies,
          "@silvermoon-work/check-task-builder": release,
          "@silvermoon-work/task-builder-cli": "0.2.0-rc.0",
        },
        scripts: {
          typecheck: "tsc --project tsconfig.json",
          build: "check-task-builder build",
          car: `task-builder car ${config.outDirectory}/task.yaml --output ${config.outDirectory}.car`,
        },
      },
      null,
      2,
    )}\n`,
    "pnpm-workspace.yaml": stringify({
      allowBuilds: { esbuild: true },
      minimumReleaseAgeExclude: ["@silvermoon-work/*"],
    }),
    ".gitignore": Buffer.from(
      await readBytes(base, ".gitignore", 65_536),
    ).toString(),
    "tsconfig.json": Buffer.from(
      await readBytes(base, "tsconfig.json", 65_536),
    ).toString(),
    "check.build.yaml": stringify({
      ...config,
      source: { entry: "src/main.ts", contract: "src/contract.ts" },
    }),
    "src/contract.ts": `import { Type, type Static } from "@sinclair/typebox";
import { createCheckContract } from "@silvermoon-work/check-task-sdk/contracts";

export const Input = Type.Object({ text: Type.String() }, { additionalProperties: false });
export type Input = Static<typeof Input>;
export const ProblemCode = Type.Union([Type.Literal("text-mismatch")]);
export type ProblemCode = Static<typeof ProblemCode>;
export default createCheckContract(Input, ProblemCode);
`,
    "src/main.ts": `import { runCheck } from "@silvermoon-work/check-task-sdk";
import contract from "./contract.js";

runCheck(contract, async (input, context, reportProblem) => {
  const node = await context.bundle.root.resolve("resources/expected.txt").read();
  if (node.kind !== "file") throw new Error("Expected standard must be a file.");
  const expected = await new Response(node.content).text();
  if (input.text !== expected.trimEnd()) {
    reportProblem("text-mismatch", \`Text \${JSON.stringify(input.text)} must equal \${JSON.stringify(expected.trimEnd())}.\`);
  }
});
`,
    "assets/expected.txt": "hello\n",
    "references/check.md":
      "# Text standard\n\nThe supplied text must equal the bundled expected text (ignoring its final newline).\n",
    "references/problems/text-mismatch.md":
      "# Text mismatch\n\nReplace the input text with the exact bundled expected text.\n",
    "README.md":
      '# Check project\n\nInstall with `pnpm install`, edit `src/contract.ts`, `src/main.ts`, and `references/`, then run `pnpm typecheck` and `pnpm build`.\n\nUse input `{"text":"hello"}` to pass and `{"text":"other"}` for a normal nonpassing result. Missing resources or thrown errors are execution faults, not problems.\n',
  };
  return memoryTree(
    new Map(
      Object.entries(files).map(([path, text]) => [path, Buffer.from(text)]),
    ),
  );
}
