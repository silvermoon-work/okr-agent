import type {
  CheckContext,
  ProblemReporter,
} from "@silvermoon-work/check-task-sdk";
import type { Input, ProblemCode } from "./contract.js";
import { inspect } from "./inspect.js";
import { publicMetadata, type Metadata } from "./metadata.js";

export function projectCheck(
  metadata: (signal: AbortSignal) => Metadata = publicMetadata,
) {
  return async (
    input: Input,
    context: CheckContext,
    report: ProblemReporter<ProblemCode>,
  ) => {
    const resource = async (name: string) => {
      const asset = await context.bundle.root
        .resolve(`resources/assets/${name}`)
        .read();
      if (asset.kind !== "file")
        throw new Error(`Canonical ${name} asset is not a file`);
      return new Uint8Array(await new Response(asset.content).arrayBuffer());
    };
    const [agents, publisher, publishWorkflow, ciWorkflow] = await Promise.all([
      resource("AGENTS.md"),
      resource("npm-publish.mjs"),
      resource("npm-publish.yaml"),
      resource("npm-ci.yaml"),
    ]);
    await inspect(input, context.signal, report, {
      agents,
      publisher,
      publishWorkflow,
      ciWorkflow,
      metadata: metadata(context.signal),
    });
  };
}
